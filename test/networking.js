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
const chai = require('chai');
const sleep = require('sleep');
const debug = require('debug')('test:networking');

require("./setup");
const cookie_o2r = 's:C0LIrsxGtHOGHld8Nv2jedjL4evGgEHo.GMsWD5Vveq0vBt7/4rGeoH5Xx7Dd2pgZR9DvhKCyDTY';
const cookie_editor = 's:xWHihqZq6jEAObwbfowO5IwdnBxohM7z.VxqsRC5A1VqJVspChcxVPuzEKtRE+aKLF8k3nvCcZ8g';

const sleepSecs = 15;

describe('Container networking', () => {
  var db = mongojs('localhost/muncher', ['compendia', 'jobs']);

  after(function (done) {
    db.close();
    done();
  });

  describe('a workspace that pings itself executes successfully', () => {
    let compendium_id, job_id;

    before(function (done) {
      this.timeout(60000);
      db.compendia.drop(function (err, doc) {
        db.jobs.drop(function (err, doc) {

          let req = createCompendiumPostRequest('./test/workspace/ping', cookie_o2r, 'workspace');
          request(req, (err, res, body) => {
            compendium_id = JSON.parse(body).id;
            publishCandidate(compendium_id, cookie_o2r, () => {
              startJob(compendium_id, id => {
                job_id = id;
                sleep.sleep(sleepSecs);
                done();
              });
            });
          });
        });
      });
    });

    it('should skip generate manifest because Dockerfile is already there', (done) => {
      request(global.test_host + '/api/v1/job/' + job_id, (err, res, body) => {
        assert.ifError(err);
        let response = JSON.parse(body);
        assert.propertyVal(response.steps.generate_manifest, 'status', 'skipped');
        done();
      });
    });

    it('should complete image build', (done) => {
      request(global.test_host + '/api/v1/job/' + job_id, (err, res, body) => {
        assert.ifError(err);
        let response = JSON.parse(body);
        assert.propertyVal(response.steps.image_build, 'status', 'success');
        done();
      });
    });

    it('should complete image execute', (done) => {
      request(global.test_host + '/api/v1/job/' + job_id, (err, res, body) => {
        assert.ifError(err);
        let response = JSON.parse(body);
        assert.propertyVal(response.steps.image_execute, 'status', 'success');
        done();
      });
    });

    it('should complete overall', (done) => {
      request(global.test_host + '/api/v1/job/' + job_id, (err, res, body) => {
        assert.ifError(err);
        let response = JSON.parse(body);
        assert.propertyVal(response, 'status', 'success');
        done();
      });
    });

    it('should include ping messages in the step log', (done) => {
      request(global.test_host + '/api/v1/job/' + job_id + '?steps=image_execute', (err, res, body) => {
        assert.ifError(err);
        let response = JSON.parse(body);
        assert.include(JSON.stringify(response.steps.image_execute.text), 'PING');
        assert.include(JSON.stringify(response.steps.image_execute.text), 'packets transmitted');
        done();
      });
    });
  });

  describe('a workspace that tries to go online fails execution', () => {
    let compendium_id, job_id;

    before(function (done) {
      this.timeout(60000);
      db.compendia.drop(function (err, doc) {

        let req = createCompendiumPostRequest('./test/workspace/ping_online', cookie_o2r, 'workspace');
        request(req, (err, res, body) => {
          compendium_id = JSON.parse(body).id;
          publishCandidate(compendium_id, cookie_o2r, () => {
            startJob(compendium_id, id => {
              job_id = id;
              sleep.sleep(sleepSecs);
              done();
            });
          });
        });
      });
    });

    it('should skip generate manifest because Dockerfile is already there', (done) => {
      request(global.test_host + '/api/v1/job/' + job_id, (err, res, body) => {
        assert.ifError(err);
        let response = JSON.parse(body);
        assert.propertyVal(response.steps.generate_manifest, 'status', 'skipped');
        done();
      });
    });

    it('should complete image build', (done) => {
      request(global.test_host + '/api/v1/job/' + job_id, (err, res, body) => {
        assert.ifError(err);
        let response = JSON.parse(body);
        assert.propertyVal(response.steps.image_build, 'status', 'success');
        done();
      });
    });

    it('should fail image execute', (done) => {
      request(global.test_host + '/api/v1/job/' + job_id, (err, res, body) => {
        assert.ifError(err);
        let response = JSON.parse(body);
        assert.propertyVal(response.steps.image_execute, 'status', 'failure');
        done();
      });
    });

    it('should fail overall', (done) => {
      request(global.test_host + '/api/v1/job/' + job_id, (err, res, body) => {
        assert.ifError(err);
        let response = JSON.parse(body);
        assert.propertyVal(response, 'status', 'failure');
        done();
      });
    });

    it('should include the error in the step log', (done) => {
      request(global.test_host + '/api/v1/job/' + job_id + '?steps=image_execute', (err, res, body) => {
        assert.ifError(err);
        let response = JSON.parse(body);
        assert.include(JSON.stringify(response.steps.image_execute.text), 'bad address');
        done();
      });
    });
  });
});
