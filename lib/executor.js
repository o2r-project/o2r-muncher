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
var debugBuild = require('debug')('builder');
var Promise = require('bluebird');
var fs = require('fs');
var Docker = require('dockerode');
var yaml = require('yamljs');
var Bag = require('bagit');
var Stream = require('stream');
var archiver = require('archiver');

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
  this.basePath = basePath || 'workspace/';
  if (!jobId) {
    return false;
  }
  this.jobId = jobId;
  this.bag = {};
  this.bagtainer = {};
  // https://nodejs.org/api/process.html#process_event_unhandledrejection
  process.on('unhandledRejection', (reason, p) => {
    console.log('Unhandled Rejection at: Promise', p, 'reason:', reason);
    debug('Unhandled Rejection: \n\tPromise %s \n\tReason: %s', JSON.stringify(p), reason);
  });

  debug('Job set up with path %s', this.basePath + this.jobId);

  // setup Docker client
  var docker = new Docker();
  debug('Docker client set up: %s', JSON.stringify(docker));

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
        this.bag = new Bag(this.basePath + this.jobId);
        this.bag
          .validate(config.bagtainer.validateFast)
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
          containerfile = this.basePath + this.jobId + this.bagtainer.containerfile;
        } else {
          containerfile = this.basePath + this.jobId + defaults.containerfile;
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
              currentExecutor.updateStep('image_prepare', 'success', 'payload with ' + archive.pointer() + ' total bytes', (err) => {
                if (err) reject(err);

                passon.tarballFile = tarballFileName;
                fulfill(passon);
              });
            });

            archive.pipe(tarballFile);

            let fullpath = this.basePath + this.jobId + defaults.payloadDirectory;
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

        let imageTag = 'bagtainer:' + this.jobId;
        let lastData = null;

        docker.buildImage(passon.tarballFile,
          { t: imageTag }, (error, output) => {
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
                  debug('[%s] Created Docker image %s: %s', this.jobId, imageTag, lastData.stream);

                  this.updateStep('image_build', 'success', null, (err) => {
                    if (err) reject(err);

                    passon.imageTag = imageTag;
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
    debug('[%s] Run image: %s', this.jobId, passon);

    return new Promise((fulfill, reject) => {
      if (!passon.imageTag) {
        reject(new Error('image tag was not passed on!'));
      }

      this.updateStep('image_execute', 'running', null, (err) => {
        if (err) reject(err);

        // create stream that saves everything written to it to the text field in the database-document
        let stdStream = Stream.Writable();
        stdStream.job_id = this.jobId; // append job_id to stream object so that it can be used in event handlers
        stdStream._write = function (chunk, enc, next) {
          Job.findOne({ id: this.jobId }, (err, job) => {
            if (err) reject(err);
            if (job === null) reject('job not found');
            // define .text, otherwise a 'undefined' will always be the first word in the text field
            if (job.steps.image_execute.text === undefined) job.steps.image_execute.text = '';
            job.steps.image_execute.text += chunk;
            job.save((err) => {
              if (err) reject(err);

              next();
            });
          });
        };

        docker.run(passon.imageTag, [], stdStream, '', '--rm',
          (err, data, container) => {
            passon.container = container; // pass on  reference to container for later cleanup
            if (err) {
              this.updateStep('image_execute', 'failure', err, (error) => {
                if (error) reject(error);

                reject(err);
              });
            } else {
              // check exit code of programm run inside the container
              if (data.StatusCode) {
                this.updateStep('image_execute', 'failure', null, (err) => {
                  if (err) reject(err);

                  Job.update({ id: this.jobId }, { 'steps.image_execute.statuscode': data.StatusCode }, (error) => {
                    if (error) reject(error);
                    reject(new Error('Received non-zero statuscode from container'));
                  });
                });
              } else {
                this.updateStep('image_execute', 'success', null, (err) => {
                  if (err) reject(err);

                  fulfill(passon);
                });
              }
            }
          });
      });
    });
  };

  /*
   *  Cleanup unnecessary files?
   */
  this.cleanup = (passon) => {
    debug('[%s] clean up: %s', this.jobId, passon);

    return new Promise((fulfill, reject) => {
      this.updateStep('cleanup', 'running', null, (err) => {
        if (err) reject(err);

        this.updateStep('cleanup', 'success', null, (err) => {
          if (err) reject(err);

          fulfill(passon);
        });
      });
    });
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
      .finally(this.cleanup)
      .catch(res => {
        debug("[%s] Unhandled failure (or rejection) during execute: \n\t%s", this.jobId, res);
      });
  };
}

module.exports.Executor = Executor;
