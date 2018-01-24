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
const fs = require('fs');
const mongojs = require('mongojs');
const chai = require('chai');
chai.use(require('chai-datetime'));

require("./setup");

const cookie = 's:C0LIrsxGtHOGHld8Nv2jedjL4evGgEHo.GMsWD5Vveq0vBt7/4rGeoH5Xx7Dd2pgZR9DvhKCyDTY';

describe('API Compendium', () => {
  var db = mongojs('localhost/muncher', ['compendia', 'jobs']);

  before(function (done) {
    this.timeout(1000);
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

  describe('GET /api/v1/compendium (no compendium loaded)', () => {
    it('should respond with HTTP 200 and valid JSON', (done) => {
      request(global.test_host + '/api/v1/compendium', (err, res, body) => {
        assert.ifError(err);
        assert.equal(res.statusCode, 200);
        assert.isObject(JSON.parse(body), 'returned JSON');
        done();
      });
    });

    it('should respond with an empty results list and no error', (done) => {
      request(global.test_host + '/api/v1/compendium', (err, res, body) => {
        assert.ifError(err);
        let response = JSON.parse(body);
        assert.notProperty(response, 'error');
        assert.property(response, 'results');
        assert.isArray(response.results);
        assert.isEmpty(response.results);
        done();
      });
    });
  });

  describe('GET /api/v1/compendium/1234 (no compendium loaded)', () => {
    it('should return an error message when asking for a non-existing compendium', (done) => {
      request(global.test_host + '/api/v1/compendium/1234', (err, res, body) => {
        assert.ifError(err);
        assert.equal(res.statusCode, 404);
        assert.isUndefined(JSON.parse(body).result, 'returned no results');
        assert.propertyVal(JSON.parse(body), 'error', 'no compendium with this id');
        done();
      });
    });
  });

  describe('GET /api/v1/compendium with executing compendium loaded and published', () => {
    let compendium_id = '';
    before(function (done) {
      let req = createCompendiumPostRequest('./test/erc/step_image_execute', cookie);
      this.timeout(60000);

      request(req, (err, res, body) => {
        assert.ifError(err);
        assert.equal(res.statusCode, 200);
        assert.isObject(JSON.parse(body), 'returned JSON');
        assert.isDefined(JSON.parse(body).id, 'returned id');
        assert.property(JSON.parse(body), 'id');
        compendium_id = JSON.parse(body).id;

        publishCandidate(compendium_id, cookie, () => {
          done();
        });
      });
    });

    it('should respond with HTTP 200 OK and \'results\' array', (done) => {
      request(global.test_host + '/api/v1/compendium', (err, res, body) => {
        assert.ifError(err);
        assert.equal(res.statusCode, 200);
        assert.isDefined(JSON.parse(body).results, 'results returned');
        assert.include(JSON.parse(body).results, compendium_id, 'id is in results');
        done();
      });
    });
  });

  describe('GET /api/v1/compendium/<id>', () => {
    let compendium_id = '';
    before(function (done) {
      let req = createCompendiumPostRequest('./test/erc/step_image_execute', cookie);
      this.timeout(60000);

      request(req, (err, res, body) => {
        compendium_id = JSON.parse(body).id;

        publishCandidate(compendium_id, cookie, () => {
          done();
        });
      });
    });

    it('should respond with HTTP 200 OK', (done) => {
      request(global.test_host + '/api/v1/compendium', (err, res) => {
        assert.ifError(err);
        assert.equal(res.statusCode, 200);
        done();
      });
    });
    it('should respond with a valid JSON document', (done) => {
      request(global.test_host + '/api/v1/compendium', (err, res, body) => {
        assert.ifError(err);
        assert.isObject(JSON.parse(body));
        done();
      });
    });
    it('should respond with document containing correct properties, including compendium id and user id', (done) => {
      request(global.test_host + '/api/v1/compendium/' + compendium_id, (err, res, body) => {
        assert.ifError(err);
        let response = JSON.parse(body);
        assert.property(response, 'id');
        assert.property(response, 'created');
        assert.property(response, 'user');
        assert.property(response, 'files');
        assert.propertyVal(response, 'id', compendium_id);
        assert.propertyVal(response, 'user', '0000-0001-6021-1617');
        done();
      });
    });
    it('should respond with missing candidate and correct substituted properties', (done) => {
      request(global.test_host + '/api/v1/compendium/' + compendium_id, (err, res, body) => {
        assert.ifError(err);
        let response = JSON.parse(body);
        assert.notProperty(response, 'candidate');
        assert.property(response, 'substituted');
        assert.propertyVal(response, 'substituted', false);
        done();
      });
    });
    it('should respond with files listing including children', (done) => {
      request(global.test_host + '/api/v1/compendium/' + compendium_id, (err, res, body) => {
        assert.ifError(err);
        let response = JSON.parse(body);
        assert.isObject(response.files);
        assert.isArray(response.files.children);
        done();
      });
    });
    it('should respond with a creation date just a few seconds ago', (done) => {
      request(global.test_host + '/api/v1/compendium/' + compendium_id, (err, res, body) => {
        assert.ifError(err);
        let response = JSON.parse(body);
        let created = new Date(response.created);
        let now = new Date();
        let aFewSecondsAgo = new Date(now.getTime() - (1000 * 42));
        assert.equalDate(created, now);
        assert.beforeTime(created, now);
        assert.afterTime(created, aFewSecondsAgo);
        done();
      });
    });
  });
});

describe('API Compendium sub-resource /jobs', () => {
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

  describe('GET /api/v1/compendium/ sub-endpoint /jobs', () => {
    let compendium_id = '';
    before(function (done) {
      this.timeout(60000);
      let req = createCompendiumPostRequest('./test/erc/step_image_execute', cookie);

      request(req, (err, res, body) => {
        response = JSON.parse(body);
        assert.ifError(err);
        assert.notProperty(response, 'error');

        compendium_id = response.id;
        publishCandidate(compendium_id, cookie, () => {
          done();
        });
      });
    });

    it('should respond with HTTP 200 and an empty list when there is no job for an existing compendium', (done) => {
      request(global.test_host + '/api/v1/compendium/' + compendium_id + '/jobs', (err, res, body) => {
        assert.ifError(err);
        assert.equal(res.statusCode, 200);
        let response = JSON.parse(body);
        assert.property(response, 'results');
        assert.notProperty(response, 'error');
        assert.isEmpty(response.results);
        done();
      });
    });

    it('should respond with HTTP 200 valid JSON and one job in the list of jobs when one is started', (done) => {
      startJob(compendium_id, id => {
        request(global.test_host + '/api/v1/compendium/' + compendium_id + '/jobs', (err, res, body) => {
          assert.ifError(err);
          assert.equal(res.statusCode, 200);
          response = JSON.parse(body);
          assert.isObject(response);
          assert.isDefined(response.results, 'results returned');
          assert.isArray(response.results);
          assert.lengthOf(response.results, 1);
          assert.include(response.results, id, 'job id is in results');
          done();
        });
      });
    });

    it('should respond with HTTP 200 valid JSON and two jobs in the list of jobs when another one is started', (done) => {
      startJob(compendium_id, id => {
        request(global.test_host + '/api/v1/compendium/' + compendium_id + '/jobs', (err, res, body) => {
          assert.ifError(err);
          assert.equal(res.statusCode, 200);
          response = JSON.parse(body);
          assert.isObject(response);
          assert.lengthOf(response.results, 2);
          assert.include(response.results, id, 'job id is in results');
          done();
        });
      });
    });

    it('should respond with HTTP 404 and error message when that compendium does not exist', (done) => {
      request(global.test_host + '/api/v1/compendium/1234/jobs', (err, res, body) => {
        assert.ifError(err);
        assert.equal(res.statusCode, 404);
        assert.isUndefined(JSON.parse(body).result, 'returned no results');
        assert.propertyVal(JSON.parse(body), 'error', 'no compendium with id 1234');
        done();
      });
    });
  });
});
