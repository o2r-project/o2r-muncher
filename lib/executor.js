/*
 * (C) Copyright 2016 Jan Koppe.
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
//var tar = require('tar');
var exec = require('child_process').exec;
var fstream = require('fstream');
var Docker = require('dockerode');
var yaml = require('yamljs');
var Bag = require('bagit');
var Stream = require('stream');

var c = require('../config/config');

var Job = require('../lib/model/job');

function Executor(packageName, basePath) {
  // setup Executor
  this.basePath = basePath || 'workspace/';
  if (!packageName) {
    return false;
  }
  this.packageName = packageName;
  this.bag = {};
  this.bagtainer = {};

  debug('Executor set up with base path "%s" and package name "%s"', this.basePath, this.packageName);

  // setup Docker client
  var docker = new Docker();
  debug('Docker client set up: %s', docker);

  /*
   *  Helper Function for appending single lines/data to the text field of a
   *  step in the database. used for streaming logs.
   */
  this.textAppend = (step, data) => {
    Job.findOne({'id': this.packageName}, (err, job) => {
      if (err) throw err;
      if (job === null) throw new Error('no job found');
      // check if field exists, otherwise textfield will include 'undefined'.
      if (job.steps[step].text === undefined) job.steps[step].text = '';
      job.steps[step].text += data;
      job.save((err) => {
        if (err) throw err;
      });
    });
  };

  this.updateStep = (id, step, status, text, cb) => {
    let fields = {};
    if (status)
      fields['steps.' + step + '.status'] = status;
    if (text)
      fields['steps.' + step + '.text'] = text;

    switch (status) {
      case 'running':
        fields['steps.' + step + '.start' ] = new Date;
        break;
      case 'success':
      case 'failure':
        fields['steps.' + step + '.end' ] = new Date;
        break;
      default:
        break;
    }

    Job.update({id}, fields, (err) => {
      cb(err);
    });
  };

  /*
   *  Load the associated bag, check if it's valid.
   */
  this.loadBag = (passon) => {
    return new Promise((fulfill, reject) => {
      this.updateStep(this.packageName, 'validate_bag', 'running', null, (err) => {
        if (err) reject(err);
        this.bag = new Bag(this.basePath + this.packageName);
        this.bag.validate('fast').catch(e => {
          this.updateStep(this.packageName, 'validate_bag', 'failure', e, (err) => {
            if (err) reject(err);
            reject('loadBag:', e);
          });
        }).then(() => {
          this.updateStep(this.packageName, 'validate_bag', 'success', null, (err) => {
            if (err) reject(err);
            fulfill(passon);
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
      this.updateStep(this.packageName, 'validate_compendium', 'running', null, (err) => {
        if (err) reject(err);
        try {
          var input = fs.readFileSync(this.basePath + this.packageName + '/data/Bagtainer.yml', 'utf-8');
          this.bagtainer = yaml.parse(input);

          this.updateStep(this.packageName, 'validate_compendium', 'success', null, (err) => {
            if (err) reject(err);
            fulfill(passon);
          });
        } catch (e) {
          this.updateStep(this.packageName, 'validate_compendium', 'failure', e, (err) => {
            if (err) reject(err);
            reject(e);
          });
        }
      });
    });
  };

  /*
   *  Put Bag-Payload in a tarball, needed to pass on to docker server
   */
  this.packData = (passon) => {
    return new Promise((fulfill, reject) => {
      this.updateStep(this.packageName, 'image_prepare', 'running', null, (err) => {
        if (err) reject(err);
        if(this.bagtainer.data.container) {
          exec('tar -cf /tmp/' + this.packageName + '.tar *',
          {cwd: this.basePath + this.packageName + '/data'},
          (error, stoud, stderr) => {
            if (error) {
              this.updateStep(this.packageName, 'image_prepare', 'failure', error, (err) => {
                if (err) reject(err);
                reject(error);
              });
            } else {
              this.updateStep(this.packageName, 'image_prepare', 'success', error, (err) => {
                if (err) rejec(err);
                fulfill(passon);
              });
            }
          });
        } else {
          this.updateStep(this.packageName, 'image_prepare', 'failure', 'no container-dir spec\'d', (err) => {
            if (err) reject(err);
            reject(err);
          });
        }
      });
    });
  };

  /*
   *  Submit tarball to docker server, build Image from that
   */
  this.buildImage = (passon) => {
    return new Promise((fulfill, reject) => {
      this.updateStep(this.packageName, 'image_build', 'running', null, (err) => {
        docker.buildImage('/tmp/' + this.packageName + '.tar',
            {t: 'bagtainer:' + this.packageName}, (error, res) => {
          if (error) {
            this.updateStep(this.packageName, 'image_build', 'failure', error, (err) => {
              if (err) reject(err);
              reject(error);
            });
          } else {
            res.on('data', d => {
              this.textAppend('image_build', JSON.parse(d.toString('utf8')).stream);
            });
            res.on('end', () => {
              this.updateStep(this.packageName, 'image_build', 'success', null, (err) => {
                if (err) reject(err);
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
    return new Promise((fulfill, reject) => {
      this.updateStep(this.packageName, 'image_execute', 'running', null, (err) => {
        // create stream that saves everything written to it to the text field in the database-document
        let stdStream = Stream.Writable();
        stdStream.job_id = this.packageName; //append job_id to stream object so that it can be used in event handlers
        stdStream._write = function (chunk, enc, next) {
          Job.findOne({'id' : this.job_id}, (err, job) => {
            if (err) reject(err);
            if (job === null) reject('job not found');
            // define .text, otherwise a 'undefined' will always be the first word in the text field
            if (job.steps.image_execute.text === undefined) job.steps.image_execute.text = '';
            job.steps.image_execute.text += chunk;
            job.save((err) => {
              if (err) reject (err);
              next();
            });
          });
        };

        docker.run('bagtainer:' + this.packageName, [], stdStream, '', '--rm',
          (err, data, container) => {
            passon.container = container; // pass on  reference to container for later cleanup
            if (err) {
              this.updateStep(this.packageName, 'image_execute', 'failure', err, (error) => {
                if (error) reject(error);
                reject(err);
              });
            } else {
              // check exit code of programm run inside the container
              if (data.StatusCode) {
                this.updateStep(this.packageName, 'image_execute', 'failure', null, (err) => {
                  if (err) reject (err);
                  Job.update({id: this.packageName}, {'steps.image_execute.statuscode' : data.StatusCode}, (error) => {
                    if (error) reject (error);
                    reject('returned non-zero statuscode');
                  });
                });
              } else {
                this.updateStep(this.packageName, 'image_execute', 'success', null, (err) => {
                  if (err) reject (err);
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
    return new Promise((fulfill, reject) => {
      this.updateStep(this.packageName, 'cleanup', 'running', null, (err) => {
        if (err) reject(err);
        this.updateStep(this.packageName, 'cleanup', 'success', null, (err) => {
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
    debug('Executing %s', this.packageName);

    return this.loadBag({})
      .then(this.parseBagtainer)
      .then(this.packData)
      .then(this.buildImage)
      .then(this.runContainer)
      .finally(this.cleanup);
  };
}

module.exports.Executor = Executor;
