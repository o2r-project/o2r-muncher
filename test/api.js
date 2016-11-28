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
const assert    = require('chai').assert;
const request   = require('request');
const config    = require('../config/config');
const fs        = require('fs');
const host      = 'http://localhost:' + config.net.port;
const chai = require('chai');
chai.use(require('chai-datetime'));

require("./setup")
const cookie = 's:C0LIrsxGtHOGHld8Nv2jedjL4evGgEHo.GMsWD5Vveq0vBt7/4rGeoH5Xx7Dd2pgZR9DvhKCyDTY';

const requestTimeout = 10000;

describe('API Compendium', () => {
  /*
   *  After starting a fresh Muncher instance, no compendia should be available
   *  The listing thus should return a 404 error.
   */
  describe('GET /api/v1/compendium (no compendium loaded)', () => {
    it('should respond with HTTP 404 Not Found', (done) => {
      request(host + '/api/v1/compendium', (err, res) => {
        assert.ifError(err);
        assert.equal(res.statusCode, 404);
        done();
      });
    });
    it('should respond with a JSON object', (done) => {
      request(host + '/api/v1/compendium', (err, res, body) => {
        assert.ifError(err);
        assert.isObject(JSON.parse(body), 'returned JSON');
        done();
      });
    });
    it('should not yet contain array of compendium ids', (done) => {
      request(host + '/api/v1/compendium', (err, res, body) => {
        assert.ifError(err);
        assert.isUndefined(JSON.parse(body).result, 'returned no results');
        done();
      });
    });
  });

  /*
   *  POST a valid trivial BagIt archive to create a new compendium.
   */
  let compendium_id = '';
  describe('POST /api/v1/compendium success-load.zip', () => {
    it('should respond with HTTP 200 OK and new ID', (done) => {
      let formData = {
        'content_type': 'compendium_v1',
        'compendium': {
          value: fs.createReadStream('./test/bagtainers/success-load.zip'),
          options: {
            contentType: 'application/zip'
          }
        }
      };
      let j = request.jar();
      let ck = request.cookie('connect.sid=' + cookie);
      j.setCookie(ck, host);

      request({
        uri: host + '/api/v1/compendium',
        method: 'POST',
        jar: j,
        formData: formData,
        timeout: requestTimeout
      }, (err, res, body) => {
        assert.ifError(err);
        assert.equal(res.statusCode, 200);
        assert.isObject(JSON.parse(body), 'returned JSON');
        assert.isDefined(JSON.parse(body).id, 'returned id');
        compendium_id = JSON.parse(body).id;
        done();
      });
    });
  });

  describe('GET /api/v1/compendium (after compendium loaded)', () => {
    it('should respond with HTTP 200 OK and \'results\' array', (done) => {
      request(host + '/api/v1/compendium', (err, res, body) => {
        assert.ifError(err);
        assert.equal(res.statusCode, 200);
        assert.isDefined(JSON.parse(body).results, 'results returned');
        assert.include(JSON.parse(body).results, compendium_id, 'id is in results');
        done();
      });
    });
  });

  describe('GET /api/v1/compendium/<id of loaded compendium>', () => {
    it('should respond with HTTP 200 OK', (done) => {
      request(host + '/api/v1/compendium', (err, res) => {
        assert.ifError(err);
        assert.equal(res.statusCode, 200);
        done();
      });
    });
    it('should respond with a valid JSON document', (done) => {
      request(host + '/api/v1/compendium', (err, res, body) => {
        assert.ifError(err);
        assert.isObject(JSON.parse(body));
        done();
      });
    });
    it('should respond with document containing correct properties, including compendium id and user id', (done) => {
      request(host + '/api/v1/compendium/' + compendium_id, (err, res, body) => {
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
      request(host + '/api/v1/compendium/' + compendium_id, (err, res, body) => {
        assert.ifError(err);
        let response = JSON.parse(body);
        assert.isObject(response.files);
        assert.isArray(response.files.children);
        done();
      });
    });
    it('should respond with a creation date just a few seconds ago', (done) => {
      request(host + '/api/v1/compendium/' + compendium_id, (err, res, body) => {
        assert.ifError(err);
        let response = JSON.parse(body);
        let created = new Date(response.created);
        let now = new Date();
        let afewsecondsago = new Date(now.getTime() - (1000 * 42));
        assert.equalDate(created, now);
        assert.beforeTime(created, now);
        assert.afterTime(created, afewsecondsago);
        done();
      });
    });
  });

  describe('POST /api/v1/compendium invalid.zip (not a zip file)', () => {
    it('should respond with HTTP 500 error', (done) => {
      let formData = {
        'content_type': 'compendium_v1',
        'compendium': {
          value: fs.createReadStream('./test/bagtainers/invalid.zip'),
          options: {
            contentType: 'application/zip'
          }
        }
      };
      let j = request.jar();
      let ck = request.cookie('connect.sid=' + cookie);
      j.setCookie(ck, host);

      request({
        uri: host + '/api/v1/compendium',
        method: 'POST',
        jar: j,
        formData: formData,
        timeout: requestTimeout
      }, (err, res, body) => {
        assert.ifError(err);
        assert.equal(res.statusCode, 500);
        assert.isObject(JSON.parse(body), 'returned JSON');
        assert.isDefined(JSON.parse(body).error, 'returned error');
        assert.include(JSON.parse(body).error, 'extraction failed: ');
        done();
      });
    });


    it('should NOT respond with internal configuration of the server', (done) => {
      let formData = {
        'content_type': 'compendium_v1',
        'compendium': {
          value: fs.createReadStream('./test/bagtainers/invalid.zip'),
          options: {
            contentType: 'application/zip'
          }
        }
      };
      let j = request.jar();
      let ck = request.cookie('connect.sid=' + cookie);
      j.setCookie(ck, host);

      request({
        uri: host + '/api/v1/compendium',
        method: 'POST',
        jar: j,
        formData: formData,
        timeout: requestTimeout
      }, (err, res, body) => {
        assert.ifError(err);
        assert.notInclude(JSON.parse(body).error, config.fs.base);
        done();
      });
    });
  });

  describe('POST /api/v1/compendium empty.zip (empty zip file)', () => {
    it('should respond with ERROR 500 and valid JSON document', (done) => {
      let formData = {
        'content_type': 'compendium_v1',
        'compendium': {
          value: fs.createReadStream('./test/bagtainers/empty.zip'),
          options: {
            contentType: 'application/zip'
          }
        }
      };
      let j = request.jar();
      let ck = request.cookie('connect.sid=' + cookie);
      j.setCookie(ck, host);

      request({
        uri: host + '/api/v1/compendium',
        method: 'POST',
        jar: j,
        formData: formData,
        timeout: 1000 * 60
      }, (err, res, body) => {
         assert.ifError(err);
         assert.equal(res.statusCode, 500);
         assert.isObject(JSON.parse(body), 'returned JSON');
         done();
        });
    }).timeout(1000 * 60);

    it('should respond provide a helpful error message', (done) => {
      let formData = {
        'content_type': 'compendium_v1',
        'compendium': {
          value: fs.createReadStream('./test/bagtainers/empty.zip'),
          options: {
            contentType: 'application/zip'
          }
        }
      };
      let j = request.jar();
      let ck = request.cookie('connect.sid=' + cookie);
      j.setCookie(ck, host);

      request({
        uri: host + '/api/v1/compendium',
        method: 'POST',
        jar: j,
        formData: formData,
        timeout: requestTimeout
      }, (err, res, body) => {
         assert.ifError(err);
         assert.include(JSON.parse(body).error, 'zipfile is empty');
         done();
        });
    });

  });
});
