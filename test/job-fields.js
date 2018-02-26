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

require("./setup");
const cookie_o2r = 's:C0LIrsxGtHOGHld8Nv2jedjL4evGgEHo.GMsWD5Vveq0vBt7/4rGeoH5Xx7Dd2pgZR9DvhKCyDTY';

describe('returned fields in job listing', () => {
  db = mongojs('localhost/muncher', ['compendia', 'jobs']);

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

  describe('status and user fields', () => {
    let job_id = '';

    // upload 1st compendium with final job status "success"
    before(function (done) {
      this.timeout(90000);
      createCompendiumPostRequest('./test/erc/step_check', cookie_o2r, 'compendium', (req) => {

        request(req, (err, res, body) => {
          assert.equal(res.statusCode, 200);
          assert.property(JSON.parse(body), 'id');
          let compendium_id = JSON.parse(body).id;

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
    });

    it('should show the status of a job in the list view', (done) => {
      request(global.test_host + '/api/v1/job/?fields=status', (err, res, body) => {
        assert.ifError(err);
        let response = JSON.parse(body);
        assert.equal(res.statusCode, 200);
        assert.isArray(response.results);
        assert.property(response.results[0], 'id');
        assert.property(response.results[0], 'status');
        assert.notProperty(response.results[0], 'user');
        assert.isNotEmpty(response.results[0].status);
        done();
      });
    });

    it('should show the user of a job in the list view', (done) => {
      request(global.test_host + '/api/v1/job/?fields=user', (err, res, body) => {
        assert.ifError(err);
        let response = JSON.parse(body);
        assert.equal(res.statusCode, 200);
        assert.isArray(response.results);
        assert.property(response.results[0], 'id');
        assert.property(response.results[0], 'user');
        assert.isNotEmpty(response.results[0].user);
        done();
      });
    });

    it('should show both user and status of a job in the list view when asking for both', (done) => {
      request(global.test_host + '/api/v1/job/?fields=user,status', (err, res, body) => {
        assert.ifError(err);
        let response = JSON.parse(body);
        assert.equal(res.statusCode, 200);
        assert.isArray(response.results);
        assert.property(response.results[0], 'id');
        assert.property(response.results[0], 'user');
        assert.property(response.results[0], 'status');
        assert.isNotEmpty(response.results[0].user);
        assert.isNotEmpty(response.results[0].status);
        done();
      });
    });

    it('should show both status and user of a job in the list view independent of field order', (done) => {
      request(global.test_host + '/api/v1/job/?fields=status,user', (err, res, body) => {
        assert.ifError(err);
        let response = JSON.parse(body);
        assert.equal(res.statusCode, 200);
        assert.isArray(response.results);
        assert.property(response.results[0], 'id');
        assert.property(response.results[0], 'status');
        assert.property(response.results[0], 'user');
        assert.propertyVal(response.results[0], 'status', 'success');
        done();
      });
    });

    it('should handle spaces in the fields list', (done) => {
      request(global.test_host + '/api/v1/job/?fields= status , user', (err, res, body) => {
        assert.ifError(err);
        let response = JSON.parse(body);
        assert.equal(res.statusCode, 200);
        assert.isArray(response.results);
        assert.property(response.results[0], 'id');
        assert.property(response.results[0], 'status');
        assert.property(response.results[0], 'user');
        done();
      });
    });

    it('should handle empty items in the fields list', (done) => {
      request(global.test_host + '/api/v1/job/?fields=,user,,,', (err, res, body) => {
        assert.ifError(err);
        let response = JSON.parse(body);
        assert.equal(res.statusCode, 200);
        assert.isArray(response.results);
        assert.property(response.results[0], 'id');
        assert.notProperty(response.results[0], 'status');
        assert.property(response.results[0], 'user');
        done();
      });
    });

    it('should handle duplicate items in the fields list', (done) => {
      request(global.test_host + '/api/v1/job/?fields=,status,,,status', (err, res, body) => {
        assert.ifError(err);
        let response = JSON.parse(body);
        assert.equal(res.statusCode, 200);
        assert.isArray(response.results);
        assert.property(response.results[0], 'id');
        assert.property(response.results[0], 'status');
        assert.notProperty(response.results[0], 'user');
        done();
      });
    });
  });

  describe('unsupported field requests', () => {
    it('should return error when asking for an unsupported field "foo"', (done) => {
      request(global.test_host + '/api/v1/job/?fields=foo', (err, res, body) => {
        assert.ifError(err);
        assert.equal(res.statusCode, 400);
        let response = JSON.parse(body);
        assert.property(response, 'error');
        assert.notProperty(response, 'results');
        done();
      });
    });

    it('should ignore empty fields filter', (done) => {
      request(global.test_host + '/api/v1/job/?fields=', (err, res, body) => {
        assert.ifError(err);
        assert.equal(res.statusCode, 200);
        let response = JSON.parse(body);
        assert.notProperty(response, 'error');
        assert.property(response, 'results');
        assert.property(response.results[0], 'id');
        assert.notProperty(response.results[0], 'user');
        assert.notProperty(response.results[0], 'status');
        done();
      });
    });

    it('should ignore empty list in fields filter', (done) => {
      request(global.test_host + '/api/v1/job/?fields=, ,', (err, res, body) => {
        assert.ifError(err);
        assert.equal(res.statusCode, 200);
        let response = JSON.parse(body);
        assert.notProperty(response, 'error');
        assert.property(response, 'results');
        assert.property(response.results[0], 'id');
        assert.notProperty(response.results[0], 'user');
        assert.notProperty(response.results[0], 'status');
        done();
      });
    });
  });

});