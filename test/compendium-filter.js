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
const chai = require('chai');
chai.use(require('chai-datetime'));
const debug = require('debug')('test:compendium-filter');

require("./setup");
const cookie_o2r = 's:C0LIrsxGtHOGHld8Nv2jedjL4evGgEHo.GMsWD5Vveq0vBt7/4rGeoH5Xx7Dd2pgZR9DvhKCyDTY';
const cookie_editor = 's:xWHihqZq6jEAObwbfowO5IwdnBxohM7z.VxqsRC5A1VqJVspChcxVPuzEKtRE+aKLF8k3nvCcZ8g';

describe('API compendium filter', () => {
  var db = mongojs('localhost/muncher', ['compendia']);

  after(function (done) {
    db.close();
    done();
  });

  describe('compendium filtering with DOI', () => {
    let compendium_id = '';
    let test_doi = '10.5555/12345678';
    var test_user = '0000-0001-6021-1617';

    before(function (done) {
      this.timeout(60000);
      db.compendia.drop(function (err, doc) { // start without any compendia
        let req = createCompendiumPostRequest('./test/erc/metatainer-doi', cookie_o2r);
        request(req, (err, res, body) => {
          compendium_id = JSON.parse(body).id;
          publishCandidate(compendium_id, cookie_o2r, () => {
            done();
          });
        });
      });
    });

    it('should have the DOI in raw metadata', (done) => {
      request(global.test_host + '/api/v1/compendium/' + compendium_id, (err, res, body) => {
        assert.ifError(err);
        assert.equal(res.statusCode, 200);
        let response = JSON.parse(body);
        assert.include(JSON.stringify(response.metadata.raw), test_doi);
        done();
      });
    });

    it('should have the DOI in brokered o2r metadata (needed for the filter)', (done) => {
      request(global.test_host + '/api/v1/compendium/' + compendium_id, (err, res, body) => {
        assert.ifError(err);
        assert.equal(res.statusCode, 200);
        let response = JSON.parse(body);
        assert.include(JSON.stringify(response.metadata.o2r), test_doi);
        done();
      });
    });

    it('should find 1 compendium with the DOI test doi', (done) => {
      request(global.test_host + '/api/v1/compendium/?doi=' + test_doi, (err, res, body) => {
        assert.ifError(err);
        assert.equal(res.statusCode, 200);
        let response = JSON.parse(body);
        assert.isArray(response.results);
        assert.equal(response.results.length, 1);
        assert.equal(response.results[0], compendium_id);
        done();
      });
    });

    it('should find no compendia with an unused DOI', (done) => {
      request(global.test_host + '/api/v1/compendium/?doi=12.3456%2Fasdf', (err, res, body) => {
        assert.ifError(err);
        assert.equal(res.statusCode, 200);
        let response = JSON.parse(body);
        assert.property(response, 'results');
        assert.notProperty(response, 'error');
        assert.isEmpty(response.results);
        done();
      });
    });

    it('should find one compendia with test_doi and user 0000-0001-6021-1617', (done) => {
      request(global.test_host + '/api/v1/compendium/?doi=' + test_doi + '&user=' + test_user, (err, res, body) => {
        assert.ifError(err);
        assert.equal(res.statusCode, 200);
        let response = JSON.parse(body);
        assert.isArray(response.results);
        assert.equal(response.results.length, 1);
        assert.equal(response.results[0], compendium_id);
        done();
      });
    });

    it('should find no compendia with an unused DOI but valid user', (done) => {
      request(global.test_host + '/api/v1/compendium/?doi=12.3456/asdf' + '&user=' + test_user, (err, res, body) => {
        assert.ifError(err);
        assert.equal(res.statusCode, 200);
        let response = JSON.parse(body);
        assert.property(response, 'results');
        assert.notProperty(response, 'error');
        assert.isEmpty(response.results);
        done();
      });
    });

    it('should find no compendia with an existing DOI but unknown user', (done) => {
      request(global.test_host + '/api/v1/compendium/?doi=' + test_doi + '&user=9989-9999-9989-9899', (err, res, body) => {
        assert.ifError(err);
        assert.equal(res.statusCode, 200);
        let response = JSON.parse(body);
        assert.property(response, 'results');
        assert.notProperty(response, 'error');
        assert.isEmpty(response.results);
        done();
      });
    });

  });

  describe('compendium filtering with user', () => {
    let compendium1_id, compendium2_id, compendium3_id = '';
    var test_user = '0000-0001-6021-1617';

    before(function (done) {
      this.timeout(60000);
      db.compendia.drop(function (err, doc) { // start without any compendia

        let req = createCompendiumPostRequest('./test/erc/metatainer-doi', cookie_o2r);
        request(req, (err, res, body) => {
          compendium1_id = JSON.parse(body).id;
          publishCandidate(compendium1_id, cookie_o2r, () => {

            let req = createCompendiumPostRequest('./test/workspace/ping', cookie_o2r, 'workspace');
            request(req, (err, res, body2) => {
              compendium2_id = JSON.parse(body2).id;
              publishCandidate(compendium2_id, cookie_o2r, () => {

                let req = createCompendiumPostRequest('./test/workspace/ping', cookie_editor, 'workspace');
                request(req, (err, res, body3) => {
                  compendium3_id = JSON.parse(body3).id;
                  publishCandidate(compendium3_id, cookie_editor, () => {
                    done();
                  });
                });
              });
            });
          });
        });
      });
    });

    it('should find 2 compendia with for the one test user', (done) => {
      request(global.test_host + '/api/v1/compendium?user=' + test_user, (err, res, body) => {
        assert.ifError(err);
        assert.equal(res.statusCode, 200);
        let response = JSON.parse(body);
        assert.isArray(response.results);
        assert.equal(response.results.length, 2);
        assert.includeMembers(response.results, [compendium1_id, compendium2_id]);
        assert.notIncludeMembers(response.results, [compendium3_id]);
        done();
      });
    });

    it('should find 1 compendia with for the other test user', (done) => {
      request(global.test_host + '/api/v1/compendium?user=1717-0000-0000-1717', (err, res, body) => {
        assert.ifError(err);
        assert.equal(res.statusCode, 200);
        let response = JSON.parse(body);
        assert.isArray(response.results);
        assert.equal(response.results.length, 1);
        assert.notIncludeMembers(response.results, [compendium1_id, compendium2_id]);
        assert.includeMembers(response.results, [compendium3_id]);
        done();
      });
    });
  });
});
