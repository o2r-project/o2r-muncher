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
const mongojs = require('mongojs');
const chai = require('chai');
const sleep = require('sleep');
chai.use(require('chai-datetime'));

require("./setup")
const cookie = 's:C0LIrsxGtHOGHld8Nv2jedjL4evGgEHo.GMsWD5Vveq0vBt7/4rGeoH5Xx7Dd2pgZR9DvhKCyDTY';

const waitSecs = 5;

describe('API compendium filter', () => {
  before(function (done) {
    this.timeout(10000);
    var db = mongojs('localhost/muncher', ['users', 'sessions', 'compendia', 'jobs']);
    db.compendia.drop(function (err, doc) {
      db.jobs.drop(function (err, doc) { done(); });
    });
  });

  describe('compendium filtering with DOI', () => {
    let compendium_id = '';
    let test_doi = '10.1006/jeem.1994.1031';
    var test_user = '0000-0001-6021-1617';
    
    before(function (done) {
      let req = createCompendiumPostRequest('./test/bagtainers/metatainer-doi', cookie);
      this.timeout(30000);

      request(req, (err, res, body) => {
        compendium_id = JSON.parse(body).id;
        done();
      });
    });

    it('should take a break', (done) => {
      sleep.sleep(waitSecs);
      done();
    }).timeout(waitSecs * 1000 * 2);

    it('should find 1 compendium with the DOI "test_doi"', (done) => {
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
        assert.notProperty(JSON.parse(body), 'results');
        assert.propertyVal(JSON.parse(body), 'error', 'no compendium found');
        done();
      });
    });

    it('should find one compendia with test_doi and user 0000-0001-6021-1617', (done) => {
      request(global.test_host + '/api/v1/compendium/?doi=' + test_doi + '&user='  + test_user, (err, res, body) => {
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
        assert.notProperty(JSON.parse(body), 'results');
        assert.propertyVal(JSON.parse(body), 'error', 'no compendium found');
        done();
      });
    });

    it('should find no compendia with an existing DOI but unknown user', (done) => {
      request(global.test_host + '/api/v1/compendium/?doi=' + test_doi + '&user=9989-9999-9989-9899', (err, res, body) => {
        assert.ifError(err);
        assert.notProperty(JSON.parse(body), 'results');
        assert.propertyVal(JSON.parse(body), 'error', 'no compendium found');
        done();
      });
    });

  });
});
