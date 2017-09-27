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
const createCompendiumPostRequest = require('./util').createCompendiumPostRequest;
const fs = require('fs');
const mongojs = require('mongojs');
const chai = require('chai');
chai.use(require('chai-datetime'));

require("./setup")
const cookie_o2r = 's:C0LIrsxGtHOGHld8Nv2jedjL4evGgEHo.GMsWD5Vveq0vBt7/4rGeoH5Xx7Dd2pgZR9DvhKCyDTY';


describe('API compendium / jobs', () => {
    before((done) => {
        var db = mongojs('localhost/muncher', ['users', 'sessions', 'compendia', 'jobs']);
        db.compendia.drop(function (err, doc) {
            db.jobs.drop(function (err, doc) { done(); });
        });
    });

    describe('GET /api/v1/compendium/ sub-endpoint /jobs', () => {
        let compendium_id = '';
        before(function (done) {
            let req = createCompendiumPostRequest('./test/erc/step_image_execute', cookie_o2r);
            this.timeout(10000);

            request(req, (err, res, body) => {
                compendium_id = JSON.parse(body).id;
                done();
            });
        });

        let job_id;
        it('should respond with HTTP 404 and an error message when there is no job for an existing compendium', (done) => {
            request(global.test_host + '/api/v1/compendium/' + compendium_id + '/jobs', (err, res, body) => {
                assert.ifError(err);
                assert.equal(res.statusCode, 404);
                let response = JSON.parse(body);
                assert.notProperty(response, 'results');
                assert.property(response, 'error');
                assert.include(response.error, 'no job found for');
                done();
            });
        });
        it('should return job ID when starting job', (done) => {
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
        it('should respond with HTTP 200 and one job when one is started', (done) => {
            request(global.test_host + '/api/v1/compendium/' + compendium_id + '/jobs', (err, res, body) => {
                assert.ifError(err);
                assert.equal(res.statusCode, 200);
                assert.isDefined(JSON.parse(body).results, 'results returned');
                assert.include(JSON.parse(body).results, job_id, 'job id is in results');
                done();
            });
        });
        it('should respond with HTTP 404 and error message when that compendium does not exist', (done) => {
            request(global.test_host + '/api/v1/compendium/1234/jobs', (err, res, body) => {
                assert.ifError(err);
                assert.equal(res.statusCode, 404);
                assert.isUndefined(JSON.parse(body).result, 'returned no results');
                assert.propertyVal(JSON.parse(body), 'error', 'no compendium with this id');
                done();
            });
        });
    });
});