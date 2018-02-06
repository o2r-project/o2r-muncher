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
const startJob = require('./util').startJob;
const mongojs = require('mongojs');
const fs = require('fs');
const sleep = require('sleep');
const unameCall = require('node-uname');
const path = require('path');
const debug = require('debug')('test:job-images');

require("./setup");
const cookie_o2r = 's:C0LIrsxGtHOGHld8Nv2jedjL4evGgEHo.GMsWD5Vveq0vBt7/4rGeoH5Xx7Dd2pgZR9DvhKCyDTY';
const cookie_plain = 's:yleQfdYnkh-sbj9Ez--_TWHVhXeXNEgq.qRmINNdkRuJ+iHGg5woRa9ydziuJ+DzFG9GnAZRvaaM';
const sleepSecs = 50;

let Docker = require('dockerode');
let docker = new Docker();

/*

describe('Workspaces with images in the upload', () => {
  var db = mongojs('localhost/muncher', ['compendia', 'jobs']);
  console.log("zero");

  before(function (done) {
    console.log("one");
    db.compendia.drop(function (err, doc) {
      db.jobs.drop(function (err, doc) {
        console.log("one.1");
        done();
      });
    });
  });

  after(function (done) {
    db.close();
    done();
  });

  describe('Find image tarball if it is uploaded and use it for running the job', () => {
    let job_id, compendium_id, job_id2 = '';

    workspacePath = './test/workspace/with-image-tarball';
    imageTag = 'erc:12345';
    imageTarballFile = path.join(workspacePath, config.bagtainer.imageTarballFile);
    createRequest = createCompendiumPostRequest(workspacePath, cookie_o2r, 'workspace');
    console.log("two");

    before(function (done) {
      this.timeout(80000);

      fs.access(imageTarballFile, (err) => {
        if (err) {
          debug('local image tarball file found at %s', imageTarballFile);
          request(createRequest, (err, res, body) => {
            compendium_id = JSON.parse(body).id;
            publishCandidate(compendium_id, cookie_o2r, () => {
              startJob(compendium_id, id => {
                job_id = id;
                done();
              });
            });
          });
        } else {
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

                request(createRequest, (err, res, body) => {
                  compendium_id = JSON.parse(body).id;
                  publishCandidate(compendium_id, cookie_o2r, () => {
                    startJob(compendium_id, id => {
                      job_id = id;
                      done();
                    });
                  });
                });
              });

              image = docker.getImage(imageTag);
              image.get((err, imageStream) => {
                if (err) throw err;
                imageStream.pipe(fileStream);
              });
            });
          });
        }
      });

    });

    //after(function (done) {
    //  fs.unlink(imageTarballFile, (err) => {
    //    if (err) throw err;
    //    done();
    //  });
    //});

    it('should complete all steps (skip bag validation, manifest generation, and image build', (done) => {
      request(global.test_host + '/api/v1/job/' + job_id, (err, res, body) => {
        assert.ifError(err);
        let response = JSON.parse(body);

        assert.propertyVal(response.steps.validate_bag, 'status', 'skipped');
        assert.propertyVal(response.steps.validate_compendium, 'status', 'success');
        assert.propertyVal(response.steps.image_prepare, 'status', 'success');
        assert.propertyVal(response.steps.image_build, 'status', 'skipped');
        assert.propertyVal(response.steps.image_execute, 'status', 'success');
        assert.propertyVal(response.steps.image_save, 'status', 'skipped');
        assert.propertyVal(response.steps.cleanup, 'status', 'success');
        assert.propertyVal(response.steps.check, 'status', 'success');
        done();
      });
    });

    it('should have a reference to the image file in step image_save', function (done) {
      request(global.test_host + '/api/v1/job/' + job_id + '?steps=all', (err, res, body) => {
        assert.ifError(err);
        let response = JSON.parse(body);

        assert.property(response.steps.image_save, 'file');
        assert.propertyVal(response.steps.image_save, 'file', 'image.tar');
        done();
      });
    });

    it('should mention loading the existing tarball when running the second job', function (done) {
      request(global.test_host + '/api/v1/job/' + job_id2 + '?steps=image_build', (err, res, body) => {
        assert.ifError(err);
        let response = JSON.parse(body);

        assert.property(response.steps.image_save, 'text');
        assert.include(JSON.stringify(response.steps.image_build.text), 'Image tarball found! Loading it');
        done();
      });
    });

    it('should have correct text log for image_save', function (done) {
      request(global.test_host + '/api/v1/job/' + job_id + '?steps=all', (err, res, body) => {
        assert.ifError(err);
        let response = JSON.parse(body);

        assert.property(response.steps.image_save, 'text');
        assert.include(JSON.stringify(response.steps.image_save.text), 'Image tarball file saving skipped');
        assert.notInclude(JSON.stringify(response.steps.image_save.text), 'Saved image tarball');
        assert.notInclude(JSON.stringify(response.steps.image_save.text), 'Deleting existing image tarball file');
        done();
      });
    });

    it('should list the image tarball in the compendium file listing', function (done) {
      request(global.test_host + '/api/v1/compendium/' + compendium_id, (err, res, body) => {
        assert.ifError(err);
        let response = JSON.parse(body);

        assert.include(JSON.stringify(response.files), 'image.tar');
        done();
      });
    });

    it('should not have the image tarball in the job file listing', function (done) {
      request(global.test_host + '/api/v1/job/' + job_id, (err, res, body) => {
        assert.ifError(err);
        let response = JSON.parse(body);

        assert.notInclude(JSON.stringify(response.files), 'image.tar');
        done();
      });
    });

    it('should have tagged an image for both the compendium and the job (skipped if images are not kept)', function (done) {
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

          assert.include(names, config.bagtainer.image.prefix.job + compendium_id);
          assert.include(names, config.bagtainer.image.prefix.job + job_id);
          done();
        });
      } else {
        this.skip();
      }
    }).timeout(sleepSecs * 1000);

  });

});
*/