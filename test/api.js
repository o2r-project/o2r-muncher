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
const fs = require('fs');
const mongojs = require('mongojs');
const chai = require('chai');
chai.use(require('chai-datetime'));

require("./setup");
const cookie = 's:C0LIrsxGtHOGHld8Nv2jedjL4evGgEHo.GMsWD5Vveq0vBt7/4rGeoH5Xx7Dd2pgZR9DvhKCyDTY';

describe('API Compendium', () => {
  before(function (done) {
    this.timeout(1000);
    let db = mongojs('localhost/muncher', ['compendia', 'jobs']);
    db.compendia.drop(function (err, doc) {
      db.jobs.drop(function (err, doc) {
        done();
      });
    });
  });

  describe('GET /api/v1/compendium (no compendium loaded)', () => {
    it('should respond with HTTP 404 Not Found', (done) => {
      request(global.test_host + '/api/v1/compendium', (err, res) => {
        assert.ifError(err);
        assert.equal(res.statusCode, 404);
        done();
      });
    });
    it('should respond with a JSON object', (done) => {
      request(global.test_host + '/api/v1/compendium', (err, res, body) => {
        assert.ifError(err);
        assert.isObject(JSON.parse(body), 'returned JSON');
        done();
      });
    });
    it('should not yet contain array of compendium ids', (done) => {
      request(global.test_host + '/api/v1/compendium', (err, res, body) => {
        assert.ifError(err);
        assert.isUndefined(JSON.parse(body).result, 'returned no results');
        done();
      });
    });
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
      this.timeout(30000);

      request(req, (err, res, body) => {
        assert.ifError(err);
        assert.equal(res.statusCode, 200);
        assert.isObject(JSON.parse(body), 'returned JSON');
        assert.isDefined(JSON.parse(body).id, 'returned id');
        assert.property(JSON.parse(body), 'id');
        compendium_id = JSON.parse(body).id;

        publishCandidate(compendium_id, cookie, done);
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
      this.timeout(10000);

      request(req, (err, res, body) => {
        compendium_id = JSON.parse(body).id;

        publishCandidate(compendium_id, cookie, done);
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
