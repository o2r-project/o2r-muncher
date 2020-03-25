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

describe('API job overall status', () => {
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

  describe('step_validate_compendium status', () => {
    let job_id = '';

    before(function (done) {
      this.timeout(90000);
      createCompendiumPostRequest('./test/erc/step_validate_compendium', cookie_o2r, 'compendium', (req) => {
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
    });

    it('should have overall status "running" right away', (done) => {
      request(global.test_host + '/api/v1/job/' + job_id, (err, res, body) => {
        assert.ifError(err);
        let response = JSON.parse(body);
        assert.propertyVal(response, 'status', 'running');
        done();
      });
    });

    it('should end with overall status "failure"', (done) => {
      waitForJob(job_id, (finalStatus) => {
        request(global.test_host + '/api/v1/job/' + job_id, (err, res, body) => {
          assert.ifError(err);
          let response = JSON.parse(body);
          assert.propertyVal(response, 'status', 'failure');
          done();
        });
      });
    }).timeout(60000);
  });

  describe('step_image_prepare status', () => {
    let job_id = '';

    before(function (done) {
      this.timeout(90000);
      createCompendiumPostRequest('./test/erc/step_image_prepare', cookie_o2r, 'compendium', (req) => {
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
    });

    it('should have overall status "running" right away', (done) => {
      request(global.test_host + '/api/v1/job/' + job_id, (err, res, body) => {
        assert.ifError(err);
        let response = JSON.parse(body);
        assert.propertyVal(response, 'status', 'running');
        done();
      });
    });

    it('should end with overall status "failure"', (done) => {
      waitForJob(job_id, (finalStatus) => {
        request(global.test_host + '/api/v1/job/' + job_id, (err, res, body) => {
          assert.ifError(err);
          let response = JSON.parse(body);
          assert.propertyVal(response, 'status', 'failure');
          done();
        });
      });
    }).timeout(60000);
  });

  describe('step_image_build status', () => {
    let job_id = '';

    before(function (done) {
      this.timeout(90000);
      createCompendiumPostRequest('./test/erc/step_image_build', cookie_o2r, 'compendium', (req) => {
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
    });

    it('should have overall status "running" right away', (done) => {
      request(global.test_host + '/api/v1/job/' + job_id, (err, res, body) => {
        assert.ifError(err);
        let response = JSON.parse(body);
        assert.propertyVal(response, 'status', 'running');
        done();
      });
    });

    it('should end with overall status "failure"', (done) => {
      waitForJob(job_id, (finalStatus) => {
        request(global.test_host + '/api/v1/job/' + job_id, (err, res, body) => {
          assert.ifError(err);
          let response = JSON.parse(body);
          assert.propertyVal(response, 'status', 'failure');
          done();
        });
      });
    }).timeout(60000);
  });

  describe('step_image_execute status', () => {
    let job_id = '';

    before(function (done) {
      this.timeout(90000);
      createCompendiumPostRequest('./test/erc/step_image_execute', cookie_o2r, 'compendium', (req) => {
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
    });

    it('should have overall status "running" right away', (done) => {
      request(global.test_host + '/api/v1/job/' + job_id, (err, res, body) => {
        assert.ifError(err);
        let response = JSON.parse(body);
        assert.propertyVal(response, 'status', 'running');
        done();
      });
    });

    it('should end with overall status "failure"', (done) => {
      waitForJob(job_id, (finalStatus) => {
        request(global.test_host + '/api/v1/job/' + job_id, (err, res, body) => {
          assert.ifError(err);
          let response = JSON.parse(body);
          assert.propertyVal(response, 'status', 'failure');
          done();
        });
      });
    }).timeout(60000);
  });

  describe('step_check status', () => {
    let job_id = '';

    before(function (done) {
      this.timeout(240000);
      createCompendiumPostRequest('./test/erc/step_check', cookie_o2r, 'compendium', (req) => {
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
    });

    it('should have overall status "running" right away', (done) => {
      request(global.test_host + '/api/v1/job/' + job_id, (err, res, body) => {
        assert.ifError(err);
        let response = JSON.parse(body);
        assert.propertyVal(response, 'status', 'running');
        done();
      });
    });

    it('should end with overall status "success"', (done) => {
      waitForJob(job_id, (finalStatus) => {
        request(global.test_host + '/api/v1/job/' + job_id, (err, res, body) => {
          assert.ifError(err);
          let response = JSON.parse(body);
          assert.propertyVal(response, 'status', 'success');
          done();
        });
      });
    }).timeout(600000);
  });

});
