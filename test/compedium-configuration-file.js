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
const config = require('../config/config');
const createCompendiumPostRequest = require('./util').createCompendiumPostRequest;
const publishCandidate = require('./util').publishCandidate;
const waitForJob = require('./util').waitForJob;
const startJob = require('./util').startJob;
const mongojs = require('mongojs');
const request = require('request');
const yaml = require('yamljs');

require("./setup");
const cookie_o2r = 's:C0LIrsxGtHOGHld8Nv2jedjL4evGgEHo.GMsWD5Vveq0vBt7/4rGeoH5Xx7Dd2pgZR9DvhKCyDTY';

describe('configuration file (erc.yml)', () => {
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

  describe('validation function', () => {

    var is_valid = config.bagtainer.id_is_valid;

    it('should correctly identify valid ids', (done) => {
      assert.isTrue(is_valid('12345abcde'), 'numbers and text');
      assert.isTrue(is_valid('1234-abcde'), 'dash');
      assert.isTrue(is_valid('1234_abcde'), 'underscore');
      assert.isTrue(is_valid('1234.abcde'), 'period');
      assert.isTrue(is_valid('a--.__.--b'), 'multiple separators');
      done();
    });

    it('should correctly identify INvalid ids with separaters at start or end', (done) => {
      assert.isFalse(is_valid('.1234abcde'), 'period at start');
      assert.isFalse(is_valid('1234abcde.'), 'period at end');
      assert.isFalse(is_valid('-1234abcde'), 'dash at start');
      assert.isFalse(is_valid('1234abcde-'), 'dash at end');
      assert.isFalse(is_valid('_1234abcde'), 'underscore at start');
      assert.isFalse(is_valid('1234abcde_'), 'underscore at end');
      done();
    });

    it('should correctly identify INvalid ids with not allowed characters', (done) => {
      assert.isFalse(is_valid('abc-öäü-123'), 'umlaut');
      done();
    });

    it('should correctly identify an empty id', (done) => {
      assert.isFalse(is_valid(''), 'empty');
      done();
    });
  });

  describe('job succeeds with valid id in configuration file', () => {
    let job_id;

    before(function (done) {
      this.timeout(90000);
      createCompendiumPostRequest('./test/workspace/with-erc-yml', cookie_o2r, 'workspace', (req) => {
        request(req, (err, res, body) => {
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
    });

    it('should complete validate compendium', (done) => {
      request(global.test_host + '/api/v1/job/' + job_id, (err, res, body) => {
        assert.ifError(err);
        let response = JSON.parse(body);

        assert.propertyVal(response.steps.validate_compendium, 'status', 'success');
        done();
      });
    });
  });

  describe('job fails with valid id in configuration file', () => {
    let job_id;

    before(function (done) {
      this.timeout(90000);
      createCompendiumPostRequest('./test/workspace/with-invalid-erc-yml', cookie_o2r, 'workspace', (req) => {
        request(req, (err, res, body) => {
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
    });

    it('should fail validate compendium', (done) => {
      request(global.test_host + '/api/v1/job/' + job_id, (err, res, body) => {
        assert.ifError(err);
        let response = JSON.parse(body);

        assert.propertyVal(response.steps.validate_compendium, 'status', 'failure');
        done();
      });
    });
  });

  describe('licenses are in created configuration file', () => {
    let job_id;

    before(function (done) {
      this.timeout(90000);
      createCompendiumPostRequest('./test/workspace/minimal-rmd-data', cookie_o2r, 'workspace', (req) => {
        request(req, (err, res, body) => {
          compendium_id = JSON.parse(body).id;

          let j = request.jar();
          let ck = request.cookie('connect.sid=' + cookie_o2r);
          j.setCookie(ck, global.test_host);

          let req_doc_o2r = {
            uri: global.test_host + '/api/v1/compendium/' + compendium_id + '/metadata',
            method: 'PUT',
            jar: j,
            json: {
              'o2r': {
                'access_right': 'fake',
                'creators': [],
                'description': 'fake',
                'identifier': null,
                'title': 'New title on the block',
                'keywords': [],
                'communities': null,
                'license': {
                  'code': 'a_test_code_license',
                  'data': 'ODbL-1.0',
                  'text': 'licenses.txt',
                  'ui_bindings': 'ui',
                  'metadata': 'CC'
                },
                'publication_date': '1970-01-01',
                'publication_type': 'test',
                'mainfile': 'test.R',
                'displayfile': 'test.html'
              }
            },
            timeout: 30000
          };

          request(req_doc_o2r, (err, res, body) => {
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

    it('should have all licenses in configuration file', (done) => {
      request(global.test_host_transporter + '/api/v1/compendium/' + compendium_id + '/data/' + config.bagtainer.configFile.name, (err, res, body) => {
        assert.ifError(err);
        configuration = yaml.parse(body);
        assert.hasAllKeys(configuration.licenses, ['code', 'data', 'text', 'ui_bindings', 'metadata']);
        done();
      });
    });

    it('should have correct code license in configuration file', (done) => {
      request(global.test_host_transporter + '/api/v1/compendium/' + compendium_id + '/data/' + config.bagtainer.configFile.name, (err, res, body) => {
        assert.ifError(err);
        assert.include(body, 'code: a_test_code_license');
        done();
      });
    });

    it('should have correct data license in configuration file', (done) => {
      request(global.test_host_transporter + '/api/v1/compendium/' + compendium_id + '/data/' + config.bagtainer.configFile.name, (err, res, body) => {
        assert.ifError(err);
        assert.include(body, 'data: ODbL-1.0');
        done();
      });
    });

    it('should have correct text license in configuration file', (done) => {
      request(global.test_host_transporter + '/api/v1/compendium/' + compendium_id + '/data/' + config.bagtainer.configFile.name, (err, res, body) => {
        assert.ifError(err);
        assert.include(body, 'text: licenses.txt');
        done();
      });
    });

    it('should have correct ui bindings license in configuration file', (done) => {
      request(global.test_host_transporter + '/api/v1/compendium/' + compendium_id + '/data/' + config.bagtainer.configFile.name, (err, res, body) => {
        assert.ifError(err);
        assert.include(body, 'ui_bindings: ui');
        done();
      });
    });

    it('should have correct metadata license in configuration file', (done) => {
      request(global.test_host_transporter + '/api/v1/compendium/' + compendium_id + '/data/' + config.bagtainer.configFile.name, (err, res, body) => {
        assert.ifError(err);
        assert.include(body, 'metadata: CC');
        done();
      });
    });
  });
});
