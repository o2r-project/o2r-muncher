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
const config = require('../config/config');
const debug = require('debug')('muncher:images');
const fs = require('fs');
const Job = require('../lib/model/job');
const Docker = require('dockerode');
const path = require('path');

let docker = new Docker();
debug('Docker client set up to accessing images: %s', JSON.stringify(docker));

module.exports.saveImageFromJob = function saveImage(job_id, file, stepUpdate, callback) {

  let removeOldTarball = (passon) => {
    return new Promise((fulfill, reject) => {
      fs.access(imageTarballFile, fs.constants.F_OK, (err) => {
        if (!err) {
          debug('[%s] Image tarball file exists, removing it...', job_id);
          stepUpdate('image_save', 'running', '[Deleting existing image tarball file]', (error) => {
            if (error) reject(error);
            else {
              fs.unlink(imageTarballFile, (error) => {
                if (error) reject(error);
                else {
                  fulfill(passon);
                }
              });
            }
          });
        } else {
          fulfill(passon);
        }
      });
    });
  }

  let createStream = (passon) => {
    return new Promise((fulfill, reject) => {
      passon.stream = fs.createWriteStream(passon.file);
      fulfill(passon);
    });
  }

  let inspect = (passon) => {
    return new Promise((fulfill, reject) => {
      passon.image.inspect((err, data) => {
        if (err) {
          debug('[%s] Error inspecting image: %s', passon.id, err);
          reject(err);
        }
        else {
          debug('[%s] Image tags (a.k.a.s): %s', passon.id, JSON.stringify(data.RepoTags));
          fulfill(passon);
        }
      });
    })
  };

  let getAndSave = (passon) => {
    return new Promise((fulfill, reject) => {
      debug('[%s] Getting image %s ...', passon.id, JSON.stringify(passon.image));
      passon.image.get((err, imageStream) => {
        if (err) {
          debug('[%s] Error while handling image stream: %s', passon.id, err.message);
          reject(err);
        }
        else {
          debug('Saving image stream to provided stream: %s > %s', imageStream, passon.stream);

          passon.stream.on('finish', function () {
            debug('[%s] Image saved to provided stream', passon.id);
            fulfill(passon);
          });
          passon.stream.on('error', (err) => {
            debug('[%s] Error saving image to provided stream: %s', passon.id, err);
            reject(err);
          });

          imageStream.pipe(passon.stream);
        }
      });
    })
  };

  let answer = (passon) => {
    return new Promise((fulfill) => {
      debug('[%s] Answering callback... saved image %s', job_id, passon.image.name);
      callback();
      fulfill(passon);
    })
  };

  let imageTag = config.bagtainer.imageNamePrefix + job_id;
  debug('[%s] Retrieving tagged image %s', job_id, imageTag);
  let image = docker.getImage(imageTag);
  debug('[%s] Found image: %s', job_id, image.name);

  removeOldTarball({ image: image, file: file, id: job_id })
    .then(createStream)
    .then(inspect)
    .then(getAndSave)
    .then(answer)
    .catch(err => {
      debug("[%s] Rejection or unhandled failure while saving image %s to file:\n\t%s", job_id, image.name, err);
      callback(err);
    });
}
