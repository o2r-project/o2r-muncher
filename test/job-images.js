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

/* eslint-env mocha */
const assert = require('chai').assert;
const request = require('request');
const config = require('../config/config');
const createCompendiumPostRequest = require('./util').createCompendiumPostRequest;
const publishCandidate = require('./util').publishCandidate;
const waitForJob = require('./util').waitForJob;
const startJob = require('./util').startJob;
const mongojs = require('mongojs');
const fs = require('fs');
const path = require('path');
const debug = require('debug')('test:job-images');
const tmp = require('tmp');
const AdmZip = require('adm-zip');
const tarStream = require('tar-stream');
const stream = require('stream');

require("./setup");
const cookie_o2r = 's:C0LIrsxGtHOGHld8Nv2jedjL4evGgEHo.GMsWD5Vveq0vBt7/4rGeoH5Xx7Dd2pgZR9DvhKCyDTY';

let Docker = require('dockerode');
let docker = new Docker();

describe('Images in uploads and downloads', () => {
  var db = mongojs('localhost/muncher', ['compendia', 'jobs']);

  before(function (done) {
    db.compendia.drop(function (err, doc) {
      db.jobs.drop(function (err, doc) {
        done();
      });
    });
  });

  after(function (done) {
    db.close();
    done();
  });

  describe('Find image tarball in compendium if it is exists and use it for running the job', () => {
    let job_id, compendium_id, job_id2 = '';

    workspacePath = './test/workspace/with-image-tarball';
    let imageTag = 'erc:12345';
    imageTarballFile = path.join(workspacePath, config.bagtainer.imageTarballFile);

    before(function (done) {
      this.timeout(360000);

      uploadCompendiumWithImageTarball = function() {
        createCompendiumPostRequest(workspacePath, cookie_o2r, 'workspace', (requestData) => {
          request(requestData, (err, res, body) => {
            if (err) throw err;
            compendium_id = JSON.parse(body).id;
            publishCandidate(compendium_id, cookie_o2r, () => {
              startJob(compendium_id, id => {
                job_id = id;
                waitForJob(job_id, (finalStatus) => {
                  done();
                });
              });
            });
          });
        });
      }

      fs.access(imageTarballFile, (err) => {
        if (err) {
          debug('build local image tarball at %s', imageTarballFile);
          docker.buildImage({
            context: workspacePath,
            src: ['Dockerfile']
          }, { t: imageTag }, function (err, stream) {
            if (err) throw err;

            stream.on('data', function (data) {
              s = JSON.parse(data.toString('utf8'));
              if (s.stream) debug(s.stream.substring(0, 100).trim());
            });

            stream.on('end', function () {
              debug('built image %s, now saving to %s', imageTag, imageTarballFile);
              fileStream = fs.createWriteStream(imageTarballFile);

              fileStream.on('finish', function () {
                debug('Image saved');

                uploadCompendiumWithImageTarball();
              });

              image = docker.getImage(imageTag);
              image.get((err, imageStream) => {
                if (err) throw err;
                imageStream.pipe(fileStream);
              });
            });
          });
        } else {
          debug('local image tarball file found as expected at %s. YOU MUST MANUALLY DELETE THIS FILE AND the upload cache file' +
                ', see test:util log below) if the content at %s changed. Uploading workspace now...',
            imageTarballFile, workspacePath);
            uploadCompendiumWithImageTarball();
        }
      });
    });

    it('should complete most steps and skip bag validation, manifest generation', (done) => {
      request(global.test_host + '/api/v1/job/' + job_id, (err, res, body) => {
        if (err) throw err;
        assert.ifError(err);
        let response = JSON.parse(body);

        assert.propertyVal(response.steps.validate_bag, 'status', 'skipped', 'validate bag');
        assert.propertyVal(response.steps.validate_compendium, 'status', 'success', 'validate compendium');
        assert.propertyVal(response.steps.image_prepare, 'status', 'success', 'image prepare');
        assert.propertyVal(response.steps.image_build, 'status', 'success', 'image build');
        assert.propertyVal(response.steps.image_execute, 'status', 'success', 'image execute');
        assert.propertyVal(response.steps.cleanup, 'status', 'success', 'cleanup');
        done();
      });
    });

    it('should not have a reference to the image digest in step image_build', function (done) {
      request(global.test_host + '/api/v1/job/' + job_id + '?steps=all', (err, res, body) => {
        assert.ifError(err);
        let response = JSON.parse(body);

        assert.notProperty(response.steps.image_save, 'imageId');
        done();
      });
    });

    it('should not have a reference to the image file in step image_save', function (done) {
      request(global.test_host + '/api/v1/job/' + job_id + '?steps=all', (err, res, body) => {
        assert.ifError(err);
        let response = JSON.parse(body);

        assert.notProperty(response.steps.image_save, 'file');
        done();
      });
    });

    it('should mention loading the existing tarball', function (done) {
      request(global.test_host + '/api/v1/job/' + job_id + '?steps=image_build', (err, res, body) => {
        assert.ifError(err);
        let response = JSON.parse(body);

        assert.property(response.steps.image_build, 'text');
        assert.include(JSON.stringify(response.steps.image_build.text), 'Image tarball found');
        assert.include(JSON.stringify(response.steps.image_build.text), 'Loaded image tarball from file ' + config.bagtainer.imageTarballFile);
        done();
      });
    });

    it('should have tagged an image for both the compendium and the job and have the original image tag (skipped if images are not kept)', function (done) {
      if (config.bagtainer.keepImages) {
        docker.listImages(function (err, images) {
          assert.ifError(err);

          let names = new Set();
          images.forEach(function (image) {
            if (image.RepoTags) {
              image.RepoTags.forEach(function (tag) {
                names.add(tag);
              });
            }
          });

          assert.include(names, config.bagtainer.image.prefix.compendium + compendium_id);
          assert.include(names, config.bagtainer.image.prefix.job + job_id);
          assert.include(names, imageTag);
          done();
        });
      } else {
        this.skip();
      }
    }).timeout(30000);

  });

  describe('Image tags tarballs', function () {
    before(function (done) {
      this.timeout(30000);

      createCompendiumPostRequest('./test/workspace/dummy', cookie_o2r, 'workspace', (requestData) => {

        request(requestData, (err, res, body) => {
          assert.ifError(err);
          compendium_id = JSON.parse(body).id;

          publishCandidate(compendium_id, cookie_o2r, () => {
            startJob(compendium_id, id => {
              assert.ok(id);
              job_id = id;
              waitForJob(job_id, (finalStatus) => {
                done();
              });
            })
          });
        });
      });
    });

    it('should have the correct job tag on the image in tarball', (done) => {
      let tmpfile = tmp.tmpNameSync() + '.zip';
      let url = global.test_host_transporter + '/api/v1/compendium/' + compendium_id + '.zip';
      request.get(url)
        .on('error', function (err) {
          done(err);
        })
        .pipe(fs.createWriteStream(tmpfile))
        .on('finish', function () {
          let zip = new AdmZip(tmpfile);

          zip.getEntries().forEach(function (entry) {
            if (entry.entryName === 'image.tar') {
              let manifestJson = null;
              let extractTar = tarStream.extract();
              let manifests = 0;

              extractTar.on('entry', function (header, stream, next) {
                if (header.name == 'manifest.json') {
                  manifests++;
                  const chunks = [];
                  stream.on('data', function (chunk) {
                    chunks.push(chunk);
                  });
                  stream.on('end', function () {
                    manifestJson = JSON.parse(chunks)[0];
                    next();
                  });
                } else {
                  stream.on('end', function () {
                    next();
                  })
                }
                stream.resume();
              });
              extractTar.on('finish', function () {
                assert.oneOf('job:' + job_id, manifestJson.RepoTags, '"job:<job_id>" tag is in RepoTags list');
                assert.equal(manifests, 2, 'two manifest files, only the newest will be extracted'); // see also https://github.com/npm/node-tar/issues/149
                done();
              });
              extractTar.on('error', function (e) {
                done(e);
              });

              let bufferStream = new stream.PassThrough();
              bufferStream.end(new Buffer(entry.getData()));
              bufferStream.pipe(extractTar);
            }
          });
        });
    }).timeout(60000);

    it('should have the correct compendium tag on the image in tarball', (done) => {
      let tmpfile = tmp.tmpNameSync() + '.zip';
      let url = global.test_host_transporter + '/api/v1/compendium/' + compendium_id + '.zip';
      request.get(url)
        .on('error', function (err) {
          done(err);
        })
        .pipe(fs.createWriteStream(tmpfile))
        .on('finish', function () {
          let zip = new AdmZip(tmpfile);

          zip.getEntries().forEach(function (entry) {
            if (entry.entryName === 'image.tar') {
              let manifestJson = null;
              let extractTar = tarStream.extract();
              extractTar.on('entry', function (header, stream, next) {
                if (header.name == 'manifest.json') {
                  const chunks = [];
                  stream.on('data', function (chunk) {
                    chunks.push(chunk);
                  });
                  stream.on('end', function () {
                    manifestJson = JSON.parse(chunks)[0];
                    next();
                  });
                } else {
                  stream.on('end', function () {
                    next();
                  })
                }
                stream.resume();
              });
              extractTar.on('finish', function () {
                assert.oneOf('erc:' + compendium_id, manifestJson.RepoTags, '"erc:<erc_id>" tag is in RepoTags list');

                done();
              });
              extractTar.on('error', function (e) {
                done(e);
              });

              let bufferStream = new stream.PassThrough();
              bufferStream.end(new Buffer(entry.getData()));
              bufferStream.pipe(extractTar);
            }
          });
        });
    }).timeout(60000);
  });

});
