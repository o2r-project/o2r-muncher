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
const sleep = require('sleep');

require("./setup");
const cookie_o2r = 's:C0LIrsxGtHOGHld8Nv2jedjL4evGgEHo.GMsWD5Vveq0vBt7/4rGeoH5Xx7Dd2pgZR9DvhKCyDTY';
const cookie_plain = 's:yleQfdYnkh-sbj9Ez--_TWHVhXeXNEgq.qRmINNdkRuJ+iHGg5woRa9ydziuJ+DzFG9GnAZRvaaM';
const cookie_uploader = 's:lTKjca4OEmnahaQIuIdV6tfHq4mVf7mO.0iapdV1c85wc5NO3d3h+svorp3Tm56cfqRhhpFJZBnk';


describe('returned fields in job listing', () => {
  before(function (done) {
    var db = mongojs('localhost/muncher', ['users', 'sessions', 'compendia', 'jobs']);
    db.compendia.drop(function (err, doc) {
      db.jobs.drop(function (err, doc) {
        db.close();
        done();
      });
    });
  });

  describe('status and user fields', () => {
    let job_id = '';

    // upload 1st compendium with final job status "success"
    before(function (done) {
      let req = createCompendiumPostRequest('./test/erc/step_image_execute', cookie_o2r);
      this.timeout(60000);

      request(req, (err, res, body) => {
        assert.equal(res.statusCode, 200);
        assert.property(JSON.parse(body), 'id');
        let compendium_id = JSON.parse(body).id;

        publishCandidate(compendium_id, cookie_o2r, () => {
          let j = request.jar();
          let ck = request.cookie('connect.sid=' + cookie_o2r);
          j.setCookie(ck, global.test_host);

          request({
            uri: global.test_host + '/api/v1/job',
            method: 'POST',
            jar: j,
            formData: {
              compendium_id: compendium_id
            },
            timeout: 10000
          }, (err, res, body) => {
            assert.ifError(err);
            let response = JSON.parse(body);

            assert.equal(res.statusCode, 200);
            assert.property(response, 'job_id');
            job_id = response.job_id;

            sleep.sleep(15); // wait for the job to finish
            done();
          });
        });
      });

      it('should show the status of a job in the list view', (done) => {
        request(global.test_host + '/api/v1/job/?fields=status', (err, res, body) => {
          assert.ifError(err);
          let response = JSON.parse(body);
          assert.equal(res.statusCode, 200);
          assert.isArray(response.results);
          assert.property(response.results[0], 'id');
          assert.property(response.results[0], 'status');
          assert.notProperty(response.results[0], 'user');
          assert.propertyVal(response.results[0], 'status', 'success');
          done();
        });
      }).timeout(5000);

      it('should show the user of a job in the list view', (done) => {
        request(global.test_host + '/api/v1/job/?fields=user', (err, res, body) => {
          assert.ifError(err);
          let response = JSON.parse(body);
          assert.equal(res.statusCode, 200);
          assert.isArray(response.results);
          assert.property(response.results[0], 'id');
          assert.property(response.results[0], 'user');
          assert.propertyVal(response.results[0], 'status', 'success');
          done();
        });
      }).timeout(5000);

      it('should show both user and status of a job in the list view', (done) => {
        request(global.test_host + '/api/v1/job/?fields=user,status', (err, res, body) => {
          assert.ifError(err);
          let response = JSON.parse(body);
          assert.equal(res.statusCode, 200);
          assert.isArray(response.results);
          assert.property(response.results[0], 'id');
          assert.property(response.results[0], 'user');
          assert.property(response.results[0], 'status');
          assert.propertyVal(response.results[0], 'status', 'success');
          done();
        });
      }).timeout(5000);

      it('should show both status and user of a job in the list view', (done) => {
        request(global.test_host + '/api/v1/job/?fields=status,user', (err, res, body) => {
          assert.ifError(err);
          let response = JSON.parse(body);
          assert.equal(res.statusCode, 200);
          assert.isArray(response.results);
          assert.property(response.results[0], 'id');
          assert.property(response.results[0], 'status');
          assert.property(response.results[0], 'user');
          assert.propertyVal(response.results[0], 'status', 'success');
          done();
        });
      }).timeout(5000);
    });

    it('should handle spaces in the fields list', (done) => {
      request(global.test_host + '/api/v1/job/?fields= status , user', (err, res, body) => {
        assert.ifError(err);
        let response = JSON.parse(body);
        assert.equal(res.statusCode, 200);
        assert.isArray(response.results);
        assert.property(response.results[0], 'id');
        assert.property(response.results[0], 'status');
        assert.property(response.results[0], 'user');
        assert.propertyVal(response.results[0], 'status', 'success');
        done();
      });
    }).timeout(5000);
  });

  describe('unsupported field requests', () => {
    it('should return error when asking for an unsupported field "foo"', (done) => {
      request(global.test_host + '/api/v1/job/?fields=foo', (err, res, body) => {
        assert.ifError(err);
        assert.equal(res.statusCode, 400);
        let response = JSON.parse(body);
        assert.property(response, 'error');
        assert.notProperty(response, 'results');
        done();
      });
    });

    it('should ignore empty fields filter', (done) => {
      request(global.test_host + '/api/v1/job/?fields=', (err, res, body) => {
        assert.ifError(err);
        assert.equal(res.statusCode, 200);
        let response = JSON.parse(body);
        assert.notProperty(response, 'error');
        assert.property(response, 'results');
        assert.property(response.results[0], 'id');
        assert.notProperty(response.results[0], 'user');
        assert.notProperty(response.results[0], 'status');
        done();
      });
    });

    it('should ignore empty list in fields filter', (done) => {
      request(global.test_host + '/api/v1/job/?fields=, ,', (err, res, body) => {
        assert.ifError(err);
        assert.equal(res.statusCode, 200);
        let response = JSON.parse(body);
        assert.notProperty(response, 'error');
        assert.property(response, 'results');
        assert.property(response.results[0], 'id');
        assert.notProperty(response.results[0], 'user');
        assert.notProperty(response.results[0], 'status');
        done();
      });
    });
  });

});