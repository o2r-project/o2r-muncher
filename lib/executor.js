/*
 * (C) Copyright 2016 o2r project
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
var debug = require('debug')('executor');
var debugBuild = require('debug')('executor:build');
var debugRun = require('debug')('executor:run');
var Promise = require('bluebird');
var fs = require('fs');
var Docker = require('dockerode');
var yaml = require('yamljs');
var Bag = require('bagit');
var Stream = require('stream');
var archiver = require('archiver');
const clone = require('clone');

var config = require('../config/config');
const defaults = require('../config/bagtainer-default');

var Job = require('../lib/model/job');

/**
 * Create Executor for given package name and base path
 * @constructor
 * @param {string} jobId - The identifier of the job
 * @param {string} basePath - The path where all compendia are stored
 */
function Executor(jobId, basePath) {
  /*
   * set up Executor
   */
  this.basePath = basePath;
  if (!jobId) {
    debug('Job id missing');
    return false;
  }
  this.jobId = jobId;
  this.bagpath = this.basePath + this.jobId;
  this.bag = {};
  this.bagtainer = {};
  this.imageTag = config.bagtainer.imageNamePrefix + this.jobId;

  // https://nodejs.org/api/process.html#process_event_unhandledrejection
  process.on('unhandledRejection', (reason, p) => {
    console.log('Unhandled Rejection at: Promise', p, 'reason:', reason);
    debug('Unhandled Rejection: \n\tPromise %s \n\tReason: %s', JSON.stringify(p), reason);
  });

  debug('[%s] Job set up with path %s', this.jobId, this.bagpath);

  // setup Docker client with default options
  var docker = new Docker();
  debug('[%s] Docker client set up: %s', this.jobId, JSON.stringify(docker));

  /*
   *  Helper Function for appending single lines/data to the text field of a
   *  step in the database. used for streaming logs.
   */
  this.textAppend = (step, data) => {
    Job.findOne({ id: this.jobId }, (err, job) => {
      if (err) throw err;
      if (job === null) throw new Error('no job found');
      // check if field exists, otherwise textfield will include 'undefined'.
      if (job.steps[step].text === undefined) job.steps[step].text = '';
      job.steps[step].text += data;
      job.save(err => {
        if (err) throw err;
      });
    });
  };

  this.updateStep = (step, status, text, cb) => {
    debug('[%s] Updating:   %s is now %s:     %s', this.jobId, step, status, text);
    let fields = {};
    if (status)
      fields['steps.' + step + '.status'] = status;
    if (text)
      fields['steps.' + step + '.text'] = text;

    switch (status) {
      case 'running':
        fields['steps.' + step + '.start'] = new Date();
        break;
      case 'success':
      case 'failure':
        fields['steps.' + step + '.end'] = new Date();
        break;
      default:
        break;
    }

    Job.update({ id: this.jobId }, fields, err => {
      cb(err);
    });
  };

  /*
   *  Load the associated bag, check if it's valid.
   */
  this.loadBag = (passon) => {
    return new Promise((fulfill, reject) => {
      debug('[%s] Load and validate bag', this.jobId);
      this.updateStep('validate_bag', 'running', null, (err) => {
        if (err) reject(err);
        this.bag = new Bag(this.bagpath);
        this.bag
          .validate(config.bagtainer.bagit.validateFast)
          .then(res => {
            this.updateStep('validate_bag', 'success', res, (err) => {
              if (err) reject(err);
              fulfill(passon);
            });
          }).catch(e => {
            this.updateStep('validate_bag', 'failure', e.message, (err) => {
              if (err) reject(err);
              reject(e);
            });
          });
      });
    });
  };

  /*
   *  Parse the Bagtainer.yml, save content
   */
  this.parseBagtainer = (passon) => {
    return new Promise((fulfill, reject) => {
      debug('[%s] Parse bagtainer', this.jobId);
      this.updateStep('validate_compendium', 'running', null, (err) => {
        if (err) reject(err);
        try {
          let input = fs.readFileSync(this.basePath + this.jobId + config.bagtainer.configFile, 'utf-8');
          this.bagtainer = yaml.parse(input);
          debug('Parsed bagtainer configuration: %s', JSON.stringify(this.bagtainer));

          // validate config file
          if (!this.bagtainer.id) {
            this.updateStep('validate_compendium', 'failure', '"id" required in config file', (err) => {
              if (err) reject(err);
              reject(new Error('"id" required in config file'));
            });
          }
          else if (!this.bagtainer.command) {
            this.updateStep('validate_compendium', 'failure', '"command" required in config file', (err) => {
              if (err) reject(err);
              reject(new Error('"command" required in config file'));
            });
          }
          else if (!this.bagtainer.version) {
            this.updateStep('validate_compendium', 'failure', '"version" required in config file', (err) => {
              if (err) reject(err);
              reject(new Error('"version" required in config file'));
            });
          }
          else if (config.bagtainer.supportedVersions.indexOf(this.bagtainer.version) == -1) {
            let msg = '"version" ' + this.bagtainer.version + ' is not supported (' +
              JSON.stringify(config.bagtainer.supportedVersions) + ')';
            this.updateStep('validate_compendium', 'failure', msg, (err) => {
              if (err) reject(err);
              reject(new Error(msg));
            });
          }
          else {
            // config file is valid!
            this.updateStep('validate_compendium', 'success', 'all checks passed', (err) => {
              if (err) reject(err);
              fulfill(passon);
            });
          }
        } catch (e) {
          this.updateStep('validate_compendium', 'failure', e, (err) => {
            if (err) reject(err);
            reject(e);
          });
        }
      });
    });
  };

  /*
   *  Put Bag-Payload in a tarball, needed to pass on to Docker server
   */
  this.packData = (passon) => {
    return new Promise((fulfill, reject) => {
      debug('[%s] Pack payload for Docker execution ', this.jobId);
      this.updateStep('image_prepare', 'running', null, (err) => {
        if (err) reject(err);
        let containerfile = null;

        // load defaults
        if (this.bagtainer.containerfile) {
          containerfile = this.bagpath + this.bagtainer.containerfile;
        } else {
          containerfile = this.bagpath + defaults.containerfile;
        }

        try {
          let containerfileStats = fs.lstatSync(containerfile);

          if (containerfileStats.isFile()) {
            let tarballFileName = config.payload.tarball.tmpdir + this.jobId + '.tar';
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

            //on stream closed we can end the request
            archive.on('end', function () {
              debug('[%s] Pack payload completed in file %s (%s total bytes)', this.jobId, tarballFileName,
                archive.pointer());
              currentExecutor.updateStep('image_prepare', 'success',
                'payload with ' + archive.pointer() + ' total bytes', (err) => {
                  if (err) reject(err);

                  passon.tarballFile = tarballFileName;
                  fulfill(passon);
                });
            });

            archive.pipe(tarballFile);

            let fullpath = this.bagpath + defaults.payloadDirectory;
            debug('[%s] Packing payload %s into %s', this.jobId, fullpath, tarballFileName);
            archive.directory(fullpath, '/');
            archive.finalize();

          } else {
            let msg = 'container file ' + containerfile + ' not found';
            this.updateStep('image_prepare', 'failure', msg, (err) => {
              if (err) reject(err);

              reject(new Error(msg));
            });
          }
        }
        catch (e) {
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
  this.buildImage = (passon) => {
    debug('[%s] Submit packed payload to Docker server: %s', this.jobId, passon);
    return new Promise((fulfill, reject) => {
      if (!passon.tarballFile) {
        reject(new Error('tarball file name was not passed on!'));
      }

      this.updateStep('image_build', 'running', null, (err) => {
        if (err) reject(err);

        let lastData = null;

        docker.buildImage(passon.tarballFile,
          { t: this.imageTag }, (error, output) => {
            if (error) {
              this.updateStep('image_build', 'failure', error, (err) => {
                if (err) reject(err);

                reject(error);
              });
            } else {
              output.on('data', d => {
                lastData = JSON.parse(d.toString('utf8'));
                this.textAppend('image_build', lastData.stream);
                debugBuild('[%s] [build] %s', this.jobId, JSON.stringify(lastData));
              });
              output.on('end', () => {
                // check if build actually succeeded
                if (lastData.error) {
                  debug('[%s] Created Docker image NOT created: %s', this.jobId, JSON.stringify(lastData));

                  this.updateStep('image_build', 'failure', lastData.error, (err) => {
                    if (err) reject(err);

                    reject(new Error(lastData.error));
                  });

                }
                else if (lastData.stream && lastData.stream.startsWith('Successfully built')) {
                  debug('[%s] Created Docker image %s: %s', this.jobId, this.imageTag, lastData.stream);

                  this.updateStep('image_build', 'success', null, (err) => {
                    if (err) reject(err);

                    passon.imageTag = this.imageTag;
                    fulfill(passon);
                  });
                }
              });
            }
          });
      });
    });
  };

  /*
   *  Run the container from previously build Image
   */
  this.runContainer = (passon) => {
    return new Promise((fulfill, reject) => {
      if (!passon.imageTag) {
        reject(new Error('image tag was not passed on!'));
      }

      debug('[%s] Run image: %s', this.jobId, passon.imageTag);

      this.updateStep('image_execute', 'running', null, (err) => {
        if (err) reject(err);

        // create stream that saves everything written to it to the correct text field in the database-document
        let stdStream = Stream.Writable();
        stdStream.job_id = this.jobId; // append job_id to stream object so that it can be used in event handlers
        stdStream._write = function (chunk, enc, next) {
          Job.findOne({ id: this.job_id }, (err, job) => {
            if (err) reject(err);

            if (job === null) {
              reject(new Error('job ' + this.job_id + ' not found'));
            }
            else {
              // define empty field text, otherwise a 'undefined' will always be the first word in the text field
              if (job.steps.image_execute.text === undefined) job.steps.image_execute.text = '';

              debugRun('[%s] [run] %s', this.job_id, chunk);
              job.steps.image_execute.text += chunk;
              job.save((err) => {
                if (err) reject(err);

                next();
              });
            }
          });
        };

        let create_options = clone(config.bagtainer.docker.create_options);
        let start_options = clone(config.bagtainer.docker.start_options);
        debug('Starting Docker container now with options:\n\tcreate_options: %s\n\tstart_options: %s',
          JSON.stringify(create_options), JSON.stringify(start_options));

        docker.run(passon.imageTag, [], stdStream, create_options, start_options, (err, data, container) => {
          passon.container = container; // pass on a reference to container for later cleanup
          if (err) {
            this.updateStep('image_execute', 'failure', err, (error) => {
              if (error) reject(error);

              reject(new Error(err.message));
            });
          } else {
            debugRun('[%s] [run] status code: %s', this.jobId, data.StatusCode);
            // check exit code of programm run inside the container, see http://tldp.org/LDP/abs/html/exitcodes.html
            if (data.StatusCode === 0) {
              this.updateStep('image_execute', 'success', null, (err) => {
                if (err) reject(err);

                Job.update({ id: this.jobId }, { 'steps.image_execute.statuscode': data.StatusCode }, (error) => {
                  if (error) reject(error);

                  debug('[%s] Completed image execution (with status code %s)', this.jobId, data.StatusCode);
                  fulfill(passon);
                });
              });
            } else {
              this.updateStep('image_execute', 'failure', null, (err) => {
                if (err) reject(err);

                Job.update({ id: this.jobId }, { 'steps.image_execute.statuscode': data.StatusCode }, (error) => {
                  if (error) reject(error);

                  reject(new Error('Received non-zero statuscode from container'));
                });
              });
            }
          }
        });
      });
    });
  };

  /*
   *  Cleanup after successful execution
   */
  this.cleanup = (passon) => {
    return new Promise((fulfill, reject) => {
      debug('[%s] Run cleanup regularly with %s', this.jobId, JSON.stringify(passon));

      // from https://github.com/apocas/dockerode/blob/976fe4ca205a4f48cd8628f7daf796af8017c705/test/docker.js#L159
      function locateImageByTag(imageTag, callback) {
        docker.listImages(function (err, list) {
          if (err) return callback(err);

          for (var i = 0, len = list.length; i < len; i++) {
            if (list[i].RepoTags.indexOf(imageTag) !== -1) {
              return callback(null, docker.getImage(list[i].Id));
            }
          }

          return callback();
        });
      }

      this.updateStep('cleanup', 'running', 'Running regular cleanup', (err) => {
        if (err) reject(err);

        if (passon) {
          Promise.all([
            new Promise((fulfill, reject) => {
              if (passon.container && !config.bagtainer.keepContainers) {
                debug('[%s] Removing container %s', this.jobId, passon.container.id);
                passon.container.remove(function (err, data) {
                  if (err) reject(err);

                  if (data === '') {
                    fulfill('Done: removed container.');
                  } else {
                    reject(new Error('Error removing container: ' + JSON.stringify(data)));
                  }
                });
              } else {
                fulfill('Done: container is kept!');
              }
            }),
            new Promise((fulfill, reject) => {
              if (passon.imageTag && !config.bagtainer.keepImages) {
                debug('[%s] Removing image %s', this.jobId, passon.imageTag);
                locateImageByTag(passon.imageTag, function (err, image) {
                  if (err) return reject(err);

                  function callback(error, data) {
                    if (error) reject(error);

                    fulfill('Done: removed image for tag ' + passon.imageTag + ': ' + JSON.stringify(data));
                  }

                  debug('[%s] Removing image %s', this.jobId, image.name);
                  if (image) return image.remove({ force: config.bagtainer.forceImageRemoval }, callback);
                });
              } else {
                fulfill('Done: kept image with tag ' + passon.imageTag + ' for job ' + this.jobId);
              }
            }),
            new Promise((fulfill, reject) => {
              // remove the payload tarball file
              if (passon.tarballFile) {
                debug('[%s] Unlinking tarball file %s', this.jobId, passon.tarballFile);
                fs.unlink(passon.tarballFile, (err) => {
                  if (err) reject(err);

                  debug('[%s] Unlinked tarball file %s', this.jobId, passon.tarballFile);
                  fulfill('Done: deleted tmp payload file.');
                });
              } else {
                fulfill('Done: no tarball found to delete.');
              }
            })
          ]).then((results) => {
            this.updateStep('cleanup', 'success', results.join('\n'), (err) => {
              if (err) {
                reject(err);
              } else {
                debug('[%s] Completed cleanup: %s', this.jobId, JSON.stringify(passon));
                fulfill(passon);
              }
            });
          });
        } else {
          this.updateStep('cleanup', 'success', 'Done: nothing provided that could be cleaned up', (err) => {
            if (err) {
              reject(err);
            } else {
              fulfill(passon);
            }
          });
        }
      });
    });
  };

  /*
   *  Cleanup after errorenous execution
   */
  this.cleanupFinally = () => {
    return new Promise((fulfill, reject) => {
      debug('[%s] [FINALLY] Run cleanup', this.jobId);

      // delete tarball file (again?)
      let tarballFile = config.payload.tarball.tmpdir + this.jobId + '.tar';
      fs.access(tarballFile, fs.constants.F_OK, (err) => {
        if (err) {
          debug('[%s] [FINALLY] Tarball file %s does not exist, nothing to unlink.', this.jobId, tarballFile);
        }
        else {
          debug('[%s] [FINALLY] Unlinking tarball file %s', this.jobId, tarballFile);
          fs.unlink(tarballFile, (error) => {
            if (error) reject(error);
            fulfill('Deleted tmp payload file');
          });
        }
      });
    })
  };

  /*
   *
   */
  this.execute = () => {
    debug('Executing %s', this.jobId);

    return this.loadBag({})
      .then(this.parseBagtainer)
      .then(this.packData)
      .then(this.buildImage)
      .then(this.runContainer)
      .catch(res => {
        debug("[%s] Unhandled failure (or rejection) during execute: \n\t%s", this.jobId, res);
      })
      .then(this.cleanup)
      .finally(this.cleanupFinally)
      .catch(res => {
        debug("[%s] Unhandled failure (or rejection) during cleanup: \n\t%s", this.jobId, res);
      });
  };
}

module.exports.Executor = Executor;
