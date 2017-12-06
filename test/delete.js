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
const path = require('path');
const mongojs = require('mongojs');
const fs = require('fs');
const config = require('../config/config');
const chai = require('chai');
chai.use(require('chai-datetime'));
const createCompendiumPostRequest = require('./util').createCompendiumPostRequest;
const publishCandidate = require('./util').publishCandidate;

require("./setup");

const cookie_o2r = 's:C0LIrsxGtHOGHld8Nv2jedjL4evGgEHo.GMsWD5Vveq0vBt7/4rGeoH5Xx7Dd2pgZR9DvhKCyDTY';
const cookie_plain = 's:yleQfdYnkh-sbj9Ez--_TWHVhXeXNEgq.qRmINNdkRuJ+iHGg5woRa9ydziuJ+DzFG9GnAZRvaaM';
const cookie_admin = 's:hJRjapOTVCEvlMYCb8BXovAOi2PEOC4i.IEPb0lmtGojn2cVk2edRuomIEanX6Ddz87egE5Pe8UM';
const cookie_editor = 's:xWHihqZq6jEAObwbfowO5IwdnBxohM7z.VxqsRC5A1VqJVspChcxVPuzEKtRE+aKLF8k3nvCcZ8g';

describe('Delete candidate (using metatainer)', () => {
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

  describe('as author', () => {
    let compendium_id = null;

    before(function (done) {
      let req = createCompendiumPostRequest('./test/erc/metatainer', cookie_o2r);
      this.timeout(60000);

      request(req, (err, res, body) => {
        compendium_id = JSON.parse(body).id;
        done();
      });
    });

    it('should return HTTP code 204 with empty body for DELETE request', (done) => {
      j = request.jar();
      ck = request.cookie('connect.sid=' + cookie_o2r);
      j.setCookie(ck, global.test_host);

      request({
        uri: global.test_host + '/api/v1/compendium/' + compendium_id,
        method: 'DELETE',
        jar: j
      }, (err, res, body) => {
        assert.ifError(err);
        assert.equal(res.statusCode, 204);
        assert.notInclude(body, 'error');
        assert.isEmpty(body);
        done();
      });
    });

    it('should not have the compendium in the database anymore', (done) => {
      db.compendia.findOne({ id: compendium_id }, function (err, doc) {
        assert.ifError(err);
        assert.isNull(doc);
        done();
      })
    });

    it('should return HTTP 404 with valid JSON and error response when requesting compendium by id after deletion', (done) => {
      request({
        uri: global.test_host + '/api/v1/compendium/' + compendium_id,
        method: 'GET'
      }, (err, res, body) => {
        assert.ifError(err);
        assert.equal(res.statusCode, 404);
        let response = JSON.parse(body);
        assert.isObject(response);
        assert.property(response, 'error');
        assert.notProperty(response, 'id');
        done();
      });
    });

    it('should return HTTP 404 with valid JSON and error response when DELETING again', (done) => {
      let j = request.jar();
      let ck = request.cookie('connect.sid=' + cookie_o2r);
      j.setCookie(ck, global.test_host);

      request({
        uri: global.test_host + '/api/v1/compendium/' + compendium_id,
        method: 'DELETE',
        jar: j
      }, (err, res, body) => {
        assert.ifError(err);
        assert.equal(res.statusCode, 404);
        let response = JSON.parse(body);
        assert.isObject(response);
        assert.property(response, 'error');
        assert.notProperty(response, 'id');
        done();
      });
    });

    it('should return not have the files in the storage anymore', (done) => {
      tryAccess = function () {
        fs.accessSync(path.join(config.fs.compendium, compendium_id));
      }
      assert.throws(tryAccess, Error, 'no such file or directory');
      done();
    });
  });

  describe('as unauthorized user', () => {
    let compendium_id = null;

    before(function (done) {
      let req = createCompendiumPostRequest('./test/erc/metatainer', cookie_o2r);
      this.timeout(60000);

      request(req, (err, res, body) => {
        compendium_id = JSON.parse(body).id;
        done();
      });
    });

    it('should return HTTP code 401 with valid JSON content and error message', (done) => {
      request({
        uri: global.test_host + '/api/v1/compendium/' + compendium_id,
        method: 'GET'
      }, (err, res, body) => {
        assert.ifError(err);
        assert.equal(res.statusCode, 401);
        let response = JSON.parse(body);
        assert.isObject(response);
        assert.notProperty(response, 'id');
        assert.property(response, 'error');
        done();
      });
    });

    it('should still have the compendium in the database', (done) => {
      db.compendia.findOne({ id: compendium_id }, function (err, doc) {
        assert.ifError(err);
        assert.isNotNull(doc);
        assert.propertyVal(doc, 'id', compendium_id);
        done();
      })
    });
  });

  describe('as a different but at least logged-in user', () => {
    let compendium_id = null;

    before(function (done) {
      let req = createCompendiumPostRequest('./test/erc/metatainer', cookie_o2r);
      this.timeout(60000);

      request(req, (err, res, body) => {
        compendium_id = JSON.parse(body).id;
        done();
      });
    });

    it('should return HTTP code 403 with valid JSON content and error message', (done) => {
      j = request.jar();
      ck = request.cookie('connect.sid=' + cookie_plain);
      j.setCookie(ck, global.test_host);

      request({
        uri: global.test_host + '/api/v1/compendium/' + compendium_id,
        method: 'DELETE',
        jar: j,
        timeout: 1000
      }, (err, res, body) => {
        assert.ifError(err);
        assert.equal(res.statusCode, 403);
        let response = JSON.parse(body);
        assert.isObject(response);
        assert.notProperty(response, 'id');
        assert.property(response, 'error');
        done();
      });
    });

    it('should still have the compendium in the database', (done) => {
      db.compendia.findOne({ id: compendium_id }, function (err, doc) {
        assert.ifError(err);
        assert.isNotNull(doc);
        assert.propertyVal(doc, 'id', compendium_id);
        done();
      })
    });
  });

  describe('as admin user', () => {
    let compendium_id = null;

    before(function (done) {
      let req = createCompendiumPostRequest('./test/erc/metatainer', cookie_admin);
      this.timeout(60000);

      request(req, (err, res, body) => {
        compendium_id = JSON.parse(body).id;
        done();

      });
    });

    it('should return HTTP code 204 with empty body', (done) => {
      let j = request.jar();
      let ck = request.cookie('connect.sid=' + cookie_admin);
      j.setCookie(ck, global.test_host);

      request({
        uri: global.test_host + '/api/v1/compendium/' + compendium_id,
        method: 'DELETE',
        jar: j,
        timeout: 1000
      }, (err, res, body) => {
        assert.ifError(err);
        assert.equal(res.statusCode, 204);
        assert.isEmpty(body);
        done();
      });
    });

    it('should not have the compendium in the database anymore', (done) => {
      db.compendia.findOne({ id: compendium_id }, function (err, doc) {
        assert.ifError(err);
        assert.isNull(doc);
        done();
      })
    });
  });

  describe('wrong requests', () => {
    it('should return HTTP 404 with valid JSON and error response when trying to delete non-existing compendium', (done) => {
      request({
        uri: global.test_host + '/api/v1/compendium/' + 'not-an-id',
        method: 'DELETE'
      }, (err, res, body) => {
        assert.ifError(err);
        assert.equal(res.statusCode, 404);
        let response = JSON.parse(body);
        assert.isObject(response);
        assert.property(response, 'error');
        done();
      });
    });

    it('should return HTTP 400 with valid JSON and error response when trying to delete non-candidate compendium', (done) => {
      let req = createCompendiumPostRequest('./test/erc/metatainer', cookie_o2r);
      let compendium_id = null;

      request(req, (err, res, body) => {
        compendium_id = JSON.parse(body).id;
        publishCandidate(compendium_id, cookie_o2r, () => {

          j = request.jar();
          ck = request.cookie('connect.sid=' + cookie_o2r);
          j.setCookie(ck, global.test_host);

          request({
            uri: global.test_host + '/api/v1/compendium/' + compendium_id,
            method: 'DELETE',
            jar: j
          }, (err, res, body) => {
            assert.ifError(err);
            assert.equal(res.statusCode, 400);
            let response = JSON.parse(body);
            assert.isObject(response);
            assert.property(response, 'error');
            done();
          });
        });
      });
    }).timeout(30000);
  });

});



