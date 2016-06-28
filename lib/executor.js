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
  if(!packageName) {
    return false;
  }
  this.packageName = packageName;
  this.bag = {};
  this.bagtainer = {};
  // setup Docker client
  var docker = new Docker();

  /**
   *  Helper Function for appending single lines/data to the text field of a
   *  step in the database. used for streaming logs.
   */
  this.textAppend = (step, data) => {
    Job.findOne({'id': this.packageName}, (err, job) => {
      if (err) throw err;
      if (job === null) throw new Error('no job found');
      //check if field exists, otherwise textfield will include 'undefined'.
      if (job.steps[step].text === undefined) job.steps[step].text = '';
      job.steps[step].text += data;
      job.save((err) => {
        if (err) throw err;
      });
    });
  };
  /**
   *  Load the associated bag, check if it's valid.
   */
  this.loadBag = (passon) => {
    return new Promise((fulfill, reject) => {
      this.bag = new Bag(this.basePath + this.packageName);
      this.bag.validate('fast')
      .catch(e => {
        Job.update({id:this.packageName}, {'steps.validate_bag.status':'failure'}, (err) => {
          reject('loadBag: ' + e);
        });
      })
      .then(() => {
        Job.update({id:this.packageName}, {'steps.validate_bag.status':'success'}, (err) => {
          fulfill(passon);
        });
      });
    });
  };

  /**
   *  Parse the Bagtainer.yml, save content
   */
  this.parseBagtainer = (passon) => {
    return new Promise((fulfill, reject) => {
      try {
        var input = fs.readFileSync(this.basePath + this.packageName +
          '/data/Bagtainer.yml', 'utf-8');
        this.bagtainer = yaml.parse(input);
        Job.update({id:this.packageName}, {'steps.validate_compendium.status':'success'}, (err) => {
          if (err) {
            reject(err);
          } else {
            fulfill(passon);
          }
        });
      }
      catch (e) {
        reject('parseBagtainer: ' + e);
      }
    });
  };

  /**
   *  Put Bag-Payload in a tarball, needed to pass on to docker server
   */
  this.packData = (passon) => {
    return new Promise((fulfill, reject) => {
      if(this.bagtainer.data.container) {
        exec('tar -cf /tmp/' + this.packageName + '.tar *',
        {cwd: this.basePath + this.packageName + '/data'},
        (error, stoud, stderr) => {
          if (error) {
            Job.update({id:this.packageName},
                {
                  'steps.image_build.status':'failure',
                  'steps.image_build.text':'error while packing: ' + error
                }, (err) => {
              reject('packData: error while packing: ' + error);
            });
          } else {
            fulfill(passon);
          }
        });
      } else {
        Job.update({id:this.packageName},
            {
              'steps.image_build.status':'failure',
              'steps.image_build.text':'no container-dir specified'
            }, (err) => {
          reject('packData: no container directory specified');
        });
      }
    });
  };

  /**
   *  Submit tarball to docker server, build Image from that
   */
  this.buildImage = (passon) => {
    return new Promise((fulfill, reject) => {
      Job.update({id:this.packageName}, {'steps.image_build.status':'running'}, (err) => {
        if(this.bagtainer.data.container) {
          docker.buildImage('/tmp/' + this.packageName + '.tar',
              {t: 'bagtainer:' + this.packageName},
          (err, response) => {
            if(err) {
              Job.update({id:this.packageName},
                  {
                    'steps.image_build.status':'failure',
                    'steps.image_build.text':err
                  }, (err) => {
                reject(err);
              });
            } else {
              response.on('data', d => {
                this.textAppend('image_build',
                    JSON.parse(d.toString('utf8')).stream);
              });
              response.on('end', () => {
                Job.update({id:this.packageName},
                    {
                      'steps.image_build.status':'success'
                    }, (err) => {
                      if (err) reject(err);
                      else fulfill(passon);
                    });
              });
            }
          });
        } else {
          Job.update({id:this.packageName},
              {
                'steps.image_build.status':'failure',
                'steps.image_build.text':'no container-dir specified'
              }, (err) => {
            reject('buildImage: no container directory specified');
          });
        }
      });
    });
  };

  /**
   *  Run the container from previously build Image
   */
  this.runContainer = (passon) => {
    // Prepare dummy stream to log the output from the container
    var stdstream = Stream.Writable();
    // 
    stdstream.job_id = this.packageName;
    stdstream._write = function (chunk, enc, next) {
      Job.findOne({'id': this.job_id}, (err, job) => {
        if (err) throw err;
        if (job === null) throw new Error('no job found');
        //check if field exists, otherwise textfield will include 'undefined'.
        if (job.steps.image_execute.text === undefined) {
          job.steps.image_execute.text = '';
        }
        job.steps.image_execute.text += chunk;
        job.save((err) => {
          if (err) throw err;
          next();
        });
      });
    };
    var id = this.packageName;
    return new Promise((fulfill, reject) => {
      Job.update({id}, {'steps.image_execute.status':'running'}, (err) => {
        docker.run('bagtainer:' + this.packageName, [], stdstream, '', '--rm',
        (error, data, container) => {
          if (error) {
            Job.update({id},
                {
                  'steps.image_execute.status':'failure',
                  'steps.image_execute.text': error
                }, (err) => {
              reject(error);
            });
          } else {
            if(data.StatusCode) {
              Job.update({id},
                  {
                    'steps.image_execute.status':'failure',
                    'steps.image_execute.statuscode': data.StatusCode
                  }, (err) => {
                reject('runContainer: exit StatusCode ' + data.StatusCode);
              });
            } else {
              Job.update({id},
                  {
                    'steps.image_execute.status':'success',
                    'steps.image_execute.statuscode': data.StatusCode
                  }, (err) => {
                debug(id);
                debug(err);
                debug(data);
                fulfill(passon);
              });
            }
          }
        });
      });
    });
  };

  /**
   *  Cleanup unnecessary files?
   */
  this.cleanup = (passon) => {
    return new Promise((fulfill, reject) => {
      debug('cleanup: Ich putz\' hier nur.');
      Job.update({id:this.packageName}, {'steps.cleanup.status':'success'}, (err) => {
        if (err) reject(err);
        else fulfill(passon);
      });
    });
  };
  /**
   *
   */

  this.execute = () => {
    return this.loadBag()
      .then(this.parseBagtainer)
      .then(this.packData)
      .then(this.buildImage)
      .then(this.runContainer)
      .finally(this.cleanup);
  };


}

module.exports.Executor = Executor;
