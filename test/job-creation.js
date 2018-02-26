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
const cookie_plain = 's:yleQfdYnkh-sbj9Ez--_TWHVhXeXNEgq.qRmINNdkRuJ+iHGg5woRa9ydziuJ+DzFG9GnAZRvaaM';

describe('Creation of a job', () => {
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

  describe('job for a workspace failing execution', () => {
    let job_id = '';

    before(function (done) {
      this.timeout(90000);
      createCompendiumPostRequest('./test/workspace/failing-execution', cookie_o2r, 'workspace', (req) => {
        request(req, (err, res, body) => {
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

    it('should end with overall status "failure"', (done) => {
      request(global.test_host + '/api/v1/job/' + job_id, (err, res, body) => {
        assert.ifError(err);
        let response = JSON.parse(body);
        assert.propertyVal(response, 'status', 'failure');
        done();
      });
    });

    it('should fail step image execute', (done) => {
      request(global.test_host + '/api/v1/job/' + job_id, (err, res, body) => {
        assert.ifError(err);
        let response = JSON.parse(body);

        assert.propertyVal(response.steps.image_execute, 'status', 'failure', 'fail execute step');
        done();
      });
    });

    it('should complete or skip previous steps and have next step queued', (done) => {
      request(global.test_host + '/api/v1/job/' + job_id, (err, res, body) => {
        assert.ifError(err);
        let response = JSON.parse(body);

        assert.propertyVal(response.steps.validate_bag, 'status', 'skipped', 'skip validate bag');
        assert.propertyVal(response.steps.validate_compendium, 'status', 'success', 'complete validate compendium');
        assert.propertyVal(response.steps.generate_manifest, 'status', 'skipped', 'skip generate manifest');
        assert.propertyVal(response.steps.image_prepare, 'status', 'success', 'complete image prepare');
        assert.propertyVal(response.steps.check, 'status', 'queued', 'have check queued');
        done();
      });
    });

    it('should not have the display file in the file listing for the job', (done) => {
      request(global.test_host + '/api/v1/job/' + job_id, (err, res, body) => {
        assert.ifError(err);
        let response = JSON.parse(body);
        assert.notInclude(JSON.stringify(response.files), 'display.html');
        done();
      });
    });
  });

  describe('job for a workspace failing manifest generation', () => {
    let job_id = '';

    before(function (done) {
      this.timeout(90000);
      createCompendiumPostRequest('./test/workspace/failing-manifest-generation', cookie_o2r, 'workspace', (req) => {
        request(req, (err, res, body) => {
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

    it('should end with overall status "failure"', (done) => {
      request(global.test_host + '/api/v1/job/' + job_id, (err, res, body) => {
        assert.ifError(err);
        let response = JSON.parse(body);
        assert.propertyVal(response, 'status', 'failure');
        done();
      });
    });

    it('should fail step generate manifest', (done) => {
      request(global.test_host + '/api/v1/job/' + job_id, (err, res, body) => {
        assert.ifError(err);
        let response = JSON.parse(body);

        assert.propertyVal(response.steps.generate_manifest, 'status', 'failure');
        done();
      });
    });

    it('should complete or skip steps and have next step queued', (done) => {
      request(global.test_host + '/api/v1/job/' + job_id, (err, res, body) => {
        assert.ifError(err);
        let response = JSON.parse(body);

        assert.propertyVal(response.steps.validate_bag, 'status', 'skipped', 'skip validate bag');
        assert.propertyVal(response.steps.validate_compendium, 'status', 'success', 'complete validate compendium');
        assert.propertyVal(response.steps.image_prepare, 'status', 'queued', 'image prepare is queued');
        done();
      });
    });

    it('should not have the display file in the file listing for the job', (done) => {
      request(global.test_host + '/api/v1/job/' + job_id, (err, res, body) => {
        assert.ifError(err);
        let response = JSON.parse(body);
        assert.notInclude(JSON.stringify(response.files), 'display.html');
        done();
      });
    });
  });

});
