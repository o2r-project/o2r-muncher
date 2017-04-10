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
const host = 'http://localhost:' + config.net.port;
const mongojs = require('mongojs');
const sleep = require('sleep');

require("./setup")
const cookie_o2r = 's:C0LIrsxGtHOGHld8Nv2jedjL4evGgEHo.GMsWD5Vveq0vBt7/4rGeoH5Xx7Dd2pgZR9DvhKCyDTY';
const cookie_plain = 's:yleQfdYnkh-sbj9Ez--_TWHVhXeXNEgq.qRmINNdkRuJ+iHGg5woRa9ydziuJ+DzFG9GnAZRvaaM';
const cookie_uploader = 's:lTKjca4OEmnahaQIuIdV6tfHq4mVf7mO.0iapdV1c85wc5NO3d3h+svorp3Tm56cfqRhhpFJZBnk';
const waitSecs = 5;


describe('API job fields', () => {
  before((done) => {
    var db = mongojs('localhost/muncher', ['users', 'sessions', 'compendia', 'jobs']);
    db.compendia.drop(function (err, doc) {
      db.jobs.drop(function (err, doc) { done(); });
    });
  });

  describe('job filtering with compendium_id, status and user', () => {
    let compendium_id = '';
    // upload 1st compendium with final job status "success"
    before((done) => {
      let req = createCompendiumPostRequest('./test/bagtainers/step_image_execute', cookie_o2r);

      request(req, (err, res, body) => {
        compendium_id = JSON.parse(body).id;
        done();
      });
    });

    let job_id = '';
    it('should return job ID when starting job execution', (done) => {
      let j = request.jar();
      let ck = request.cookie('connect.sid=' + cookie_o2r);
      j.setCookie(ck, host);

      request({
        uri: host + '/api/v1/job',
        method: 'POST',
        jar: j,
        formData: {
          compendium_id: compendium_id
        },
        timeout: 5000
      }, (err, res, body) => {
        assert.ifError(err);
        assert.equal(res.statusCode, 200);
        let response = JSON.parse(body);
        assert.property(response, 'job_id');
        job_id = response.job_id;
        done();
      });
    }).timeout(10000);

    it('should list the status of a job', (done) => {
      request(host + '/api/v1/job/?fields=status', (err, res, body) => {
        assert.ifError(err);
        assert.equal(res.statusCode, 200);
        let response = JSON.parse(body);
        assert.isArray(response.results);
        assert.property(response.results[0], 'status');
        assert.property(response.results[0], 'id');
        done();
      });
    });

    it('should return no field "foo"', (done) => {
      request(host + '/api/v1/job/?fields=foo', (err, res, body) => {
        assert.ifError(err);
        assert.equal(res.statusCode, 200);
        let response = JSON.parse(body);
        assert.isArray(response.results);
        assert.notProperty(response.results[0], 'status');
        done();
      });
    });
  });

});