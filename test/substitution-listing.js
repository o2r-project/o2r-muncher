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
const mongojs = require('mongojs');

require("./setup")
const cookie_o2r = 's:C0LIrsxGtHOGHld8Nv2jedjL4evGgEHo.GMsWD5Vveq0vBt7/4rGeoH5Xx7Dd2pgZR9DvhKCyDTY';
const uploadCompendium = require('./util').uploadCompendium;
const createSubstitutionPostRequest = require('./util').createSubstitutionPostRequest;
const publishCandidate = require('./util').publishCandidate;

describe.skip('Substitution listing', function () {
    var db = mongojs('localhost/muncher', ['compendia']);

    before(function (done) {
        db.compendia.drop(function (err, doc) {
            done();
        });
    });

    after(function (done) {
        db.close();
        done();
    });

    describe('Empty service', function () {
        it('should respond with HTTP 200 OK and an empty response list', (done) => {
            request(global.test_host + '/api/v1/substitution', (err, res, body) => {
                assert.ifError(err);
                assert.equal(res.statusCode, 200);
                response = JSON.parse(body);
                assert.notProperty(response, 'error');
                assert.property(response, 'results');
                assert.lengthOf(response.results, 0);
                done();
            });
        });
    });

    describe('With substitution', function () {
        var substitution_id;

        before(function (done) {
            this.timeout(60000);

            let req_erc_base02 = uploadCompendium('./test/erc/base', cookie_o2r);
            let req_erc_overlay02 = uploadCompendium('./test/erc/overlay', cookie_o2r);
            var base_id;
            var overlay_id;
            let base_file = "data/BerlinMit.csv";
            let overlay_file = "data/BerlinOhne.csv";
            var metadataHandling = "keepBase";

            // first upload
            request(req_erc_base02, (err, res, body) => {
                assert.ifError(err);
                base_id = JSON.parse(body).id;

                publishCandidate(base_id, cookie_o2r, (err) => {
                    assert.ifError(err);

                    // second upload
                    request(req_erc_overlay02, (err, res, body) => {
                        assert.ifError(err);
                        overlay_id = JSON.parse(body).id;

                        publishCandidate(overlay_id, cookie_o2r, (err) => {
                            assert.ifError(err);

                            // substitution
                            let req_substitution = createSubstitutionPostRequest(base_id, overlay_id, base_file, overlay_file, metadataHandling, cookie_o2r);
                            request(req_substitution, (err, res, body) => {
                                assert.ifError(err);
                                substitution_id = body.id;
                                done();
                            });
                        });
                    });
                });
            });
        })

        it('should respond with HTTP 200 OK for listing substitution IDs', (done) => {
            request(global.test_host + '/api/v1/substitution', (err, res, body) => {
                assert.ifError(err);
                assert.equal(res.statusCode, 200);
                done();
            });
        });

        it('should respond with valid JSON document without error and the substitution ID', (done) => {
            request(global.test_host + '/api/v1/substitution', (err, res, body) => {
                assert.ifError(err);
                let response = JSON.parse(body);
                assert.isObject(response);
                assert.notProperty(response, 'error');
                assert.property(response, 'results');

                assert.isArray(response.results);
                assert.equal(response.results.length, 1);
                assert.include(response.results, substitution_id);
                done();
            });
        });
    });

});
