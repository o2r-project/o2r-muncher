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
var Promise = require('bluebird');
var fs = require('fs');
var exec = require('child_process').exec;
var Docker = require('dockerode');
var yaml = require('yamljs');
var Bag = require('bagit');
var Stream = require('stream');

var config = require('../config/config');

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
          debug('Parsed bagtainer configuration: %s', this.bagtainer);

          this.updateStep('validate_compendium', 'success', null, (err) => {
            if (err) reject(err);
            fulfill(passon);
          });
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
        if (this.bagtainer.data.container) {
          let tarballFile = '/tmp/' + this.jobId + '.tar';
          exec('tar -cf ' + tarballFile + ' *',
            { cwd: this.basePath + this.jobId + '/data' },
            (error, stoud, stderr) => {
              if (error) {
                this.updateStep('image_prepare', 'failure', error, (err) => {
                  if (err) reject(err);
                  reject(error);
                });
              } else {
                this.updateStep('image_prepare', 'success', error, (err) => {
                  if (err) reject(err);
                  passon.tarballFile = tarballFile;
                  fulfill(passon);
                });
              }
            });
        } else {
          this.updateStep('image_prepare', 'failure', 'no container-dir spec\'d', (err) => {
            if (err) reject(err);
            reject(err);
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
        reject("tarball file name was not passed on!");
      }

      this.updateStep('image_build', 'running', null, (err) => {
        let imageTag = 'bagtainer:' + this.jobId;

        docker.buildImage(passon.tarballFile,
          { t: imageTag }, (error, res) => {
            if (error) {
              this.updateStep('image_build', 'failure', error, (err) => {
                if (err) reject(err);
                reject(error);
              });
            } else {
              res.on('data', d => {
                this.textAppend('image_build', JSON.parse(d.toString('utf8')).stream);
              });
              res.on('end', () => {
                this.updateStep('image_build', 'success', null, (err) => {
                  if (err) reject(err);
                  passon.imageTag = imageTag;
                  fulfill(passon);
                });
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
        reject("image tag was not passed on!");
      }

      this.updateStep('image_execute', 'running', null, (err) => {
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
                    reject('Received non-zero statuscode from container');
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
