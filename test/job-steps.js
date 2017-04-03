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

/* eslint-env mocha */
const assert = require('chai').assert;
const request = require('request');
const config = require('../config/config');
const createCompendiumPostRequest = require('./util').createCompendiumPostRequest;
const host = 'http://localhost:' + config.net.port;
const mongojs = require('mongojs');
const fs = require('fs');
const sleep = require('sleep');
const unamecall = require('node-uname');

require("./setup")
const cookie_o2r = 's:C0LIrsxGtHOGHld8Nv2jedjL4evGgEHo.GMsWD5Vveq0vBt7/4rGeoH5Xx7Dd2pgZR9DvhKCyDTY';
const cookie_plain = 's:yleQfdYnkh-sbj9Ez--_TWHVhXeXNEgq.qRmINNdkRuJ+iHGg5woRa9ydziuJ+DzFG9GnAZRvaaM';
const sleepSecs = 1;

describe('API job', () => {
  before((done) => {
    var db = mongojs('localhost/muncher', ['users', 'sessions', 'compendia', 'jobs']);
    db.compendia.drop(function (err, doc) {
      db.jobs.drop(function (err, doc) { done(); });
    });
  });

  describe('GET /api/v1/job (with no job started)', () => {
    it('should respond with HTTP 404 Not Found', (done) => {
      request(host + '/api/v1/job', (err, res) => {
        assert.ifError(err);
        assert.equal(res.statusCode, 404);
        done();
      });
    });
    it('should respond with a JSON object', (done) => {
      request(host + '/api/v1/job', (err, res, body) => {
        assert.ifError(err);
        assert.isObject(JSON.parse(body), 'returned JSON');
        done();
      });
    });
    it('should not yet contain array of job ids, but an error', (done) => {
      request(host + '/api/v1/job', (err, res, body) => {
        assert.ifError(err);
        assert.notProperty(JSON.parse(body), 'results');
        assert.propertyVal(JSON.parse(body), 'error', 'no jobs found');
        done();
      });
    });
  });

  describe('GET /api/v1/job?compendium_id for non-existing compendium', () => {
    it('should respond with HTTP 404 and an error message', (done) => {
      request(host + '/api/v1/job?compendium_id=1234', (err, res, body) => {
        assert.ifError(err);
        assert.equal(res.statusCode, 404);
        assert.notProperty(JSON.parse(body), 'results');
        assert.propertyVal(JSON.parse(body), 'error', 'no jobs found');
        done();
      });
    });
  });

  describe('EXECUTION step_zero bag is invalid', () => {
    it('should fail the upload because bag is invalid', (done) => {
      let req = createCompendiumPostRequest(host, './test/bagtainers/step_zero', cookie_o2r);

      request(req, (err, res, body) => {
        assert.ifError(err);
        assert.equal(res.statusCode, 400);
        assert.include(body, 'bag ist invalid');
        done();
      });
    }).timeout(10000);
    it('should not tell about internal server configuration in the error message', (done) => {
      let req = createCompendiumPostRequest(host, './test/bagtainers/step_zero', cookie_o2r);

      request(req, (err, res, body) => {
        assert.ifError(err);
        assert.notInclude(body, config.fs.base);
        done();
      });
    }).timeout(10000);
  });

  describe('EXECUTION step_validate_bag', () => {
    let compendium_id = '';
    let job_id = '';

    it('upload compendium should succeed and return an ID', (done) => {
      let req = createCompendiumPostRequest(host, './test/bagtainers/step_validate_bag', cookie_o2r);
      // useful command: unzip -l /tmp/tmp-5697QCBn11BrFvTl.zip 

      request(req, (err, res, body) => {
        assert.ifError(err);
        assert.equal(res.statusCode, 200);
        assert.property(JSON.parse(body), 'id');
        compendium_id = JSON.parse(body).id;
        done();
      });
    }).timeout(10000);

    it('should return job ID when starting job execution', (done) => {
      let j = request.jar();
      let ck = request.cookie('connect.sid=' + cookie_plain);
      j.setCookie(ck, host);

      request({
        uri: host + '/api/v1/job',
        method: 'POST',
        jar: j,
        formData: {
          compendium_id: compendium_id
        },
        timeout: 5000
      }, (err, res, body) => {
        assert.ifError(err);
        assert.equal(res.statusCode, 200);
        let response = JSON.parse(body);
        assert.property(response, 'job_id');
        job_id = response.job_id;
        done();
      });
    }).timeout(10000);

    it('should return document with required fields (including steps)', (done) => {
      request(host + '/api/v1/job/' + job_id, (err, res, body) => {
        assert.ifError(err);
        assert.equal(res.statusCode, 200);
        let response = JSON.parse(body);
        assert.propertyVal(response, 'id', job_id);
        assert.propertyVal(response, 'compendium_id', compendium_id);
        assert.property(response, 'steps');
        assert.property(response, 'files');
        assert.property(response.steps, 'validate_bag');
        assert.property(response.steps, 'validate_compendium');
        assert.property(response.steps, 'image_prepare');
        assert.property(response.steps, 'image_build');
        assert.property(response.steps, 'image_execute');
        assert.property(response.steps, 'cleanup');
        done();
      });
    });

    it('should have step "validate_bag" running rightaway', (done) => {
      request(host + '/api/v1/job/' + job_id, (err, res, body) => {
        assert.ifError(err);
        let response = JSON.parse(body);
        assert.propertyVal(response.steps.validate_bag, 'status', 'running');
        done();
      });
    });

    it('should have step "validate_compendium" queued', (done) => {
      request(host + '/api/v1/job/' + job_id, (err, res, body) => {
        assert.ifError(err);
        let response = JSON.parse(body);
        assert.propertyVal(response.steps.validate_compendium, 'status', 'queued');
        done();
      });
    });

    it('should complete step "validate_bag" __after some waiting__', (done) => {
      sleep.sleep(sleepSecs);

      request(host + '/api/v1/job/' + job_id, (err, res, body) => {
        assert.ifError(err);
        let response = JSON.parse(body);
        assert.propertyVal(response.steps.validate_bag, 'status', 'success');
        done();
      });
    }).timeout(sleepSecs * 1000 * 3);

    it('should fail step "validate_compendium"', (done) => {
      request(host + '/api/v1/job/' + job_id, (err, res, body) => {
        assert.ifError(err);
        let response = JSON.parse(body);
        assert.propertyVal(response.steps.validate_compendium, 'status', 'failure');
        done();
      });
    });

    it('should list image steps as queued', (done) => {
      request(host + '/api/v1/job/' + job_id, (err, res, body) => {
        assert.ifError(err);
        let response = JSON.parse(body);
        assert.propertyVal(response.steps.image_prepare, 'status', 'queued');
        assert.propertyVal(response.steps.image_build, 'status', 'queued');
        assert.propertyVal(response.steps.image_execute, 'status', 'queued');
        done();
      });
    });

    it('should complete step "cleanup"', (done) => {
      request(host + '/api/v1/job/' + job_id, (err, res, body) => {
        assert.ifError(err);
        let response = JSON.parse(body);
        assert.propertyVal(response.steps.cleanup, 'status', 'success');
        done();
      });
    });
  });

  describe('EXECUTION step_validate_compendium', () => {
    let compendium_id = '';
    let job_id = '';

    it('upload compendium should succeed and return an ID', (done) => {
      let req = createCompendiumPostRequest(host, './test/bagtainers/step_validate_compendium', cookie_o2r);
      // useful command: unzip -l /tmp/tmp-5697QCBn11BrFvTl.zip 

      request(req, (err, res, body) => {
        assert.ifError(err);
        assert.equal(res.statusCode, 200);
        assert.property(JSON.parse(body), 'id');
        compendium_id = JSON.parse(body).id;
        done();
      });
    });

    it('should return job ID when starting job execution', (done) => {
      let j = request.jar();
      let ck = request.cookie('connect.sid=' + cookie_plain);
      j.setCookie(ck, host);

      request({
        uri: host + '/api/v1/job',
        method: 'POST',
        jar: j,
        formData: {
          compendium_id: compendium_id
        },
        timeout: 1000
      }, (err, res, body) => {
        assert.ifError(err);
        assert.equal(res.statusCode, 200);
        let response = JSON.parse(body);
        assert.property(response, 'job_id');
        job_id = response.job_id;
        done();
      });
    });

    it('should return job ID when starting _another_ job execution (different from the previous id)', (done) => {
      let j = request.jar();
      let ck = request.cookie('connect.sid=' + cookie_plain);
      j.setCookie(ck, host);

      request({
        uri: host + '/api/v1/job',
        method: 'POST',
        jar: j,
        formData: {
          compendium_id: compendium_id
        },
        timeout: 1000
      }, (err, res, body) => {
        assert.ifError(err);
        assert.equal(res.statusCode, 200);
        let response = JSON.parse(body);
        assert.property(response, 'job_id');
        assert.notEqual(response.job_id, job_id);
        job_id = response.job_id;
        done();
      });
    });

    it('should return job ID when starting _yet another_ job execution (different from the previous id)', (done) => {
      let j = request.jar();
      let ck = request.cookie('connect.sid=' + cookie_plain);
      j.setCookie(ck, host);

      request({
        uri: host + '/api/v1/job',
        method: 'POST',
        jar: j,
        formData: {
          compendium_id: compendium_id
        },
        timeout: 1000
      }, (err, res, body) => {
        assert.ifError(err);
        assert.equal(res.statusCode, 200);
        let response = JSON.parse(body);
        assert.property(response, 'job_id');
        assert.notEqual(response.job_id, job_id);
        job_id = response.job_id;
        done();
      });
    });

    it('should complete step "validate_compendium" __after some waiting__', (done) => {
      sleep.sleep(sleepSecs);

      request(host + '/api/v1/job/' + job_id, (err, res, body) => {
        assert.ifError(err);
        let response = JSON.parse(body);
        assert.propertyVal(response.steps.validate_compendium, 'status', 'success');
        done();
      });
    }).timeout(sleepSecs * 1000 * 2);

    it('should fail step "image_prepare"', (done) => {
      request(host + '/api/v1/job/' + job_id, (err, res, body) => {
        assert.ifError(err);
        let response = JSON.parse(body);
        assert.propertyVal(response.steps.image_prepare, 'status', 'failure');
        done();
      });
    });

    it('should list other image steps as queued', (done) => {
      request(host + '/api/v1/job/' + job_id, (err, res, body) => {
        assert.ifError(err);
        let response = JSON.parse(body);
        assert.propertyVal(response.steps.image_build, 'status', 'queued');
        assert.propertyVal(response.steps.image_execute, 'status', 'queued');
        done();
      });
    });

    it('should complete step "cleanup"', (done) => {
      request(host + '/api/v1/job/' + job_id, (err, res, body) => {
        assert.ifError(err);
        let response = JSON.parse(body);
        assert.propertyVal(response.steps.cleanup, 'status', 'success');
        done();
      });
    });
  });

  describe('GET /api/v1/job with multiple jobs overall', () => {
    it('should contain fewer results if start is provided', (done) => {
      request(host + '/api/v1/job?start=3', (err, res, body) => {
        assert.ifError(err);
        let response = JSON.parse(body);
        assert.equal(response.results.length, 2); // there are 4, starting with no. 3 leaves 2
        done();
      });
    });
    it('should contain no results but an error if too large start parameter is provided', (done) => {
      request(host + '/api/v1/job?start=999', (err, res, body) => {
        assert.ifError(err);
        let response = JSON.parse(body);
        assert.propertyVal(response, 'error', 'no jobs found');
        done();
      });
    });

    it('should just list the number of jobs requested', (done) => {
      request(host + '/api/v1/job?limit=2', (err, res, body) => {
        assert.ifError(err);
        let response = JSON.parse(body);
        assert.isArray(response.results);
        assert.equal(response.results.length, 2);
        done();
      });
    });
  });

  describe('EXECUTION step_image_prepare', () => {
    let compendium_id = '';
    let job_id = '';

    it('upload compendium should succeed and return an ID', (done) => {
      let req = createCompendiumPostRequest(host, './test/bagtainers/step_image_prepare', cookie_o2r);
      // useful command: unzip -l /tmp/tmp-5697QCBn11BrFvTl.zip 

      request(req, (err, res, body) => {
        assert.ifError(err);
        assert.equal(res.statusCode, 200);
        assert.property(JSON.parse(body), 'id');
        compendium_id = JSON.parse(body).id;
        done();
      });
    });

    it('should return job ID when starting job execution', (done) => {
      let j = request.jar();
      let ck = request.cookie('connect.sid=' + cookie_plain);
      j.setCookie(ck, host);

      request({
        uri: host + '/api/v1/job',
        method: 'POST',
        jar: j,
        formData: {
          compendium_id: compendium_id
        },
        timeout: 1000
      }, (err, res, body) => {
        assert.ifError(err);
        assert.equal(res.statusCode, 200);
        let response = JSON.parse(body);
        assert.property(response, 'job_id');
        job_id = response.job_id;
        done();
      });
    });

    it('should complete step "image_prepare" __after some waiting__', (done) => {
      sleep.sleep(sleepSecs);

      request(host + '/api/v1/job/' + job_id, (err, res, body) => {
        assert.ifError(err);
        let response = JSON.parse(body);
        assert.propertyVal(response.steps.image_prepare, 'status', 'success');
        done();
      });
    }).timeout(sleepSecs * 1000 * 2);

    it('should fail step "image_build"', (done) => {
      request(host + '/api/v1/job/' + job_id, (err, res, body) => {
        assert.ifError(err);
        let response = JSON.parse(body);
        assert.propertyVal(response.steps.image_build, 'status', 'failure');
        done();
      });
    });

    it('should list other image_execute as queued', (done) => {
      request(host + '/api/v1/job/' + job_id, (err, res, body) => {
        assert.ifError(err);
        let response = JSON.parse(body);
        assert.propertyVal(response.steps.image_execute, 'status', 'queued');
        done();
      });
    });

    it('should complete step "cleanup"', (done) => {
      request(host + '/api/v1/job/' + job_id, (err, res, body) => {
        assert.ifError(err);
        let response = JSON.parse(body);
        assert.propertyVal(response.steps.cleanup, 'status', 'success');
        done();
      });
    });

    it('should have deleted payload file during cleanup', (done) => {
      let tarballFileName = config.payload.tarball.tmpdir + job_id + '.tar';
      try {
        fs.lstatSync(tarballFileName);
        assert.fail();
      } catch (error) {
        assert.include(error.message, 'no such file or directory');
        done();
      }
    });
  });

  describe('EXECUTION step_image_build', () => {
    var compendium_id = '';
    var job_id = '';

    it('upload compendium should succeed and return an ID', (done) => {
      let req = createCompendiumPostRequest(host, './test/bagtainers/step_image_build', cookie_o2r);
      // useful command: unzip -l /tmp/tmp-5697QCBn11BrFvTl.zip 

      request(req, (err, res, body) => {
        assert.ifError(err);
        assert.equal(res.statusCode, 200);
        assert.property(JSON.parse(body), 'id');
        compendium_id = JSON.parse(body).id;
        done();
      });
    });

    it('should return job ID when starting job execution', (done) => {
      let j = request.jar();
      let ck = request.cookie('connect.sid=' + cookie_plain);
      j.setCookie(ck, host);

      request({
        uri: host + '/api/v1/job',
        method: 'POST',
        jar: j,
        formData: {
          compendium_id: compendium_id
        },
        timeout: 1000
      }, (err, res, body) => {
        assert.ifError(err);
        assert.equal(res.statusCode, 200);
        let response = JSON.parse(body);
        assert.property(response, 'job_id');
        job_id = response.job_id;
        done();
      });
    });

    it('should complete step all previous steps __after some waiting__', (done) => {
      sleep.sleep(sleepSecs);

      request(host + '/api/v1/job/' + job_id, (err, res, body) => {
        assert.ifError(err);
        let response = JSON.parse(body);
        assert.propertyVal(response.steps.validate_bag, 'status', 'success');
        assert.propertyVal(response.steps.validate_compendium, 'status', 'success');
        assert.propertyVal(response.steps.image_prepare, 'status', 'success');
        done();
      });
    }).timeout(sleepSecs * 1000 * 2);

    it('should complete step "image_build" __after some more waiting__', (done) => {
      sleep.sleep(sleepSecs);

      request(host + '/api/v1/job/' + job_id, (err, res, body) => {
        assert.ifError(err);
        let response = JSON.parse(body);
        assert.propertyVal(response.steps.image_build, 'status', 'success');
        done();
      });
    }).timeout(sleepSecs * 1000 * 2);

    it('should fail step "image_execute" with a statuscode "1"', (done) => {
      request(host + '/api/v1/job/' + job_id, (err, res, body) => {
        assert.ifError(err);
        let response = JSON.parse(body);
        assert.propertyVal(response.steps.image_execute, 'status', 'failure');
        assert.propertyVal(response.steps.image_execute, 'statuscode', 1);
        done();
      });
    });

    it('should complete step "cleanup"', (done) => {
      request(host + '/api/v1/job/' + job_id, (err, res, body) => {
        assert.ifError(err);
        let response = JSON.parse(body);
        assert.propertyVal(response.steps.cleanup, 'status', 'success');
        done();
      });
    });
  });

  describe('EXECUTION step_image_execute', () => {
    var compendium_id = '';
    var job_id = '';

    var Docker = require('dockerode');
    var docker = new Docker();

    it('upload compendium should succeed and return an ID', (done) => {
      let req = createCompendiumPostRequest(host, './test/bagtainers/step_image_execute', cookie_o2r);

      request(req, (err, res, body) => {
        assert.ifError(err);
        assert.equal(res.statusCode, 200);
        assert.property(JSON.parse(body), 'id');
        compendium_id = JSON.parse(body).id;
        done();
      });
    });

    it('should return job ID when starting job execution', (done) => {
      let j = request.jar();
      let ck = request.cookie('connect.sid=' + cookie_plain);
      j.setCookie(ck, host);

      request({
        uri: host + '/api/v1/job',
        method: 'POST',
        jar: j,
        formData: {
          compendium_id: compendium_id
        },
        timeout: 1000
      }, (err, res, body) => {
        assert.ifError(err);
        assert.equal(res.statusCode, 200);
        let response = JSON.parse(body);
        assert.property(response, 'job_id');
        job_id = response.job_id;
        done();
      });
    });

    it('should complete step all previous steps __after some waiting__', (done) => {
      sleep.sleep(sleepSecs);

      request(host + '/api/v1/job/' + job_id, (err, res, body) => {
        assert.ifError(err);
        let response = JSON.parse(body);
        assert.propertyVal(response.steps.validate_bag, 'status', 'success');
        assert.propertyVal(response.steps.validate_compendium, 'status', 'success');
        assert.propertyVal(response.steps.image_prepare, 'status', 'success');
        assert.propertyVal(response.steps.image_build, 'status', 'success');
        done();
      });
    }).timeout(sleepSecs * 1000 * 2);

    it('should complete step "image_execute"', (done) => {
      sleep.sleep(sleepSecs);

      request(host + '/api/v1/job/' + job_id, (err, res, body) => {
        assert.ifError(err);
        let response = JSON.parse(body);
        assert.propertyVal(response.steps.image_execute, 'status', 'success');
        done();
      });
    }).timeout(sleepSecs * 1000 * 2);

    it('should complete step "cleanup"', (done) => {
      request(host + '/api/v1/job/' + job_id, (err, res, body) => {
        assert.ifError(err);
        let response = JSON.parse(body);
        assert.propertyVal(response.steps.cleanup, 'status', 'success');
        done();
      });
    });

    it('execution log should include uname output', (done) => {
      request(host + '/api/v1/job/' + job_id, (err, res, body) => {
        assert.ifError(err);
        let response = JSON.parse(body);

        let uname = unamecall();
        assert.include(response.steps.image_execute.text, uname.machine);
        assert.include(response.steps.image_execute.text, uname.release);
        assert.include(response.steps.image_execute.text, uname.sysname);
        assert.include(response.steps.image_execute.text, uname.version);
        done();
      });
    });

    if (!config.bagtainer.keepContainers) {
      it('should have deleted container during cleanup', (done) => {
        docker.listContainers({ all: true }, function (err, containers) {
          containers.forEach(function (containerInfo) {
            assert.notEqual(containerInfo.Image, config.bagtainer.imageNamePrefix + job_id);
          });

          done();
        });
      });
    }

    if (!config.bagtainer.keepImages) {
      it('should have deleted image during cleanup after some time', (done) => {
        docker.listImages(function (err, images) {
          assert.ifError(err);

          images.forEach(function (image) {
            let tags = image.RepoTags;
            tags.forEach(function (tag) {
              assert.notEqual(tag, config.bagtainer.imageNamePrefix + job_id);
            });
          });

          done();
        });
      });
    }

    it('should have deleted payload file during cleanup', (done) => {
      let tarballFileName = config.payload.tarball.tmpdir + job_id + '.tar';
      try {
        fs.lstatSync(tarballFileName);
        assert.fail();
      } catch (error) {
        assert.include(error.message, 'no such file or directory');
        done();
      }
    });
  });

});
