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
const fs = require('fs');
const config = require('../config/config');

require("./setup")
const cookie_o2r = 's:C0LIrsxGtHOGHld8Nv2jedjL4evGgEHo.GMsWD5Vveq0vBt7/4rGeoH5Xx7Dd2pgZR9DvhKCyDTY';
const cookie_plain = 's:yleQfdYnkh-sbj9Ez--_TWHVhXeXNEgq.qRmINNdkRuJ+iHGg5woRa9ydziuJ+DzFG9GnAZRvaaM';
const cookie_admin = 's:hJRjapOTVCEvlMYCb8BXovAOi2PEOC4i.IEPb0lmtGojn2cVk2edRuomIEanX6Ddz87egE5Pe8UM';
const createCompendiumPostRequest = require('./util').createCompendiumPostRequest;
const requestLoadingTimeout = 5000;


describe('Candidate handling after direct upload of', function () {
    describe('compendium', () => {
        let j = request.jar();
        let ck = request.cookie('connect.sid=' + cookie_o2r);
        j.setCookie(ck, global.test_host);
        let get = {
            method: 'GET',
            jar: j,
            uri: null
        };

        before(function (done) {
            createCompendiumPostRequest('./test/erc/with_metadata', cookie_o2r, 'compendium', (req) => {
                this.timeout(60000);
                req.timeout = 30000;

                request(req, (err, res, body) => {
                    assert.ifError(err);
                    let compendium_id = JSON.parse(body).id;
                    get.uri = global.test_host + '/api/v1/compendium/' + compendium_id;
                    done();
                });
            });
        });

        it('should give 401 with valid JSON and error message for unauthenticated user', (done) => {
            request(get.uri, (err, res, body) => {
                assert.ifError(err);
                assert.equal(res.statusCode, 401);
                let response = JSON.parse(body);
                assert.property(response, 'error');
                done();
            });
        }).timeout(requestLoadingTimeout);

        it('should give 401 with valid JSON and error message for authenticated but wrong user', (done) => {
            let j_plain = request.jar();
            let ck_plain = request.cookie('connect.sid=' + cookie_plain);
            j_plain.setCookie(ck_plain, global.test_host);
            let get_plain = {
                uri: get.uri,
                method: 'GET',
                jar: j_plain,
                timeout: requestLoadingTimeout
            };

            request(get_plain, (err, res, body) => {
                assert.ifError(err);
                assert.equal(res.statusCode, 401);
                let response = JSON.parse(body);
                assert.property(response, 'error');
                assert.include(JSON.stringify(response), 'not authorized');
                done();
            });
        }).timeout(requestLoadingTimeout);

        it('should give compendium metadata with a candidate field set to true for the uploading user', (done) => {
            request(get, (err, res, body) => {
                assert.ifError(err);
                let response = JSON.parse(body);
                assert.isDefined(response.candidate, 'returned candidate field');
                assert.propertyVal(response, 'candidate', true);
                done();
            });
        }).timeout(requestLoadingTimeout);
    });

    describe('Minimal workspace (script)', function () {
        let j = request.jar();
        let ck = request.cookie('connect.sid=' + cookie_o2r);
        j.setCookie(ck, global.test_host);
        let get = {
            method: 'GET',
            jar: j,
            uri: null
        };

        before(function (done) {
            createCompendiumPostRequest('./test/workspace/minimal-script', cookie_o2r, 'workspace', (req) => {
                this.timeout(60000);
                req.timeout = 30000;

                request(req, (err, res, body) => {
                    assert.ifError(err);
                    let compendium_id = JSON.parse(body).id;
                    get.uri = global.test_host + '/api/v1/compendium/' + compendium_id;
                    done();
                });
            });
        });

        it('should give 401 with valid JSON and error message for unauthenticated user', (done) => {
            request(get.uri, (err, res, body) => {
                assert.ifError(err);
                assert.equal(res.statusCode, 401);
                let response = JSON.parse(body);
                assert.property(response, 'error');
                assert.include(JSON.stringify(response), 'not authenticated');
                done();
            });
        }).timeout(requestLoadingTimeout);

        it('should give 401 with valid JSON and error message for authenticated but wrong user', (done) => {
            let j_plain = request.jar();
            let ck_plain = request.cookie('connect.sid=' + cookie_plain);
            j_plain.setCookie(ck_plain, global.test_host);
            let get_plain = {
                uri: get.uri,
                method: 'GET',
                jar: j_plain,
                timeout: requestLoadingTimeout
            };

            request(get_plain, (err, res, body) => {
                assert.ifError(err);
                assert.equal(res.statusCode, 401);
                let response = JSON.parse(body);
                assert.property(response, 'error');
                assert.include(JSON.stringify(response), 'not authorized');
                done();
            });
        }).timeout(requestLoadingTimeout);

        it('should give compendium metadata with a candidate field set to true for the uploading user', (done) => {
            request(get, (err, res, body) => {
                assert.ifError(err);
                let response = JSON.parse(body);
                assert.isDefined(response.candidate, 'returned candidate field');
                assert.propertyVal(response, 'candidate', true);
                done();
            });
        }).timeout(requestLoadingTimeout);


        it('should give compendium metadata with a candidate field set to true for admin user', (done) => {
            let j_admin = request.jar();
            let ck_admin = request.cookie('connect.sid=' + cookie_admin);
            j_admin.setCookie(ck_admin, global.test_host);
            let get_admin = {
                uri: get.uri,
                method: 'GET',
                jar: j_admin,
                timeout: requestLoadingTimeout
            };

            request(get_admin, (err, res, body) => {
                assert.ifError(err);
                let response = JSON.parse(body);
                assert.isDefined(response.candidate, 'returned candidate field');
                assert.propertyVal(response, 'candidate', true);
                done();
            });
        }).timeout(requestLoadingTimeout);
    });

    describe('Minimal workspace (rmd)', function () {
        let j = request.jar();
        let ck = request.cookie('connect.sid=' + cookie_o2r);
        j.setCookie(ck, global.test_host);
        let get = {
            method: 'GET',
            jar: j,
            uri: null
        };

        before(function (done) {
            createCompendiumPostRequest('./test/workspace/minimal-rmd', cookie_o2r, 'workspace', (req) => {
                this.timeout(60000);
                req.timeout = 30000;

                request(req, (err, res, body) => {
                    assert.ifError(err);
                    let compendium_id = JSON.parse(body).id;
                    get.uri = global.test_host + '/api/v1/compendium/' + compendium_id;
                    done();
                });
            });
        });
        it('should give 401 with valid JSON and error message for unauthenticated user', (done) => {
            request(get.uri, (err, res, body) => {
                assert.ifError(err);
                assert.equal(res.statusCode, 401);
                let response = JSON.parse(body);
                assert.property(response, 'error');
                assert.include(JSON.stringify(response), 'not authenticated');
                done();
            });
        }).timeout(requestLoadingTimeout);

        it('should give 401 with valid JSON and error message for authenticated but wrong user', (done) => {
            let j_plain = request.jar();
            let ck_plain = request.cookie('connect.sid=' + cookie_plain);
            j_plain.setCookie(ck_plain, global.test_host);
            let get_plain = {
                uri: get.uri,
                method: 'GET',
                jar: j_plain,
                timeout: requestLoadingTimeout
            };

            request(get_plain, (err, res, body) => {
                assert.ifError(err);
                assert.equal(res.statusCode, 401);
                let response = JSON.parse(body);
                assert.property(response, 'error');
                assert.include(JSON.stringify(response), 'not authorized');
                done();
            });
        }).timeout(requestLoadingTimeout);

        it('should give compendium metadata with a candidate field set to true for the uploading user', (done) => {
            request(get, (err, res, body) => {
                assert.ifError(err);
                let response = JSON.parse(body);
                assert.isDefined(response.candidate, 'returned candidate field');
                assert.propertyVal(response, 'candidate', true);
                done();
            });
        }).timeout(requestLoadingTimeout);


        it('should give compendium metadata with a candidate field set to true for admin user', (done) => {
            let j_admin = request.jar();
            let ck_admin = request.cookie('connect.sid=' + cookie_admin);
            j_admin.setCookie(ck_admin, global.test_host);
            let get_admin = {
                uri: get.uri,
                method: 'GET',
                jar: j_admin,
                timeout: requestLoadingTimeout
            };

            request(get_admin, (err, res, body) => {
                assert.ifError(err);
                let response = JSON.parse(body);
                assert.isDefined(response.candidate, 'returned candidate field');
                assert.propertyVal(response, 'candidate', true);
                done();
            });
        }).timeout(requestLoadingTimeout);
    });
});
