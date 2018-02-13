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
const url = require('url');

require("./setup");

describe('API', () => {
  describe('GET /', function() {
    it('should respond with 404 Not Found (if endpoint of tested host is the configured port only)', function(done) {
      let u = url.parse(global.test_host);
      if (u.port == config.net.port) {
        request(global.test_host, (err, res) => {
          assert.ifError(err);
          assert.equal(res.statusCode, 404);
          done();
        });
      } else {
        this.skip();
      }
    });
  });

  describe('GET /api', () => {
    let path = global.test_host + '/api';
    let current = null;

    it('should respond with 200', (done) => {
      request(path, (err, res) => {
        assert.ifError(err);
        assert.equal(res.statusCode, 200);
        done();
      });
    });
    it('should respond with a JSON object', (done) => {
      request(path, (err, res, body) => {
        assert.ifError(err);
        assert.isObject(JSON.parse(body), 'returned JSON');
        done();
      });
    });
    it('should respond with a document containing about and versions', (done) => {
      request(path, (err, res, body) => {
        let response = JSON.parse(body);
        assert.ifError(err);
        assert.equal(response.about, "http://o2r.info");
        assert.isOk(response.versions);
        assert.isOk(response.versions.current);
        current = response.versions.current;
        done();
      });
    });
    it('should at "current" endpoint return a document with valid sub-paths', (done) => {
      request(global.test_host + current, (err, res, body) => {
        let response = JSON.parse(body);
        assert.ifError(err);
        assert.isOk(response.auth);
        assert.isOk(response.compendia);
        assert.isOk(response.jobs);
        assert.isOk(response.users);
        assert.include(response.auth, current);
        assert.include(response.compendia, current);
        assert.include(response.jobs, current);
        assert.include(response.users, current);
        done();
      });
    });
  });
});
