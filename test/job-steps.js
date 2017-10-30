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
const unamecall = require('node-uname');

require("./setup");
const cookie_o2r = 's:C0LIrsxGtHOGHld8Nv2jedjL4evGgEHo.GMsWD5Vveq0vBt7/4rGeoH5Xx7Dd2pgZR9DvhKCyDTY';
const cookie_plain = 's:yleQfdYnkh-sbj9Ez--_TWHVhXeXNEgq.qRmINNdkRuJ+iHGg5woRa9ydziuJ+DzFG9GnAZRvaaM';
const sleepSecs = 10;

let Docker = require('dockerode');
let docker = new Docker();

describe('API job steps', () => {
  before((done) => {
    var db = mongojs('localhost/muncher', ['users', 'sessions', 'compendia', 'jobs']);
    db.compendia.drop(function (err, doc) {
      db.jobs.drop(function (err, doc) {
        db.close;
        done();
      });
    });
  });

  describe('GET /api/v1/job (with no job started)', () => {
    it('should not yet contain array of job ids, but an empty list as valid JSON and HTTP 200', (done) => {
      request(global.test_host + '/api/v1/job', (err, res, body) => {
        assert.ifError(err);
        assert.equal(res.statusCode, 200);
        assert.isObject(JSON.parse(body), 'returned JSON');
        let response = JSON.parse(body);
        assert.property(response, 'results');
        assert.notProperty(response, 'error');
        assert.isArray(response.results);
        assert.isEmpty(response.results);
        done();
      });
    });
  });

  describe('GET /api/v1/job?compendium_id for non-existing compendium', () => {
    it('should respond with HTTP 200 and and an empty list in JSON', (done) => {
      request(global.test_host + '/api/v1/job?compendium_id=1234', (err, res, body) => {
        assert.ifError(err);
        assert.equal(res.statusCode, 200);
        assert.isObject(JSON.parse(body), 'returned JSON');
        let response = JSON.parse(body);
        assert.property(response, 'results');
        assert.notProperty(response, 'error');
        assert.isArray(response.results);
        assert.isEmpty(response.results);
        done();
      });
    });
  });

  describe('EXECUTION of unknown compendium', () => {
    it('should return HTTP error and valid JSON with error message', (done) => {
      let j = request.jar();
      let ck = request.cookie('connect.sid=' + cookie_plain);
      j.setCookie(ck, global.test_host);

      request({
        uri: global.test_host + '/api/v1/job',
        method: 'POST',
        jar: j,
        formData: {
          compendium_id: '54321'
        },
        timeout: 1000
      }, (err, res, body) => {
        assert.ifError(err);
        assert.equal(res.statusCode, 400);
        let response = JSON.parse(body);
        assert.notProperty(response, 'job_id');
        assert.property(response, 'error');
        done();
      });
    });
  });

  describe('EXECUTION of multiple jobs', () => {
    let job_id0, job_id1, job_id2 = '';

    before(function (done) {
      let req = createCompendiumPostRequest('./test/erc/step_validate_compendium', cookie_o2r);
      this.timeout(10000);

      request(req, (err, res, body) => {
        compendium_id = JSON.parse(body).id;
        publishCandidate(compendium_id, cookie_o2r, () => {
          startJob(compendium_id, id => {
            job_id0 = id;
            done();
          });
        });
      });
    });

    it('should return job ID when starting _another_ job execution (different from the previous id)', (done) => {
      let j = request.jar();
      let ck = request.cookie('connect.sid=' + cookie_plain);
      j.setCookie(ck, global.test_host);

      request({
        uri: global.test_host + '/api/v1/job',
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
        assert.notEqual(response.job_id, job_id0);
        job_id1 = response.job_id;
        done();
      });
    });

    it('should return job ID when starting _yet another_ job execution (different from the previous ids)', (done) => {
      let j = request.jar();
      let ck = request.cookie('connect.sid=' + cookie_plain);
      j.setCookie(ck, global.test_host);

      request({
        uri: global.test_host + '/api/v1/job',
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
        assert.notEqual(response.job_id, job_id0);
        assert.notEqual(response.job_id, job_id1);
        job_id2 = response.job_id;
        done();
      });
    });
  });

  describe('EXECUTION of candidate compendium', () => {
    let compendium_id = '';

    before(function (done) {
      let req = createCompendiumPostRequest('./test/erc/step_validate_compendium', cookie_o2r);
      this.timeout(sleepSecs * 1000 * 2);

      request(req, (err, res, body) => {
        compendium_id = JSON.parse(body).id;
        sleep.sleep(sleepSecs);
        done();
      });
    });

    it('should return HTTP error code and error message as valid JSON when starting job as logged-in user', (done) => {
      let j = request.jar();
      let ck = request.cookie('connect.sid=' + cookie_plain);
      j.setCookie(ck, global.test_host);

      request({
        uri: global.test_host + '/api/v1/job',
        method: 'POST',
        jar: j,
        formData: {
          compendium_id: compendium_id
        },
        timeout: 1000
      }, (err, res, body) => {
        assert.ifError(err);
        let response = JSON.parse(body);
        assert.equal(res.statusCode, 400);
        assert.isObject(JSON.parse(body));
        assert.notProperty(response, 'job_id');
        assert.property(response, 'error');
        done();
      });
    });

    it('should return HTTP error code and error message as valid JSON even when starting as author', (done) => {
      let j = request.jar();
      let ck = request.cookie('connect.sid=' + cookie_o2r);
      j.setCookie(ck, global.test_host);

      request({
        uri: global.test_host + '/api/v1/job',
        method: 'POST',
        jar: j,
        formData: {
          compendium_id: compendium_id
        },
        timeout: 1000
      }, (err, res, body) => {
        assert.ifError(err);
        assert.equal(res.statusCode, 400);
        assert.isObject(JSON.parse(body));
        let response = JSON.parse(body);
        assert.notProperty(response, 'job_id');
        assert.property(response, 'error');
        done();
      });
    });

    it('should return job ID after publishing compendium', (done) => {
      publishCandidate(compendium_id, cookie_o2r, () => {
        let j = request.jar();
        let ck = request.cookie('connect.sid=' + cookie_plain);
        j.setCookie(ck, global.test_host);

        request({
          uri: global.test_host + '/api/v1/job',
          method: 'POST',
          jar: j,
          formData: {
            compendium_id: compendium_id
          },
          timeout: 1000
        }, (err, res, body) => {
          assert.ifError(err);
          let response = JSON.parse(body);
          assert.property(response, 'job_id');
          done();
        });
      });
    });
  });

  describe('EXECUTION step_validate_compendium', () => {
    let job_id = '';

    before(function (done) {
      this.timeout(20000);
      let req = createCompendiumPostRequest('./test/erc/step_validate_compendium', cookie_o2r);

      request(req, (err, res, body) => {
        compendium_id = JSON.parse(body).id;
        publishCandidate(compendium_id, cookie_o2r, () => {
          startJob(compendium_id, id => {
            job_id = id;
            done();
          });
        });
      });
    });

    it('should complete step "validate_compendium" __after some waiting__', (done) => {
      sleep.sleep(sleepSecs);

      request(global.test_host + '/api/v1/job/' + job_id, (err, res, body) => {
        assert.ifError(err);
        let response = JSON.parse(body);
        assert.propertyVal(response.steps.validate_compendium, 'status', 'success');
        done();
      });
    }).timeout(sleepSecs * 1000 * 2);

    it('should fail step "image_prepare"', (done) => {
      request(global.test_host + '/api/v1/job/' + job_id, (err, res, body) => {
        assert.ifError(err);
        let response = JSON.parse(body);
        assert.propertyVal(response.steps.image_prepare, 'status', 'failure');
        done();
      });
    });

    it('should list other image steps as queued', (done) => {
      request(global.test_host + '/api/v1/job/' + job_id, (err, res, body) => {
        assert.ifError(err);
        let response = JSON.parse(body);
        assert.propertyVal(response.steps.image_build, 'status', 'queued');
        assert.propertyVal(response.steps.image_execute, 'status', 'queued');
        done();
      });
    });

    it('should complete step "cleanup"', (done) => {
      request(global.test_host + '/api/v1/job/' + job_id, (err, res, body) => {
        assert.ifError(err);
        let response = JSON.parse(body);
        assert.propertyVal(response.steps.cleanup, 'status', 'success');
        done();
      });
    });
  });

  describe('GET /api/v1/job with multiple jobs overall', () => {

    it('should contain fewer results if start is provided', (done) => {
      request(global.test_host + '/api/v1/job', (err, res, body) => {
        assert.ifError(err);
        let response = JSON.parse(body);
        let all_count = response.results.length;
        let start = 3;

        request(global.test_host + '/api/v1/job?start=' + start, (err2, res2, body2) => {
          assert.ifError(err2);
          let response2 = JSON.parse(body2);
          assert.equal(response2.results.length, all_count - start + 1);
          done();
        });
      });
    });

    it('should contain no results but an empty list (valid JSON, HTTP 200) if too large start parameter is provided', (done) => {
      request(global.test_host + '/api/v1/job?start=999', (err, res, body) => {
        assert.ifError(err);
        assert.equal(res.statusCode, 200);
        assert.isObject(JSON.parse(body), 'returned JSON');
        let response = JSON.parse(body);
        assert.property(response, 'results');
        assert.notProperty(response, 'error');
        assert.isArray(response.results);
        assert.isEmpty(response.results);
        done();
      });
    });

    it('should just list the number of jobs requested', (done) => {
      request(global.test_host + '/api/v1/job?limit=2', (err, res, body) => {
        assert.ifError(err);
        let response = JSON.parse(body);
        assert.isArray(response.results);
        assert.equal(response.results.length, 2);
        done();
      });
    });
  });

  describe('EXECUTION step_image_prepare', () => {
    let job_id = '';

    before(function (done) {
      let req = createCompendiumPostRequest('./test/erc/step_image_prepare', cookie_o2r);
      this.timeout(10000);

      request(req, (err, res, body) => {
        let compendium_id = JSON.parse(body).id;
        publishCandidate(compendium_id, cookie_o2r, () => {
          startJob(compendium_id, id => {
            job_id = id;
            done();
          });
        });
      });
    });

    it('should complete step "image_prepare" __after some waiting__', (done) => {
      sleep.sleep(sleepSecs);

      request(global.test_host + '/api/v1/job/' + job_id, (err, res, body) => {
        assert.ifError(err);
        let response = JSON.parse(body);
        assert.propertyVal(response.steps.image_prepare, 'status', 'success');
        done();
      });
    }).timeout(sleepSecs * 1000 * 2);

    it('should fail step "image_build"', (done) => {
      request(global.test_host + '/api/v1/job/' + job_id, (err, res, body) => {
        assert.ifError(err);
        let response = JSON.parse(body);
        assert.propertyVal(response.steps.image_build, 'status', 'failure');
        done();
      });
    });

    it('should list other image_execute as queued', (done) => {
      request(global.test_host + '/api/v1/job/' + job_id, (err, res, body) => {
        assert.ifError(err);
        let response = JSON.parse(body);
        assert.propertyVal(response.steps.image_execute, 'status', 'queued');
        done();
      });
    });

    it('should complete step "cleanup"', (done) => {
      request(global.test_host + '/api/v1/job/' + job_id, (err, res, body) => {
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
    let job_id = '';

    before(function (done) {
      let req = createCompendiumPostRequest('./test/erc/step_image_build', cookie_o2r);
      this.timeout(10000);

      request(req, (err, res, body) => {
        let compendium_id = JSON.parse(body).id;
        publishCandidate(compendium_id, cookie_o2r, () => {
          startJob(compendium_id, id => {
            job_id = id;
            done();
          });
        });
      });
    });

    it('should complete step all previous steps __after some waiting__', (done) => {
      sleep.sleep(sleepSecs * 2);

      request(global.test_host + '/api/v1/job/' + job_id, (err, res, body) => {
        assert.ifError(err);
        let response = JSON.parse(body);

        if (config.bagtainer.validateBagBeforeExecute)
          assert.propertyVal(response.steps.validate_bag, 'status', 'success');
        else
          assert.propertyVal(response.steps.validate_bag, 'status', 'skipped');

        assert.propertyVal(response.steps.validate_compendium, 'status', 'success');
        assert.propertyVal(response.steps.image_prepare, 'status', 'success');
        done();
      });
    }).timeout(sleepSecs * 1000 * 3);

    it('should complete step "image_build" __after some more waiting__', (done) => {
      sleep.sleep(sleepSecs);

      request(global.test_host + '/api/v1/job/' + job_id, (err, res, body) => {
        assert.ifError(err);
        let response = JSON.parse(body);
        assert.propertyVal(response.steps.image_build, 'status', 'success');
        done();
      });
    }).timeout(sleepSecs * 1000 * 2);

    it('should fail step "image_execute" with a status code "1" __after some more waiting__', (done) => {
      sleep.sleep(sleepSecs);

      request(global.test_host + '/api/v1/job/' + job_id, (err, res, body) => {
        assert.ifError(err);
        let response = JSON.parse(body);
        assert.propertyVal(response.steps.image_execute, 'status', 'failure');
        assert.propertyVal(response.steps.image_execute, 'statuscode', 1);
        done();
      });
    }).timeout(sleepSecs * 1000 * 2);

    it('should complete step "cleanup"', (done) => {
      request(global.test_host + '/api/v1/job/' + job_id, (err, res, body) => {
        assert.ifError(err);
        let response = JSON.parse(body);
        assert.propertyVal(response.steps.cleanup, 'status', 'success');
        done();
      });
    });


    it('should have created an image (skipped if images are not kept)', function (done) {
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

          assert.include(names, config.bagtainer.imageNamePrefix + job_id);
          done();
        });
      } else {
        this.skip();
      }
    }).timeout(sleepSecs * 1000);
  });

  describe('EXECUTION step_image_execute', () => {
    let job_id = '';

    before(function (done) {
      let req = createCompendiumPostRequest('./test/erc/step_image_execute', cookie_o2r);
      this.timeout(10000);

      request(req, (err, res, body) => {
        let compendium_id = JSON.parse(body).id;
        publishCandidate(compendium_id, cookie_o2r, () => {
          startJob(compendium_id, id => {
            job_id = id;
            done();
          });
        });
      });
    });

    it('should complete step all previous steps __after some waiting__', (done) => {
      sleep.sleep(sleepSecs);

      request(global.test_host + '/api/v1/job/' + job_id, (err, res, body) => {
        assert.ifError(err);
        let response = JSON.parse(body);

        if (config.bagtainer.validateBagBeforeExecute)
          assert.propertyVal(response.steps.validate_bag, 'status', 'success');
        else
          assert.propertyVal(response.steps.validate_bag, 'status', 'skipped');

        assert.propertyVal(response.steps.validate_compendium, 'status', 'success');
        assert.propertyVal(response.steps.image_prepare, 'status', 'success');
        assert.propertyVal(response.steps.image_build, 'status', 'success');
        done();
      });
    }).timeout(sleepSecs * 1000 * 2);

    it('should complete step "image_execute"', (done) => {
      sleep.sleep(sleepSecs);

      request(global.test_host + '/api/v1/job/' + job_id, (err, res, body) => {
        assert.ifError(err);
        let response = JSON.parse(body);
        assert.propertyVal(response.steps.image_execute, 'status', 'success');
        done();
      });
    }).timeout(sleepSecs * 1000 * 2);

    it('should complete step "cleanup"', (done) => {
      request(global.test_host + '/api/v1/job/' + job_id, (err, res, body) => {
        assert.ifError(err);
        let response = JSON.parse(body);
        assert.propertyVal(response.steps.cleanup, 'status', 'success');
        done();
      });
    });

    it('execution log should include uname output', (done) => {
      request(global.test_host + '/api/v1/job/' + job_id, (err, res, body) => {
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

    it('should have deleted container during cleanup (skipped if containers are kept)', function (done) {
      if (!config.bagtainer.keepContainers) {
        docker.listContainers({ all: true }, function (err, containers) {
          containers.forEach(function (containerInfo) {
            assert.notEqual(containerInfo.Image, config.bagtainer.imageNamePrefix + job_id);
          });

          done();
        });
      } else {
        this.skip();
      }
    });

    it('should have deleted image during cleanup after some time (skipped if images are kept)', function (done) {
      if (!config.bagtainer.keepImages) {
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
      } else {
        this.skip();
      }
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

});
