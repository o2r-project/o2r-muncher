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
const mongojs = require('mongojs');
const sleep = require('sleep');

require("./setup");
const cookie_o2r = 's:C0LIrsxGtHOGHld8Nv2jedjL4evGgEHo.GMsWD5Vveq0vBt7/4rGeoH5Xx7Dd2pgZR9DvhKCyDTY';
const cookie_plain = 's:yleQfdYnkh-sbj9Ez--_TWHVhXeXNEgq.qRmINNdkRuJ+iHGg5woRa9ydziuJ+DzFG9GnAZRvaaM';
const cookie_uploader = 's:lTKjca4OEmnahaQIuIdV6tfHq4mVf7mO.0iapdV1c85wc5NO3d3h+svorp3Tm56cfqRhhpFJZBnk';
const waitSecs = 20;

describe('API job filtering', () => {
  before((done) => {
    var db = mongojs('localhost/muncher', ['users', 'sessions', 'compendia', 'jobs']);
    db.compendia.drop(function (err, doc) {
      db.jobs.drop(function (err, doc) { done(); });
    });
  });

  describe('job filtering with compendium_id, status and user', () => {
    let job_id = '';
    let compendium_id_success = '';
    let compendium_id_failure = '';
    let job_count_success = 0;
    let job_count_failure = 0;
    let job_count_user_o2r = 0;
    let job_count_user_uploader = 0;

    // upload 1st compendium with final job status "success"
    before(function (done) {
      let req = createCompendiumPostRequest('./test/erc/step_image_execute', cookie_o2r);
      this.timeout(20000);

      request(req, (err, res, body) => {
        compendium_id_success = JSON.parse(body).id;
        publishCandidate(compendium_id_success, cookie_o2r, () => {
          let req_f = createCompendiumPostRequest('./test/erc/step_image_build', cookie_o2r);

          request(req_f, (err, res, body) => {
            compendium_id_failure = JSON.parse(body).id;
            publishCandidate(compendium_id_failure, cookie_o2r, () => {
              done();
            });
          });
        });
      });
    });

    it('1st job (success, orcid_o2r user): should return job ID when starting job execution', (done) => {
      let j = request.jar();
      let ck = request.cookie('connect.sid=' + cookie_o2r);
      j.setCookie(ck, global.test_host);

      request({
        uri: global.test_host + '/api/v1/job',
        method: 'POST',
        jar: j,
        formData: {
          compendium_id: compendium_id_success
        },
        timeout: 5000
      }, (err, res, body) => {
        assert.ifError(err);
        assert.equal(res.statusCode, 200);
        let response = JSON.parse(body);
        assert.property(response, 'job_id');
        job_id = response.job_id;
        job_count_success++;
        job_count_user_o2r++;
        done();
      });
    }).timeout(10000);

    it('2nd job (success, orcid_o2r user): should return job ID when starting job execution', (done) => {
      let j = request.jar();
      let ck = request.cookie('connect.sid=' + cookie_o2r);
      j.setCookie(ck, global.test_host);

      request({
        uri: global.test_host + '/api/v1/job',
        method: 'POST',
        jar: j,
        formData: {
          compendium_id: compendium_id_success
        },
        timeout: 5000
      }, (err, res, body) => {
        assert.ifError(err);
        assert.equal(res.statusCode, 200);
        let response = JSON.parse(body);
        assert.property(response, 'job_id');
        job_id = response.job_id;
        job_count_success++;
        job_count_user_o2r++;
        done();
      });
    }).timeout(10000);

    it('3rd job (failure compendium, orcid_o2r user): should return job ID when starting job execution', (done) => {
      let j = request.jar();
      let ck = request.cookie('connect.sid=' + cookie_o2r);
      j.setCookie(ck, global.test_host);

      request({
        uri: global.test_host + '/api/v1/job',
        method: 'POST',
        jar: j,
        formData: {
          compendium_id: compendium_id_failure
        },
        timeout: 5000
      }, (err, res, body) => {
        assert.ifError(err);
        assert.equal(res.statusCode, 200);
        let response = JSON.parse(body);
        assert.property(response, 'job_id');
        job_id = response.job_id;
        job_count_failure++;
        job_count_user_o2r++;
        done();
      });
    }).timeout(10000);

    it('4th job (failing compendium, orcid_uploader user): should return job ID when starting job execution', (done) => {
      let j = request.jar();
      let ck = request.cookie('connect.sid=' + cookie_uploader);
      j.setCookie(ck, global.test_host);

      request({
        uri: global.test_host + '/api/v1/job',
        method: 'POST',
        jar: j,
        formData: {
          compendium_id: compendium_id_failure
        },
        timeout: 5000
      }, (err, res, body) => {
        assert.ifError(err);
        assert.equal(res.statusCode, 200);
        let response = JSON.parse(body);
        assert.property(response, 'job_id');
        job_id = response.job_id;
        job_count_failure++;
        job_count_user_uploader++;
        done();
      });
    }).timeout(10000);

    it('5th job (failing compendium, orcid_uploader user): should return job ID when starting job execution', (done) => {
      let j = request.jar();
      let ck = request.cookie('connect.sid=' + cookie_uploader);
      j.setCookie(ck, global.test_host);

      request({
        uri: global.test_host + '/api/v1/job',
        method: 'POST',
        jar: j,
        formData: {
          compendium_id: compendium_id_failure
        },
        timeout: 5000
      }, (err, res, body) => {
        assert.ifError(err);
        assert.equal(res.statusCode, 200);
        let response = JSON.parse(body);
        assert.property(response, 'job_id');
        job_id = response.job_id;
        job_count_failure++;
        job_count_user_uploader++;
        done();
      });
    }).timeout(10000);

    it('should list 2 jobs for successful compendium _after some waiting_', (done) => {
      sleep.sleep(waitSecs);

      request(global.test_host + '/api/v1/job/?compendium_id=' + compendium_id_success, (err, res, body) => {
        assert.ifError(err);
        assert.equal(res.statusCode, 200);
        let response = JSON.parse(body);
        assert.isArray(response.results);
        assert.equal(response.results.length, 2);
        done();
      });
    }).timeout(waitSecs * 1000 * 2);

    it('should list 3 jobs for failing compendium', (done) => {
      request(global.test_host + '/api/v1/job/?compendium_id=' + compendium_id_failure, (err, res, body) => {
        assert.ifError(err);
        assert.equal(res.statusCode, 200);
        let response = JSON.parse(body);
        assert.isArray(response.results);
        assert.equal(response.results.length, 3);
        done();
      });
    }).timeout(waitSecs * 1000 * 2);

    it('should list 3 jobs of the test user "orcid_o2r"', (done) => {
      request(global.test_host + '/api/v1/job/?user=0000-0001-6021-1617', (err, res, body) => {
        assert.ifError(err);
        assert.equal(res.statusCode, 200);
        let response = JSON.parse(body);
        assert.isArray(response.results);
        assert.equal(response.results.length, job_count_user_o2r);
        done();
      });
    });

    it('should list 2 jobs of the user "orcid_uploader"', (done) => {
      request(global.test_host + '/api/v1/job/?user=2000-0000-0000-0002', (err, res, body) => {
        assert.ifError(err);
        assert.equal(res.statusCode, 200);
        let response = JSON.parse(body);
        assert.isArray(response.results);
        assert.equal(response.results.length, job_count_user_uploader);
        done();
      });
    });

    it('should list 2 jobs with the status "success"', (done) => {
      request(global.test_host + '/api/v1/job?status=success', (err, res, body) => {
        assert.ifError(err);
        assert.equal(res.statusCode, 200);
        let response = JSON.parse(body);
        assert.isArray(response.results);
        //assert.equal(response.results.length, job_count_success);
        done();
      });
    });

    it('should list 3 jobs with the status "failure"', (done) => {
      request(global.test_host + '/api/v1/job?status=failure', (err, res, body) => {
        assert.ifError(err);
        assert.equal(res.statusCode, 200);
        let response = JSON.parse(body);
        assert.isArray(response.results);
        //assert.equal(response.results.length, job_count_failure);
        done();
      });
    });

    it('should find no jobs with the undefined status "foo"', (done) => {
      request(global.test_host + '/api/v1/job/?status=foo', (err, res, body) => {
        assert.ifError(err);
        assert.notProperty(JSON.parse(body), 'results');
        assert.propertyVal(JSON.parse(body), 'error', 'no jobs found');
        done();
      });
    });

    it('should find no jobs of user 9999-9999-9999-9999', (done) => {
      request(global.test_host + '/api/v1/job/?user=9999-9999-9999-9999', (err, res, body) => {
        assert.ifError(err);
        assert.notProperty(JSON.parse(body), 'results');
        assert.propertyVal(JSON.parse(body), 'error', 'no jobs found');
        done();
      });
    });

  });

});