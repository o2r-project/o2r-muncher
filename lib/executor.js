/*
 * (C) Copyright 2017 o2r project
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 */
const debug = require('debug')('muncher:executor');
const debugBuild = require('debug')('muncher:executor:build');
const debugRun = require('debug')('muncher:executor:run');
const Promise = require('bluebird');
const fs = require('fs');
const fse = require('fs-extra');
const Docker = require('dockerode');
const yaml = require('yamljs');
const yamlWriter = require('write-yaml');
const Bag = require('bagit');
const Stream = require('stream');
const archiver = require('archiver');
const clone = require('clone');
const path = require('path');
const get = require('lodash.get');
const isArray = require('util').isArray;
const urlJoin = require('url-join');
const isString = require('lodash.isstring');
const util = require('util');
const filesize = require('filesize');
const objectPath = require('object-path');
const tarlist = require('tar').list;

const config = require('../config/config');
const Job = require('../lib/model/job');
const checker = require('erc-checker/index').ercChecker;
const manifest = require('../lib/manifest');
const saveImageFromJob = require('../lib/image').saveImageFromJob;
const synchroniseImageTags = require('../lib/image').synchroniseImageTags;

const steps = [
  'validate_bag',
  'generate_configuration',
  'validate_compendium',
  'generate_manifest',
  'image_prepare',
  'image_build',
  'image_execute',
  'check',
  'image_save',
  'cleanup'];

// FIXME: this is a hack and should be replaced by path+named volume asap, see https://github.com/moby/moby/issues/32582
var volume_full_path = null;
if (config.fs.volume) {
  docker = new Docker();
  vol = docker.getVolume(config.fs.volume);

  vol.inspect((err, data) => {
    if (err) {
      debug("Error inspecting volume, manifest generation might not work: %s", err);
    } else {
      debug("Inspecting volume to get full path: %o", data);
      volume_full_path = data.Mountpoint;
      delete docker;
    }
  });

  debug("Resolved volume name %s to full path %s", config.fs.volume, volume_full_path);
}

/**
 * Create Executor for given job identifier and compendium
 * @constructor
 * @param {string} jobId - The identifier of the job
 * @param {string} compendium - The compendium
 */
function Executor(jobId, compendium) {
  if (!jobId) {
    debug('Job id missing');
    return false;
  }
  this.jobId = jobId;
  this.compendium = compendium;

  // https://nodejs.org/api/process.html#process_event_unhandledrejection
  process.on('unhandledRejection', (reason, p) => {
    debug('[%s] Unhandled Rejection: \nPromise: %o\nReason: %o', this.jobId, p, reason);
  });

  // setup Docker client with default options
  var docker = new Docker();
  debug('[%s] Docker client set up: %O', this.jobId, docker);

  /*
   * https://docs.mongodb.com/manual/reference/operator/update/push/
   */
  this.updateStep = (step, status, text, callback) => {
    debug('[%s] Updating step %s: "%s" "%s"', this.jobId, step, status || "", text || "");
    let update = {};
    if (status) {

      let d = new Date();
      switch (status) {
        case 'skipped':
          update['$set'] = {
            ['steps.' + step + '.status']: status,
            ['steps.' + step + '.start']: d,
            ['steps.' + step + '.end']: d
          };
          break;
        case 'running':
          update['$set'] = {
            ['steps.' + step + '.status']: status,
            ['steps.' + step + '.start']: d
          };
          break;
        case 'success':
        case 'failure':
          update['$set'] = {
            ['steps.' + step + '.status']: status,
            ['steps.' + step + '.end']: d
          };
          break;
        default:
          update['$set'] = {
            ['steps.' + step + '.status']: status
          };
          break;
      }
    }

    if (text) {
      if (isArray(text)) {
        texts = text.map(t => {
          if (isString(t)) return (t);
          else return (JSON.stringify(t));
        });
        update['$push'] = { ['steps.' + step + '.text']: { '$each': texts } };
      } else {
        t = text;
        if (!isString(text)) t = JSON.stringify(t);
        update['$push'] = { ['steps.' + step + '.text']: t };
      }
    }

    Job.updateOne({ id: this.jobId }, update, (err) => {
      if (err) callback(err);
      else callback();
    });
  };

  this.updateStatus = (status, cb) => {
    debug('[%s] Updating status to %s', this.jobId, status);
    Job.updateOne({ id: this.jobId }, { $set: { status: status } }, (err) => {
      if (err) cb(err);
      else cb();
    });
  }

  this.begin = (passon) => {
    return new Promise((fulfill, reject) => {
      debug('[%s] Beginning...', this.jobId);
      this.updateStatus('running', (err) => {
        if (err) {
          reject(err);
        }
        else {
          fulfill(passon);
        }
      });
    });
  }

  this.copyFiles = (passon) => {
    return new Promise((fulfill, reject) => {
      let job_path = path.join(config.fs.job, this.jobId);
      let compendium_path = path.join(config.fs.compendium, compendium.id);
      debug('[%s] Copying job files to %s from %s (skipping display file; skipping the image tarball file if it exists)', this.jobId, job_path, compendium_path);

      let filteredFiles = [
        config.bagtainer.imageTarballFile,
        get(this.compendium, config.bagtainer.displayFilePath)
      ];

      fse.copy(compendium_path, job_path, {
        filter: function (p) {
          pathIncludesFilteredFile = filteredFiles.map(f => p.includes(f));
          if (pathIncludesFilteredFile.reduce((accumulator, currentValue) => accumulator || currentValue)) {
            debug('[%s] Filtering file %s (not copying to job directory)', this.jobId, p);
            return false;
          }
          return true;
        }
      }, (err) => {
        if (err) {
          debug('[%s] error copying compendium files to job: %o', err);
          reject(new Error('error copying compendium files for job'));
        } else {
          passon.jobPath = job_path;
          passon.compendiumPath = compendium_path;
          fulfill(passon);
        }
      });
    });
  }

  this.end = (passon) => {
    if (!passon) {
      debug('No passon passed to "end", doing nothing.');
      return Promise.resolve(true);
    }

    return new Promise((fulfill, reject) => {
      debug('[%s] Ending... determining overall status now', this.jobId);

      Job.findOne({ id: this.jobId }, (err, job) => {
        if (err) {
          reject(err);
        } else if (job === null) {
          reject(new Error('no job found'));
        } else {
          let finalStatus = 'success'; // if state of all steps is success

          // if at least one step is failure, the overall state is failure
          for (let step of steps) {
            //debug('[%s] step # %s: %s', step, job.steps[step]);
            if (job.steps[step].status && (job.steps[step].status === 'failure')) {
              finalStatus = 'failure';
              debug('[%s] step %s failed, so overall status is also %s', this.jobId, step, finalStatus);
              break;
            }
          }

          this.updateStatus(finalStatus, (err) => {
            if (err) {
              reject(err);
            }
            else {
              debug('[%s] Final status is %s', this.jobId, finalStatus);
              fulfill(passon);
            }
          });
        }
      });
    });
  }

  this.validateBag = (passon) => {
    return new Promise((fulfill, reject) => {
      if (!this.compendium.bag) {
        debug('[%s] Not a bag, not attempting validation.', this.jobId);
        this.updateStep('validate_bag', 'skipped', 'Not a bag', (err) => {
          if (err) reject(err);
          fulfill(passon);
        });
      } else if (config.bagtainer.validateBagBeforeExecute) {
        debug('[%s] Load and validate bag', this.jobId);

        this.updateStep('validate_bag', 'running', null, (err) => {
          if (err) {
            debug('[%s] error updating step: %o', err);
            reject(err);
            return;
          }

          let bag = new Bag(passon.jobPath);
          bag.validate(config.bagit.validateFast)
            .then(res => {
              debug('[%s] Bag is valid!', this.jobId);
              this.updateStep('validate_bag', 'success', res, (err) => {
                if (err) {
                  debug('[%s] error updating step: %s', this.jobId, err);
                  reject(err);
                  return;
                }

                fulfill(passon);
              });
            }).catch(e => {
              if (config.bagit.failOnValidationError.execute) {
                debug('[%s] Bag invalid, failing this step: %s', this.jobId, e);
                this.updateStep('validate_bag', 'failure', e.message, (err) => {
                  if (err) reject(err);
                  else reject(e);
                });
              } else {
                debug('[%s] Bag invalid but _not_ failing this step, setting result to %s. The error was: %s', this.jobId, config.bagit.stepResultAfterValidationError, e);
                this.updateStep('validate_bag', config.bagit.stepResultAfterValidationError, e.message.trim(), (err) => {
                  if (err) reject(err);
                  else fulfill(passon);
                });
              }
            });
        });
      } else {
        debug('[%s] Bag validation disabled', this.jobId);
        this.updateStep('validate_bag', 'skipped', 'Bag validation during job execution is disabled', (err) => {
          if (err) reject(err);
          fulfill(passon);
        });
      }
    });
  }

  copyFileFromJobToCompendium = function (file, job_id, compendium_id, isBag, callback) {
    let filePathJob, filePathCompendium;
    if (isBag) {
      filePathJob = path.join(config.fs.job, job_id, config.bagit.payloadDirectory, file);
      filePathCompendium = path.join(config.fs.compendium, compendium_id, config.bagit.payloadDirectory, file);
    } else {
      filePathJob = path.join(config.fs.job, job_id, file);
      filePathCompendium = path.join(config.fs.compendium, compendium_id, file);
    }

    debug('[%s] copy file %s from job %s to compendium %s (isBag? %s): %s > %s',
      job_id, file, job_id, compendium_id, isBag, filePathJob, filePathCompendium);
    fse.copy(filePathJob, filePathCompendium, (err) => {
      if (err) {
        debug('[%s] Error copying file: %s', job_id, error);
        callback(error);
      } else {
        callback();
      }
    });
  }

  this.createOrLoadConfigurationFile = (passon) => {
    return new Promise((fulfill, reject) => {
      this.updateStep('generate_configuration', 'running', null, (err) => {
        if (err) reject(err);
        debug('[%s] creating or loading configuration file for %s', this.jobId, this.compendium.id);

        let jobPayloadDir = passon.jobPath;
        if (this.compendium.bag)
          jobPayloadDir = path.join(passon.jobPath, config.bagit.payloadDirectory);
        let configFilePathJob = path.join(jobPayloadDir, config.bagtainer.configFile.name);

        try {
          let configuration = yaml.load(configFilePathJob);
          debug('[%s] ERC configuration found at ', this.jobId, configFilePathJob);
          this.updateStep('generate_configuration', 'skipped', 'configuration file already present', (err) => {
            if (err) reject(err);
            else {
              passon.configuration = configuration;
              fulfill(passon);
            }
          });
        } catch (e) {
          debug('[%s] (probably expected) error loading file %s: %s', this.jobId, configFilePathJob, e.message);
          this.updateStep('generate_configuration', 'running', 'configuration file not found, generating it...', (err) => {
            if (err) reject(err);
            else {
              // make main and display file relative to payload dir (metadata extraction probably has them starting with /data)
              fullMain = path.resolve(passon.jobPath, get(this.compendium, config.bagtainer.mainFilePath));
              fullDisplay = path.resolve(passon.jobPath, get(this.compendium, config.bagtainer.displayFilePath));

              var configuration = {
                id: this.compendium.id.toString(),
                spec_version: config.bagtainer.spec_version.default.toString(),
                // get main and display from the compendium, make them relative to the payload directory
                main: path.relative(jobPayloadDir, fullMain),
                display: path.relative(jobPayloadDir, fullDisplay),
                licenses: get(this.compendium, config.bagtainer.licensesPath),
                //execution: null
              };
              passon.configuration = configuration;
              debug('[%s] Generated configuration:\n%O', passon.configuration);

              let isBag = this.compendium.bag, cid = this.compendium.id, jid = this.jobId;
              let stepUpdate = this.updateStep;

              // save it to job directory
              yamlWriter(configFilePathJob, configuration, function (error) {
                if (error) {
                  debug('[%s] Error saving file: %s', this.jobId, error);
                  stepUpdate('generate_configuration', 'failure', 'error writing configuration file to job directory', (err) => {
                    if (err) reject(err);
                    else reject(new Error('error writing configuration file to job directory: ' + error.message));
                  });
                } else {
                  // copy it to compendium directory
                  copyFileFromJobToCompendium(config.bagtainer.configFile.name, jid, cid, isBag, (err) => {
                    if (err) reject(err);
                    else {
                      stepUpdate('generate_configuration', 'success', 'Saved configuration file to job and compendium', (err) => {
                        if (err) reject(err);
                        fulfill(passon);
                      });
                    }
                  });
                }
              });
            }
          });
        }
      });
    });
  };

  this.saveLogFile = function (compendiumId, jobId, step, isBag, stepUpdate, callback) {
    baseDir = null;
    if (isBag) {
      baseDir = path.join(config.fs.compendium, compendiumId, config.bagit.payloadDirectory);
    } else {
      baseDir = path.join(config.fs.compendium, compendiumId);
    }
    targetFile = path.join(baseDir, config.meta.dir, step + '.log');
    debug('[%s] Saving log file for step %s to compendium %s: %s', jobId, step, compendiumId, targetFile);

    Job.findOne({ id: jobId }).select('steps').lean().exec((err, job) => {
      if (err) {
        debug('Error getting job to save log: %o', err);
        callback(err);
      } else {
        if (job === null) {
          callback(new Error('no job found with id ' + jobId));
        }
        else {
          theLog = objectPath.get(job, 'steps.' + step + '.text');
          fs.truncate(targetFile, 0, function () {
            fs.writeFile(targetFile, theLog.join('\n'), function (err) {
              if (err) {
                debug('[%s] Error saving log to file: %o', jobId, err);
                err.message = 'Error saving log to file for ' + step;
                callback(err);
              } else {
                debug('[%s] Saved log to file %s', jobId, targetFile);
                stepUpdate('generate_manifest', null, 'Saved manifest generation log to ' + path.relative(baseDir, targetFile), (error) => {
                  if (error) reject(error);
                  else callback();
                });
              }
            });
          });
        }
      }
    });
  }

  /*
   *  Check against compendium specification: https://github.com/o2r-project/erc-spec
   */
  this.validateCompendium = (passon) => {
    return new Promise((fulfill, reject) => {
      if (config.bagtainer.validateCompendiumBeforeExecute) {
        debug('[%s] validating compendium %s', this.jobId, this.compendium.id);
        this.updateStep('validate_compendium', 'running', null, (err) => {
          if (err) reject(err);

          debug('[%s] Validating configuration:\n%O', this.jobId, passon.configuration);

          // validate config file
          let valid = true;

          if (!passon.configuration.id || passon.configuration.id.length === 0) {
            valid = false;
            if (config.bagtainer.failOnValidationError) {
              this.updateStep('validate_compendium', 'failure', '"id" required in config file', (err) => {
                if (err) reject(err);
                reject(new Error('"id" required in config file'));
              });
            } else {
              debug('"id" in config file is missing, but not failing the execution.');
            }
          } else if (!config.bagtainer.id_is_valid(passon.configuration.id)) {
            valid = false;
            let msg = 'id "' + passon.configuration.id + '" is not allowed (' + config.bagtainer.id_regex.toString() + ')';

            if (config.bagtainer.failOnValidationError) {
              this.updateStep('validate_compendium', 'failure', msg, (err) => {
                if (err) reject(err);
                reject(new Error(msg));
              });
            } else {
              debug(msg + ' but not failing the execution.');
            }
          }

          if (!passon.configuration.spec_version || passon.configuration.id.spec_version === 0) {
            valid = false;
            if (config.bagtainer.failOnValidationError) {
              this.updateStep('validate_compendium', 'failure', '"spec_version" required in config file', (err) => {
                if (err) reject(err);
                reject(new Error('"spec_version" required in config file'));
              });
            } else {
              debug('"spec_version" in config file is missing, but not failing the execution.');
            }
          } else if (config.bagtainer.spec_version.supported.indexOf(passon.configuration.spec_version.toString()) == -1) {
            valid = false;
            let msg = '"version" ' + passon.configuration.spec_version + ' is not supported (' +
              JSON.stringify(config.bagtainer.spec_version.supported) + ')';

            if (config.bagtainer.failOnValidationError) {
              this.updateStep('validate_compendium', 'failure', msg, (err) => {
                if (err) reject(err);
                reject(new Error(msg));
              });
            } else {
              debug(msg + ' but not failing the execution.');
            }
          }

          if (!passon.configuration.main) {
            valid = false;
            if (config.bagtainer.failOnValidationError) {
              this.updateStep('validate_compendium', 'failure', '"main" required in config file', (err) => {
                if (err) reject(err);
                reject(new Error('"main" required in config file'));
              });
            } else {
              debug('"main" in config file is missing, but not failing the execution.');
            }
          }

          if (!passon.configuration.display) {
            valid = false;
            if (config.bagtainer.failOnValidationError) {
              this.updateStep('validate_compendium', 'failure', '"display" required in config file', (err) => {
                if (err) reject(err);
                reject(new Error('"display" required in config file'));
              });
            } else {
              debug('"display" in config file is missing, but not failing the execution.');
            }
          }

          if (!passon.configuration.licenses) {
            valid = false;
            if (config.bagtainer.failOnValidationError) {
              this.updateStep('validate_compendium', 'failure', '"licenses" required in config file', (err) => {
                if (err) reject(err);
                reject(new Error('"licenses" required in config file'));
              });
            } else {
              debug('"licenses" in config file is missing, but not failing the execution.');
            }
          }

          if (valid) { // config file is valid!
            this.updateStep('validate_compendium', 'success', 'all checks passed', (err) => {
              if (err) reject(err);
              fulfill(passon);
            });
          } else if (!config.bagtainer.failOnValidationError) {
            debug('Configuration file is _IN_valid, but do not reject it.');
            this.updateStep('validate_compendium', 'failure', 'compendium is invalid, but execution may continue', (err) => {
              if (err) reject(err);
              fulfill(passon);
            });

          }
        });
      } else {
        debug('[%s] Compendium validation disabled', this.jobId);
        this.updateStep('validate_compendium', 'skipped', 'compendium validation during job execution is disabled', (err) => {
          if (err) reject(err);
          fulfill(passon);
        });
      }
    });
  };

  /*
   *  Create Dockerfile
   */
  this.generateManifest = (passon) => {
    return new Promise((fulfill, reject) => {
      debug('[%s] Generate manifest file', this.jobId);
      this.updateStep('generate_manifest', 'running', null, (err) => {
        if (err) reject(err);
        else {
          let manifestFile = null;
          let payloadDir = null;
          if (this.compendium.bag) {
            manifestFile = path.join(passon.jobPath, config.bagit.payloadDirectory, config.bagtainer.manifestFile);
            payloadDir = path.join(passon.jobPath, config.bagit.payloadDirectory);
          } else {
            manifestFile = path.join(passon.jobPath, config.bagtainer.manifestFile);
            payloadDir = passon.jobPath;
          }

          let isBag = this.compendium.bag;
          let cid = this.compendium.id;
          let job_id = this.jobId;
          let stepUpdate = this.updateStep;
          let saveLog = this.saveLogFile;

          fs.open(manifestFile, 'r+', (error) => {
            if (error) {
              // check if there are candidates for session description files
              manifestGenerationInputFile = passon.configuration.main;
              fs.readdirSync(passon.jobPath).some((file) => {
                if(config.bagtainer.sessionFiles.includes(file.toLowerCase())) {
                  manifestGenerationInputFile = file;
                  debug('[%s] Found session info file candidate: %s', job_id, file);
                  return(true);
                }
              });
                            
              debug('[%s] Generate manifest using %s and write manifest file to %s', job_id, manifestGenerationInputFile, payloadDir);
              manifest.getGenerationFunction(manifestGenerationInputFile, (err0, generationFunction) => {
                if (err0) {
                  debug('[%s] Error getting generation function: %s', this.jobId, err0);
                  this.updateStep('generate_manifest', 'failure', 'error getting generation function for main file ' + passon.configuration.main,
                    (e) => {
                      if (e) reject(e);
                      else {
                        reject(err0);
                      }
                    });
                } else {
                  debug('[%s] Using generation function %s', this.jobId, generationFunction.fName);

                  generationFunction(job_id,
                    payloadDir,
                    manifestGenerationInputFile,
                    passon.configuration.display,
                    stepUpdate,
                    (err, done) => {
                      if (err) {
                        stepUpdate('generate_manifest', 'failure', 'error generating manifest: ' + err.message,
                          (e) => {
                            if (e) reject(e);
                            else {
                              reject(err);
                            }
                          });
                      } else {

                        fs.open(manifestFile, 'r+', (error1) => {
                          if (error1) {
                            debug('[%s] Manifest file not found at %s: %o', job_id, manifestFile, error);
                            stepUpdate('generate_manifest', 'failure', 'manifest file not found at expected location', (err4) => {
                              if (err4) reject(err4);
                              else {
                                reject(error1);
                              }
                            });
                          } else {
                            debug('[%s] Created manifest at %s: %o', job_id, manifestFile, done);

                            copyFileFromJobToCompendium(config.bagtainer.manifestFile, job_id, cid, isBag, (err5) => {
                              if (err5) reject(err5);
                              else {
                                stepUpdate('generate_manifest', 'success', 'generated manifest', (err6) => {
                                  if (err6) reject(err6);
                                  else {
                                    // save a copy of the manifest generation log to the metadata directory
                                    saveLog(cid, job_id, 'generate_manifest', isBag, stepUpdate, (errSaveLog) => {
                                      if (errSaveLog) reject(errSaveLog);
                                      else {
                                        // save non-standard fields separately but without overwriting other fields
                                        // save the manifest file path to the step metadata
                                        passon.manifestFile = path.relative(payloadDir, manifestFile);

                                        let fields = {};
                                        fields['steps.generate_manifest.manifest'] = passon.manifestFile;

                                        Job.updateOne({ id: job_id }, { $set: fields }, (err2) => {
                                          if (err2) {
                                            debug('Error during manifest step update: %o', err2.message);
                                            reject(err2);
                                          } else {
                                            stepUpdate('generate_manifest', 'success', 'generated manifest', (error3) => {
                                              if (error3) {
                                                debug('[%s] Error during manifest step update: %s', job_id, error);
                                                reject(error3);
                                              } else {
                                                fulfill(passon);
                                              }
                                            });
                                          }
                                        });
                                      }
                                    });
                                  }
                                });
                              }
                            });
                          }
                        });
                      }
                    });
                }
              });
            } else {
            debug('[%s] Manifest file already present at %s', this.jobId, manifestFile);
              this.updateStep('generate_manifest', 'skipped', 'manifest file already present', (err) => {
                if (err) reject(err);
                else {
                  passon.manifestFile = path.relative(payloadDir, manifestFile);
                  fulfill(passon);
                }
              });
            }
          });
        }
      });
    });
  };

  /*
   *  Put Bag-Payload in a tarball, needed to pass on to Docker server
   */
  this.prepareImage = (passon) => {
    return new Promise((fulfill, reject) => {
      this.updateStep('image_prepare', 'running', null, (err) => {
        if (err) reject(err);

        if (!passon.manifestFile) {
          reject(new Error('manifest file is missing'));
          return;
        }

        let fullPath = passon.jobPath;
        if (this.compendium.bag) {
          fullPath = path.join(passon.jobPath, config.bagit.payloadDirectory);
        }
        let manifestFileFullPath = path.join(fullPath, passon.manifestFile);

        debug('[%s] Packing payload for Docker execution using manifest at %s', this.jobId, manifestFileFullPath);

        try {
          let containerFileStats = fs.lstatSync(manifestFileFullPath);

          if (containerFileStats.isFile()) {
            let tarballFileName = path.join(config.payload.tarball.tmpdir, this.jobId + '.tar');
            var tarballFile = fs.createWriteStream(tarballFileName);

            var archive = archiver('tar', {
              gzip: config.payload.tarball.gzip,
              gzipOptions: config.payload.tarball.gzipOptions,
              statConcurrency: config.payload.tarball.statConcurrency
            });

            let currentExecutor = this;

            archive.on('error', function (e) {
              currentExecutor.updateStep('image_prepare', 'failure', 'could not create archive with payload', (err) => {
                if (err) reject(err);
                reject(new Error('could not create archive with payload: ' + e.message));
              });
            });

            // on stream closed we can fulfill the promise
            archive.on('end', function () {
              debug('[%s] Packing payload to file %s completed (%s total bytes)', currentExecutor.jobId, tarballFileName,
                archive.pointer());

              currentExecutor.updateStep('image_prepare', 'success',
                'Created payload, size: ' + filesize(archive.pointer()), (err) => {
                  if (err) reject(err);

                  passon.tarballFile = tarballFileName;
                  fulfill(passon);
                });
            });

            archive.pipe(tarballFile);

            debug('[%s] Packing payload from %s into %s using pattern %s and ignoring %s',
              this.jobId, fullPath, tarballFileName, config.payload.tarball.globPattern, JSON.stringify(config.payload.tarball.ignore));
            archive.glob(config.payload.tarball.globPattern, {
              cwd: fullPath,
              ignore: config.payload.tarball.ignore
            })
            archive.finalize();
          } else {
            let msg = 'manifest file ' + passon.manifestFile + ' not found';
            this.updateStep('image_prepare', 'failure', msg, (err) => {
              if (err) reject(err);

              reject(new Error(msg));
            });
          }
        } catch (e) {
          this.updateStep('image_prepare', 'failure', e.message, (err) => {
            if (err) reject(err);

            reject(e);
          });
        }
      });
    });
  };

  /*
   *  Submit tarball to Docker server, build Image from that
   */
  this.loadOrBuildImage = (passon) => {
    return new Promise((fulfill, reject) => {
      if (!passon.tarballFile) {
        reject(new Error('tarball file name was not passed on!'));
        return;
      }

      debug('[%s] Submit packed payload to Docker and build image: %s', this.jobId, passon.tarballFile);

      let stepUpdate = this.updateStep;
      let saveLog = this.saveLogFile;
      let imageTag = config.bagtainer.image.prefix.job + this.jobId;
      let job_id = this.jobId;
      let compendium_id = this.compendium.id;
      let isBag = this.compendium.bag;

      this.updateStep('image_build', 'running', null, (err) => {
        if (err) reject(err);

        imageTagCompendium = config.bagtainer.image.prefix.compendium + this.compendium.id;
        debug('[%s] Check if we already have an image for compendium with tag %s', this.jobId, imageTagCompendium);
        let image = docker.getImage(imageTagCompendium);
        image.inspect((err, data) => {
          if (err) {
            debug('[%s] Image %s does not exist.', job_id, imageTagCompendium);

            imageTarballFile = path.join(passon.compendiumPath, config.bagtainer.imageTarballFile);
            if (this.compendium.bag) {
              imageTarballFile = path.join(passon.compendiumPath, config.bagit.payloadDirectory, config.bagtainer.imageTarballFile);
            }

            fs.access(imageTarballFile, fs.constants.F_OK, (err) => {
              if (err) {
                debug('[%s] image tarball file %s does not exist, building image from file %s', this.jobId, imageTarballFile);

                stepUpdate('image_build', null, 'No image tarball found, building image from manifest file.', (err) => {
                  if (err) reject(err);

                  let lastData = null;
                  let digest = null;

                  docker.buildImage(passon.tarballFile,
                    { t: imageTag }, (error, output) => {
                      try {
                        if (error) {
                          debug('[%s] error building image: %s', this.jobId, error);
                          stepUpdate('image_build', 'failure', error, (err) => {
                            if (err) reject(err);

                            reject(error);
                          });
                        } else {
                          output.on('data', d => {
                            try {
                              lastData = JSON.parse(d.toString('utf8'));
                              debugBuild('[%s] [build] %o', this.jobId, lastData);
                              msg = null;
                              if (lastData.stream) msg = lastData.stream.trim();
                              else msg = JSON.stringify(lastData);

                              if (lastData.aux && lastData.aux.ID) { // previously:  msg.includes('sha256')
                                //digest = msg.match(/sha256:[a-z0-9]+/g)[0];
                                digest = lastData.aux.ID;
                                debug('[%s] Extracted image digest %s from log %o"', job_id, digest, lastData);
                              }
  
                              stepUpdate('image_build', null, msg, (err) => {
                                if (err) {
                                  debugBuild('[%s] error appending last output log "%s" to job %s', lastData.stream, this.jobId);
                                  reject(err);
                                }
                              });
                            } catch (err) {
                              debug('[%s] Error parsing log data: %o', this.jobId, err);
  
                              stepUpdate('image_build', null, msg, (err) => {
                                if (err) {
                                  debugBuild('[%s] error retrieving last output log: %s', this.jobId, err.message);
                                  reject(err);
                                }
                              });
                            }
                          });

                          output.on('end', () => {
                            try {
                              // check if build actually succeeded
                              if (lastData.error) {
                                debug('[%s] Docker image build FAILED: %o', this.jobId, lastData);

                                stepUpdate('image_build', 'failure', lastData.error, (err) => {
                                  if (err) reject(err);

                                  reject(new Error(lastData.error));
                                });

                              }
                              else if (lastData.stream && lastData.stream.startsWith('Successfully tagged')) {
                                debug('[%s] Created Docker image "%s", last log was "%s"', job_id, imageTag, lastData.stream.trim());

                                // save a copy of the build log to the metadata directory
                                saveLog(compendium_id, job_id, 'image_build', isBag, stepUpdate, (errSaveLog) => {
                                  if (errSaveLog) reject(errSaveLog);
                                  else {
                                    // save the id of the image from the build log to the job step
                                    if (digest) {
                                      let fields = {};
                                      fields['steps.image_build.imageId'] = digest;

                                      Job.updateOne({ id: job_id }, { $set: fields }, (err) => {
                                        if (err) {
                                          debug('Error during check step update: %o', err.message);
                                          reject(err);
                                        } else {
                                          stepUpdate('image_build', 'success', null, (err) => {
                                            if (err) {
                                              debugBuild('[%s] ERROR updating step: %o', job_id, err);
                                              reject(err);
                                            }

                                            passon.imageTag = imageTag;
                                            passon.imageId = digest;
                                            fulfill(passon);
                                          });
                                        }
                                      });
                                    } else {
                                      debug('[%s] No image digest found in log: %o"', job_id, buildLog);

                                      stepUpdate('image_build', 'failure', '[Could not extract image digest from build log]', (err) => {
                                        if (err) {
                                          debugBuild('[%s] ERROR updating step: %o', job_id, err);
                                          reject(err);
                                        }
                                        reject(new Error('Could not extract image digest from build log'));
                                      });
                                    }
                                  }
                                });
                              } else {
                                reject(new Error('Unknown error during image build!'));
                              }
                            } catch (er) {
                              this.updateStep('image_build', 'failure', er.message, (err) => {
                                if (err) reject(err);

                                reject(er);
                              });
                            }
                          });
                        }
                      } catch (e) {
                        this.updateStep('image_build', 'failure', e.message, (err) => {
                          if (err) reject(err);

                          reject(e);
                        });
                      }
                    });
                });
              } else {
                debug('[%s] Loading image tarball from file %s', job_id, imageTarballFile);
                stepUpdate('image_build', null, 'Image tarball found! Loading it...', (err) => {
                  if (err) reject(err);

                  let tarStream = fs.createReadStream(imageTarballFile);
                  docker.loadImage(tarStream, {}, (error, stream) => {
                    try {
                      if (error) reject(error);

                      let loadedImageTag = null;
                      stream.on('data', function (d) {
                        msg = Buffer.from(d).toString().trim();
                        debug('[%s] [image loading] %s', job_id, msg);
                        data = JSON.parse(d);
                        if (data.stream && data.stream.indexOf('Loaded image') > -1) {
                          loadedImageTag = data.stream.split('Loaded image:')[1].trim();
                        }
                      });

                      stream.on('end', function (d) {
                        debug('[%s] image loaded from tarball, it has the tag %s', loadedImageTag);

                        let newImage = docker.getImage(loadedImageTag);
                        newImage.tag({
                          repo: config.bagtainer.image.name.compendium,
                          tag: compendium_id
                        }, (err, data) => {
                          if (err) {
                            debug('[%s] Error during tagging loaded image with compendium ID: %o', job_id, compendium_id, err);
                            reject(err);
                          } else {
                            stepUpdate('image_build', null,
                              'Re-tagged loaded image "' + loadedImageTag + '" with ' + config.bagtainer.image.prefix.compendium + compendium_id,
                              (err) => {
                                if (err) reject(err);

                                synchroniseImageTags(compendium_id, job_id, (err) => {
                                  if (err) reject(err);
                                  else {
                                    stepUpdate('image_build', 'success',
                                      'Loaded image tarball from file ' + config.bagtainer.imageTarballFile, (err) => {
                                        if (err) reject(err);

                                        passon.imageTag = config.bagtainer.image.prefix.job + job_id;
                                        fulfill(passon);
                                      });
                                  }
                                });
                              });
                          }
                        });
                      });
                    } catch (e) {
                      this.updateStep('image_build', 'failure', e.message, (err) => {
                        if (err) reject(err);

                        reject(e);
                      });
                    }
                  });
                });
              }
            });
          } else {
            debug('[%s] Found image for compendium, just tagging it for the job: %o (it has %s tags)', job_id, data.Id, data.RepoTags.length);

            stepUpdate('image_build', 'skipped', 'Found image for compendium: ' + imageTagCompendium, (err) => {
              if (err) reject(err);

              var imageId;
              image.inspect((err, data) => {
                imageId = data.Id;
              });

              image.tag({
                repo: config.bagtainer.image.name.job,
                tag: job_id
              }, (err, data) => {
                if (err) {
                  debug('[%s] Error during tagging of compendium image with job ID: %o', job_id, err);
                  reject(err);
                } else {
                  stepUpdate('image_build', 'success', 'Tagged image ' + imageTagCompendium + ' with ' + imageTag, (err) => {
                    if (err) reject(err);

                    passon.imageTag = imageTag;
                    passon.imageId = imageId;
                    fulfill(passon);
                  });
                }
              });
            });
          }
        });
      });
    });
  };

  /*
   *  Run the container from previously build or loaded image
   */
  this.executeImage = (passon) => {
    return new Promise((fulfill, reject) => {
      if (!passon.imageTag) {
        reject(new Error('image tag was not passed on!'));
      }

      debug('[%s] Run image: %s', this.jobId, passon.imageTag);

      var job_id = this.jobId;
      var stepUpdate = this.updateStep;

      let payload_path = passon.jobPath;
      if (this.compendium.bag) {
        payload_path = path.join(payload_path, config.bagit.payloadDirectory);
      }

      // create stream that saves everything written to it to the correct text field in the database-document
      let stdStream = Stream.Writable();
      stdStream.job_id = this.jobId; // append job ID to stream object so that it can be used in event handlers
      stdStream.stepUpdate = this.updateStep;
      stdStream._write = function (chunk, enc, next) {
        msg = Buffer.from(chunk).toString().trim();
        debugRun('[%s] %s', job_id, msg);

        this.stepUpdate('image_execute', null, msg, (e) => {
          if (e) reject(e);

          next();
        });
      };

      this.updateStep('image_execute', 'running', '[started image execution]', (err) => {
        if (err) {
          reject(err);
          return;
        }

        let binds = [
          payload_path + ':' + config.bagtainer.mountLocationInContainer + ':rw' // mandatory bind mount with read & write access
        ];

        // add binds from configuration file, e.g. from substitution
        if (passon.configuration.execution && passon.configuration.execution.bind_mounts) {
          passon.configuration.execution.bind_mounts.forEach(bm => {
            bmString = path.join(payload_path, bm.source) + ":" + bm.destination + ':ro';
            debugRun('[%s] Adding bind mount from configuration file: %s', job_id, bmString);
            binds.push(bmString);
          });
        }

        if (config.fs.volume && volume_full_path) {
          // passon.jobPath always starts with config.fs.base, mounting more than needed but limiting scope with cmd
          volume_path = path.join(volume_full_path, payload_path.replace(config.fs.base, ''));
          debug('[%s] volume is configured, overwriting binds configuration with path %s (was %o)', job_id, volume_path, binds);
          binds = [
            volume_path + ':' + config.bagtainer.mountLocationInContainer
          ];

          // add binds from configuration file, e.g. from substitution
          if (passon.configuration.execution && passon.configuration.execution.bind_mounts) {
            passon.configuration.execution.bind_mounts.forEach(bm => {
              bmString = path.join(volume_path, bm.source) + ":" + bm.destination + ':ro';
              debugRun('[%s] Adding bind mount from configuration file: %s', job_id, bmString);
              binds.push(bmString);
            });
          }
        }

        // remove duplicates from binds
        binds = Array.from(new Set(binds));

        let create_options = Object.assign(
          config.bagtainer.docker.create_options,
          {
            name: 'muncher_job_' + this.jobId,
            HostConfig: {
              Binds: binds,
              AutoRemove: config.bagtainer.rm
            }
          }
        );

        let start_options = clone(config.bagtainer.docker.start_options);
        debug('[%s] Starting Docker container now:\n\tcreate_options: %o\n\tstart_options: %o',
          this.jobId, JSON.stringify(create_options), JSON.stringify(start_options));

        this.updateStep('image_execute', 'running', 'Running image ' + passon.imageTag, (err) => {
          if (err) {
            reject(err);
            return;
          }

          docker.run(passon.imageTag, [], stdStream, create_options, start_options, (err, data, container) => {
            try {
              passon.container = container; // pass on a reference to container for later cleanup
              if (err) {
                stepUpdate('image_execute', 'failure', err.toString(), (error) => {
                  if (error) reject(error);

                  reject(new Error(err.message));
                });
              } else {
                debugRun('[%s] status code: %s', this.jobId, data.StatusCode);
                // check exit code of program run inside the container, see http://tldp.org/LDP/abs/html/exitcodes.html
                fields = {};
                fields['steps.image_execute.statuscode'] = data.StatusCode;

                // save non-standard field separately
                Job.updateOne({ id: job_id }, { $set: fields }, (err) => {
                  if (err) {
                    debug('[%s] Error during check step fields update: %s', job_id, err.message);
                    reject(err);
                  } else {
                    if (data.StatusCode === 0) {
                      stepUpdate('image_execute', 'success', '[finished image execution]', (error) => {
                        if (error) reject(error);

                        fulfill(passon);
                      });
                    } else {
                      debugRun('[%s] ERROR: %o', job_id, data);

                      stepUpdate('image_execute', 'failure', '[error during image execution]', (error) => {
                        if (error) reject(error);
                        else {
                          container.logs({
                            follow: true,
                            stdout: true,
                            stderr: true,
                            timestamps: true
                          }, function (err, stream) {
                            if (err) {
                              debugRun('[%s] Error getting container logs after non-zero status code (expected if rm is true, it is: %s): %s',
                                job_id, config.bagtainer.rm, err);
                            } else {
                              stream.on('data', function (data) {
                                debugRun('[%s] container logs      ', job_id, Buffer.from(data).toString().trim());
                              });
                            }
                          });

                          // do not wait for container log stream
                          reject(new Error('Received non-zero status code "' + data.StatusCode + '" from container'));
                        }
                      });
                    }
                  }
                });
              }
            } catch (e) {
              this.updateStep('image_execute', 'failure', e.message, (err) => {
                if (err) reject(err);

                reject(e);
              });
            }
          });
        });
      });
    });
  };

  /*
   *  Run checker, see https://github.com/o2r-project/erc-checker/
   */
  this.check = (passon) => {
    return new Promise((fulfill, reject) => {

      if (!passon.configuration.display) {
        debug('[%s] Cannot check, missing configuration property "display": %o', this.jobId, passon.configuration);
        this.updateStep('check', 'failure', 'Configuration property "display" not found.', (error) => {
          if (error) reject(error);
          else reject(new Error('Display file property missing, cannot run check'));
        });
      }

      let original_display = path.join(passon.compendiumPath, passon.configuration.display);
      let reproduced_display = path.join(passon.jobPath, passon.configuration.display);
      let output_path = passon.jobPath;

      if (this.compendium.bag) {
        original_display = path.join(passon.compendiumPath, config.bagit.payloadDirectory, passon.configuration.display);
        reproduced_display = path.join(passon.jobPath, config.bagit.payloadDirectory, passon.configuration.display);
        output_path = path.join(passon.jobPath, config.bagit.payloadDirectory);
      }

      var checkerConfig = {
        directoryMode: false,
        pathToOriginalHTML: original_display,
        pathToReproducedHTML: reproduced_display,
        saveFilesOutputPath: output_path,
        saveDiffHTML: true,
        outFileName: config.checker.diffFileName,
        saveMetadataJSON: true,
        createParentDirectories: false,
        quiet: false
      };
      debug('[%s] Run checker with base configuration %O', this.jobId, checkerConfig);

      let stepUpdate = this.updateStep;
      let job_id = this.jobId;
      let compendium_id = this.compendium.id;

      this.updateStep('check', 'running', 'Running check', (error) => {
        if (error) {
          debug('Error during check step update: %o', error);
          reject(error);
        } else {
          checker(checkerConfig)
            .then(function (resolveMetadata) {
              debug('[%s] Check finished, result: %s', job_id, resolveMetadata.checkSuccessful);
              passon.check = resolveMetadata;

              if (resolveMetadata.checkSuccessful) {
                passon.check.status = 'success';
                passon.check.text = 'Check successful';

                // FIXME via https://github.com/o2r-project/erc-checker/issues/13
                if (passon.check.images == null) passon.check.images = [];

                // save non-standard fields separately but without overwriting other fields
                let fields = {};
                fields['steps.check.images'] = passon.check.images;
                fields['steps.check.display'] = passon.check.display;
                fields['steps.check.checkSuccessful'] = resolveMetadata.checkSuccessful;

                Job.updateOne({ id: job_id }, { $set: fields }, (err) => {
                  if (err) {
                    debug('Error during check step update: %o', err.message);
                    reject(err);
                  } else {
                    stepUpdate('check', passon.check.status, passon.check.text, (error) => {
                      if (error) {
                        debug('[%s] Error during check step update: %s', job_id, error);
                        reject(error);
                      } else {
                        debug('[%s] Tagging image for compendium after successful execution.', job_id);
                        synchroniseImageTags(compendium_id, job_id, (err) => {
                          if (err) reject(err);
                          else {
                            passon.imageTag = config.bagtainer.image.prefix.job + job_id;
                            // finally everything is fine
                            fulfill(passon);
                          }
                        });
                      }
                    });
                  }
                });
              } else {
                if (checkerConfig.saveDiffHTML) {
                  passon.check.display = {};
                  passon.check.display.diff = urlJoin(
                    config.api.resource.job,
                    job_id, config.api.sub_resource.data,
                    config.checker.diffFileName);
                }

                passon.check.status = 'failure';
                passon.check.text = ['Check failed!'];

                if (passon.check.images == null) passon.check.images = [];
                if (passon.check.display && passon.check.display.diff == null) passon.check.display = {};

                // save non-standard fields separately
                let fields = {};
                fields['steps.check.display'] = passon.check.display;
                fields['steps.check.images'] = passon.check.images;
                if (passon.check.images) {
                  passon.check.images.forEach((checkedImage) => {
                    passon.check.text.push('Image comparison result: ' + JSON.stringify(checkedImage.compareResults));
                  });
                }
                fields['steps.check.errors'] = passon.check.errors;
                fields['steps.check.checkSuccessful'] = passon.check.checkSuccessful;
                if (passon.check.numTextDifferrences) {
                  fields['steps.check.numTextDifferrences'] = passon.check.numTextDifferrences;
                  passon.check.text.push('Number of text differences found: ' + passon.check.numTextDifferrences);
                }

                Job.updateOne({ id: job_id }, { $set: fields }, (err) => {
                  if (err) {
                    debug('[%s] Error during check step fields update: %s', job_id, err.message);
                    reject(err);
                  } else {
                    stepUpdate('check', passon.check.status, passon.check.text, (error) => {
                      if (error) {
                        debug('[%s] Error during check step update: %s', job_id, error);
                        reject(error);
                      } else {
                        fulfill(passon);
                      }
                    });
                  }
                });
              }
            }, function (rejectMetadata) {
              debug('[%s] Check failed with error: %O', this.jobId, rejectMetadata);
              passon.check = rejectMetadata;

              // FIXME via https://github.com/o2r-project/erc-checker/issues/13
              if (passon.check.images == null) passon.check.images = [];
              if (passon.check.display && passon.check.display.diff == null) passon.check.display = {};

              // save non-standard fields separately
              let fields = {};
              fields['steps.check.display'] = passon.check.display;
              fields['steps.check.errors'] = passon.check.errors;
              fields['steps.check.images'] = passon.check.images;
              fields['steps.check.checkSuccessful'] = passon.check.checkSuccessful;
              if (passon.check.numTextDifferrences) {
                fields['steps.check.numTextDifferrences'] = passon.check.numTextDifferrences;
              }
              
              Job.updateOne({ id: job_id }, { $set: fields }, (err) => {
                if (err) {
                  debug('[%s] Error during check step fields: %s', job_id, err.message);
                  reject(err);
                } else {
                  stepUpdate('check', 'failure', 'Error during check!', (error) => {
                    if (error) {
                      debug('[%s] Error during check step update: %s', job_id, error);
                      reject(error);
                    } else {
                      reject(new Error(JSON.stringify(rejectMetadata.errors)));
                    }
                  });
                }
              });
            })
            .catch(e => {
              debug('[%s] Error running check: %s', this.jobId, e);
              this.updateStep('check', 'failure', 'Error running check: ' + e.message, (err) => {
                if (err) reject(err);
                reject(e);
              });
            });
        }
      });
    });
  };

  /*
   * Save image tarball
   */
  this.saveImage = (passon) => {
    return new Promise((fulfill, reject) => {
      let stepUpdate = this.updateStep;
      let job_id = this.jobId;
      let compendium_id = this.compendium.id;

      this.updateStep('image_save', 'running', '[Saving image tarball file]', (error) => {
        if (error) {
          debug('[%s] Error during image_save step update: %s', job_id, error);
          reject(error);
        } else {
          try {
            if ((passon.check.status === "success" || config.bagtainer.saveIfFailure) && config.bagtainer.saveImageTarball) {
              let imageTarballFile = path.join(passon.compendiumPath, config.bagtainer.imageTarballFile);
              if (this.compendium.bag) {
                imageTarballFile = path.join(passon.compendiumPath, config.bagit.payloadDirectory, config.bagtainer.imageTarballFile);
              }

              fs.access(imageTarballFile, fs.constants.F_OK, (err) => {
                if (err) {
                  debug('[%s] Saving image tarball file to compendium at %s (file does no exist yet)', job_id, imageTarballFile);

                  saveImageFromJob(job_id, compendium_id, imageTarballFile, stepUpdate, (err) => { // FIXME code duplicated below
                    if (err) {
                      debug('[%s] Error saving image: %s', job_id, err);
                      stepUpdate('image_save', 'failure', 'Error saving image tarball file:' + err.message, (error) => {
                        if (error) reject(error);
                        else reject(err);
                      });
                    } else {
                      passon.imageTarballFile = imageTarballFile;
                      stats = fs.statSync(passon.imageTarballFile);
                      let tarballSize = filesize(stats.size);
                      debug('[%s] Image saved to file %s (%s)', job_id, passon.imageTarballFile, tarballSize);

                      let fields = {};
                      fields['steps.image_save.file'] = config.bagtainer.imageTarballFile;
                      if (this.compendium.bag) {
                        fields['steps.image_save.file'] = path.join(config.bagit.payloadDirectory, config.bagtainer.imageTarballFile);
                      }

                      Job.updateOne({ id: job_id }, {
                        $set: fields,
                      }, (error) => {
                        if (error) reject(error);
                        else {
                          stepUpdate('image_save', 'success', '[Saved image tarball to file (size: ' + tarballSize + ')]', (error2) => {
                            if (error2) {
                              debug('[%s] Error during image_save step update: %s', job_id, error2);
                              reject(error2);
                            } else {
                              debug('[%s] Updated job, image_save complete', job_id);
                              fulfill(passon);
                            }
                          });
                        }
                      });
                    }
                  });
                } else {
                  debug('[%s] image tarball file %s already exists, checking digests...', job_id, imageTarballFile);
                  stepUpdate('image_save', null, '[Existing image tarball file found]', (error) => {
                    if (error) reject(error);

                    if (!passon.imageId) {
                      debug('[%s] no imageId in the passon, image_build not done or erroneous, cannot compare digests', job_id);
                      stepUpdate('image_save', 'skipped', '[Job did not build the image, not overwriting tarball]', (error2) => {
                        if (error2) {
                          debug('[%s] Error during image_save step update: %s', job_id, error2);
                          reject(error2);
                        } else {
                          debug('[%s] Image_save complete', job_id);
                          fulfill(passon);
                        }
                      });
                    } else {
                      var tarballDigest;
                      // find a json file in the tarball that is not manifest.json, that filename is the sha256 of the image
                      tarlist({
                        file: imageTarballFile,
                        filter: path => {
                          return path.endsWith('.json');
                        },
                        onentry: entry => {
                          if (entry.path != 'manifest.json')
                            tarballDigest = 'sha256:' + path.parse(entry.path).name;
                        }
                      }, er => {
                        if (er) reject(er);

                        if (tarballDigest != passon.imageId) {
                          stepUpdate('image_save', null, '[Image tarball updated because image digests mismatch: job: '
                            + passon.imageId + ' | tarball:' + tarballDigest + ']', (error) => {
                              if (error) reject(error);

                              saveImageFromJob(job_id, compendium_id, imageTarballFile, stepUpdate, (err) => { // FIXME code duplicated above
                                if (err) {
                                  debug('[%s] Error updating image: %s', job_id, err);
                                  stepUpdate('image_save', 'failure', 'Error updating image tarball file:' + err.message, (error) => {
                                    if (error) reject(error);
                                    else reject(err);
                                  });
                                } else {
                                  passon.imageTarballFile = imageTarballFile;
                                  stats = fs.statSync(passon.imageTarballFile);
                                  let tarballSize = filesize(stats.size);
                                  debug('[%s] Image saved to file %s (%s)', job_id, passon.imageTarballFile, tarballSize);

                                  let fields = {};
                                  fields['steps.image_save.file'] = config.bagtainer.imageTarballFile;
                                  if (this.compendium.bag) {
                                    fields['steps.image_save.file'] = path.join(config.bagit.payloadDirectory, config.bagtainer.imageTarballFile);
                                  }

                                  Job.updateOne({ id: job_id }, {
                                    $set: fields,
                                  }, (error) => {
                                    if (error) reject(error);
                                    else {
                                      stepUpdate('image_save', 'success', '[Updated image tarball file (size: ' + tarballSize + ')]', (error2) => {
                                        if (error2) {
                                          debug('[%s] Error during image_save step update: %s', job_id, error2);
                                          reject(error2);
                                        } else {
                                          debug('[%s] Updated job, image_save complete', job_id);
                                          fulfill(passon);
                                        }
                                      });
                                    }
                                  });
                                }
                              });
                            });
                        } else {
                          stepUpdate('image_save', 'skipped', '[Image tarball file saving skipped because file already exists and image digests match]', (error) => {
                            if (error) reject(error);
                            else fulfill(passon);
                          });
                        }
                      });
                    }
                  });
                }
              });
            } else {
              debug('[%s] Not saving image tarball file to compendium: check status is %s and configuration setting is %s',
                this.jobId, passon.check.status, config.bagtainer.saveImageTarball);

              msg = '[Image tarball file saving disabled]';
              status = 'skipped';
              if (passon.check.status === "failure") {
                msg = '[Check failed, not saving image tarball]';
              }

              stepUpdate('image_save', status, msg, (error) => {
                if (error) reject(error);
                else fulfill(passon);
              });
            }
          } catch (e) {
            this.updateStep('image_save', 'failure', e.message, (err) => {
              if (err) reject(err);

              reject(e);
            });
          }
        }
      });
    });
  }

  /*
   *  Cleanup after successful execution
   */
  this.cleanup = (passon) => {
    return new Promise((fulfill, reject) => {
      debug('[%s] Run cleanup regularly with passon...', this.jobId);

      // from https://github.com/apocas/dockerode/blob/976fe4ca205a4f48cd8628f7daf796af8017c705/test/docker.js#L159
      function locateImageByTag(imageTag, callback) {
        docker.listImages(function (err, list) {
          if (err) callback(err);

          image = null;
          list.forEach(i => {
            if (i.RepoTags && i.RepoTags.indexOf(imageTag) !== -1) {
              image = i;
            }
          });

          callback(null, docker.getImage(image.Id));
        });
      }

      function finalOverallStatusCheck(jobId, passon, fulfill, reject, update) {
        debug('[%s] Checking final overall status during cleanup', jobId);
        Job.findOne({ id: jobId }, (err, job) => {
          if (err) {
            debug('Error checking overall status during cleanup: %o', err.message);
            reject(err);
          } else {
            if (job === null) {
              reject(new Error('no job found with id ' + jobId));
            }
            else {
              // set status to failure if it is still "running", should be "success" by now
              if (job.status === 'running') {
                let finalStatus = 'failure';
                update(finalStatus, (error) => {
                  if (error) {
                    reject(error);
                  }
                  else {
                    debug('[%s] cleanup set final status to %s', jobId, finalStatus);
                    fulfill(passon);
                  }
                });
              }
            }
          }
        });
      }

      this.updateStep('cleanup', 'running', 'Running regular cleanup', (error) => {
        if (error) {
          debug('Error during regular cleanup: %o', error);
          reject(error);
        }
        else {
          if (passon) {
            Promise.all([
              new Promise((fulfill, reject) => {
                if (passon.imageTag && !config.bagtainer.keepImages) {
                  debug('[%s] Removing image %s', this.jobId, passon.imageTag);
                  locateImageByTag(passon.imageTag, function (err, image) {
                    if (err) return reject(err);

                    function callback(error, data) {
                      if (error) reject(error);

                      fulfill('Removed image with tag ' + passon.imageTag + ': ' + JSON.stringify(data));
                    }

                    debug('[%s] Removing image %s', this.jobId, image.name);
                    if (image) return image.remove({ force: config.bagtainer.forceImageRemoval }, callback);
                  });
                } else {
                  fulfill('Kept image with tag ' + passon.imageTag + ' for job ' + this.jobId);
                }
              }),
              new Promise((fulfill, reject) => {
                // remove the payload tarball file
                if (passon.tarballFile) {
                  debug('[%s] Unlinking tarball file %s', this.jobId, passon.tarballFile);
                  fs.unlink(passon.tarballFile, (err) => {
                    if (err) reject(err);

                    debug('[%s] Unlinked tarball file %s', this.jobId, passon.tarballFile);
                    fulfill('Deleted temporary payload file.');
                  });
                } else {
                  fulfill('No tarball found to delete.');
                }
              })
            ]).then((results) => {
              this.updateStep('cleanup', 'success', results, (err) => {
                if (err) {
                  reject(err);
                } else {
                  debug('[%s] Completed cleanup: %s', this.jobId, util.inspect(passon, { depth: 1, colors: true }));
                  fulfill(passon);
                }
              });
            }).catch(e => {
              debug('[%s] Error cleaning up: %s', this.jobId, e);
              this.updateStep('cleanup', 'failure', 'Error cleaning up: ' + e.message, (err) => {
                if (err) reject(err);
                else finalOverallStatusCheck(this.jobId, passon, fulfill, reject, this.updateStatus);
              });
            });
          } else {
            this.updateStep('cleanup', 'success', 'Nothing provided that could be cleaned up', (err) => {
              if (err) reject(err);
              else finalOverallStatusCheck(this.jobId, passon, fulfill, reject, this.updateStatus);
            });
          }
        }
      });
    });
  };

  /*
   *  Cleanup after erroneous execution
   */
  this.cleanupFinally = () => {
    return new Promise((fulfill, reject) => {
      debug('[%s] [FINALLY] Run cleanup', this.jobId);

      let tarballFile = path.join(config.payload.tarball.tmpdir, this.jobId + '.tar');
      fs.access(tarballFile, fs.constants.F_OK, (err) => {
        if (err) {
          debug('[%s] [FINALLY] payload tarball file %s does not exist, nothing to unlink - [END OF JOB]', this.jobId, tarballFile);
        }
        else {
          debug('[%s] [FINALLY] Unlinking payload tarball file %s', this.jobId, tarballFile);
          fs.unlink(tarballFile, (error) => {
            if (error) reject(error);
            else {
              debug('[%s] [FINALLY] Deleted tmp payload file - [END OF JOB]', this.jobId);
              fulfill();
            }
          });
        }
      });
    })
  };

  /*
   *
   */
  this.execute = () => {
    debug('[%s] Starting execution...', this.jobId);

    return this.begin({})
      .then(this.copyFiles)
      .then(this.detectBag)
      .then(this.validateBag)
      .then(this.createOrLoadConfigurationFile)
      .then(this.validateCompendium)
      .then(this.generateManifest)
      .then(this.prepareImage)
      .then(this.loadOrBuildImage)
      .then(this.executeImage)
      .then(this.check)
      .then(this.saveImage)
      .catch(res => {
        debug("[%s] Unhandled failure (or rejection) during execute: \n\t%s", this.jobId, res);
      })
      .then(this.cleanup)
      .then(this.end)
      .finally(this.cleanupFinally)
      .catch(res => {
        debug("[%s] Unhandled failure (or rejection) during cleanup: \n\t%s", this.jobId, res);
      });
  };
}

module.exports.Executor = Executor;
