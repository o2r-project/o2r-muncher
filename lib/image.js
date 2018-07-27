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
const tarlist = require('tar').list;

let docker = new Docker({
  socketPath: '/var/run/docker.sock',
  version: 'v1.25'
});
debug('Docker client set up to accessing images: %O', docker);

module.exports.saveImageFromJob = function saveImage(job_id, compendium_id, file, stepUpdate, callback) {

  let removeOldTarball = (passon) => {
    return new Promise((fulfill, reject) => {
      fs.access(passon.file, fs.constants.F_OK, (err) => {
        if (!err) {
          debug('[%s] Image tarball file exists, removing it...', job_id);
          stepUpdate('image_save', 'running', '[Deleting existing image tarball file]', (error) => {
            if (error) reject(error);
            else {
              fs.unlink(passon.file, (error) => {
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

  let getAndSave = (passon) => {
    return new Promise((fulfill, reject) => {
      debug('[%s] Getting images for %o', passon.log_id, passon.tags);

      // v1.24 see "Get a tarball containing all images" in https://docs.docker.com/engine/api/v1.24/#32-images
      query = passon.tags.map(e => 'names=' + e).join('&');
      // v1.25 https://docs.docker.com/engine/api/v1.25/#operation/ImageGetAll
      
      // opts based on https://github.com/apocas/dockerode/blob/master/lib/image.js#L124
      var opts = {
        path: '/images/get?' + query,
        method: 'GET',
        isStream: true,
        statusCodes: {
          200: true,
          500: 'server error'
        }
      };
      debug('[%s] Docker API query: %o', passon.log_id, opts);

      docker.modem.dial(opts, (err, imageStream) => {
        if (err) {
          debug('[%s] Error while handling image stream: %o', passon.log_id, err);
          reject(err);
        }
        else {
          debug('Saving image stream to provided stream: %s > %s', imageStream, passon.stream);

          passon.stream.on('finish', function () {
            debug('[%s] Image saved to provided stream', passon.log_id);
            fulfill(passon);
          });
          passon.stream.on('error', (err) => {
            debug('[%s] Error saving image to provided stream: %s', passon.log_id, err);
            reject(err);
          });

          imageStream.pipe(passon.stream);
        }
      });
    });
  };

  let answer = (passon) => {
    return new Promise((fulfill) => {
      debug('[%s] Answering callback... saved image with tags %s', job_id, passon.tags);
      callback();
      fulfill(passon);
    })
  };

  let tags = [encodeURIComponent(config.bagtainer.image.prefix.job + job_id)]; //, config.bagtainer.image.prefix.compendium + compendium_id];
  debug('[%s] Saving image using tags %s', job_id, tags);

  removeOldTarball({ tags: tags, file: file, log_id: job_id })
    .then(createStream)
    .then(getAndSave)
    .then(answer)
    .catch(err => {
      debug("[%s] Rejection or unhandled failure while saving images %o to file:\n\t%o", job_id, tags, err);
      callback(err);
    });
}

module.exports.synchroniseImageTags = function synchroniseImageTags(compendium_id, job_id, callback) {
  let imageTagCompendium = config.bagtainer.image.prefix.compendium + compendium_id;
  let imageTagJob = config.bagtainer.image.prefix.job + job_id;

  done = function (callback) {
    debug('Image tagged with both %s and %s', imageTagCompendium, imageTagJob);
    callback();
  }

  let compendiumImage = docker.getImage(imageTagCompendium);
  compendiumImage.inspect((err, data) => {
    if (err) {
      // compendium image not found, try the other way around
      let jobImage = docker.getImage(imageTagJob);
      jobImage.tag({
        repo: config.bagtainer.image.name.compendium,
        tag: compendium_id
      }, (err, data) => {
        if (err) {
          debug('Error during tagging job image with compendium ID: %o', compendium_id, err);
          callback(err);
        } else {
          done(callback);
        }
      });
    } else {
      compendiumImage.tag({
        repo: config.bagtainer.image.name.job,
        tag: job_id
      }, (err, data) => {
        if (err) {
          debug('Error during tagging compendium image with job ID: %o', job_id, err);
          callback(err);
        } else {
          done(callback);
        }
      });
    }
  });
}

module.exports.getDigestFromTarball = function getDigestFromTarball(imageTarballFile, callback) {
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
      debug('Extracted digest %s from file %s', tarballDigest, imageTarballFile);
    }
  }, er => {
    if (er) callback(er);
    else callback(null, tarballDigest);
  });
}
