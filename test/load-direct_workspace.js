/*
 * (C) Copyright 2017 o2r project.
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
const requestLoadingTimeout = 20000;
const createCompendiumPostRequest = require('./util').createCompendiumPostRequest;


describe('Direct upload of minimal workspace (script) without basedir', function () {
    var compendium_id = null;

    before(function (done) {
        this.timeout(requestLoadingTimeout);
        createCompendiumPostRequest('./test/workspace/minimal-script', cookie_o2r, 'workspace', (req) => {
            req.timeout = requestLoadingTimeout;
            request(req, (err, res, body) => {
                assert.ifError(err);
                compendium_id = JSON.parse(body).id;
                done();
            });
        });
    });

    describe('Create compendium', () => {
        it('should respond with HTTP 200 OK and valid JSON', (done) => {
            request(global.test_host + '/api/v1/compendium', (err, res, body) => {
                createCompendiumPostRequest('./test/workspace/minimal-script', cookie_o2r, 'workspace', (req) => {

                    request(req, (err, res, body) => {
                        assert.ifError(err);
                        assert.equal(res.statusCode, 200);
                        assert.isObject(JSON.parse(body), 'returned JSON');
                        done();
                    });
                });
            });
        }).timeout(requestLoadingTimeout);

        it('should give a response including the id field', (done) => {
            request(global.test_host + '/api/v1/compendium', (err, res, body) => {
                createCompendiumPostRequest('./test/workspace/minimal-script', cookie_o2r, 'workspace', (req) => {

                    request(req, (err, res, body) => {
                        assert.ifError(err);
                        let response = JSON.parse(body);
                        assert.isDefined(response.id, 'returned id');
                        assert.property(response, 'id');
                        done();
                    });
                });
            });
        }).timeout(requestLoadingTimeout);
    });

    describe('metadata brokering after loading without publishing', function () {
        it('should have detected the correct main and display file candidates', (done) => {
            let j = request.jar();
            let ck = request.cookie('connect.sid=' + cookie_o2r);
            j.setCookie(ck, global.test_host);
            let get = {
                uri: global.test_host + '/api/v1/compendium/' + compendium_id,
                method: 'GET',
                jar: j
            };

            request(get, (err, res, body) => {
                assert.ifError(err);
                let response = JSON.parse(body);
                assert.property(response, 'metadata');
                assert.property(response.metadata, 'o2r');
                assert.propertyVal(response.metadata.o2r, 'mainfile', 'main.R');
                assert.include(response.metadata.o2r.displayfile_candidates, 'display.png');
                assert.propertyVal(response.metadata.o2r, 'displayfile', 'display.png');
                done();
            });
        });
    });
});

describe('Direct upload of minimal workspace (script) _with_ basedir', function () {
    describe('Create compendium', () => {
        it('should respond with HTTP 200 OK and valid JSON', (done) => {
            request(global.test_host + '/api/v1/compendium', (err, res, body) => {
                createCompendiumPostRequest('./test/workspace/minimal-script-basedir', cookie_o2r, 'workspace', (req) => {

                    request(req, (err, res, body) => {
                        assert.ifError(err);
                        assert.equal(res.statusCode, 200);
                        assert.isObject(JSON.parse(body), 'returned JSON');
                        done();
                    });
                });
            });
        }).timeout(requestLoadingTimeout);

        it('should give a response including the id field', (done) => {
            request(global.test_host + '/api/v1/compendium', (err, res, body) => {
                createCompendiumPostRequest('./test/workspace/minimal-script-basedir', cookie_o2r, 'workspace', (req) => {

                    request(req, (err, res, body) => {
                        assert.ifError(err);
                        let response = JSON.parse(body);
                        assert.isDefined(response.id, 'returned id');
                        assert.property(response, 'id');
                        done();
                    });
                });
            });
        }).timeout(requestLoadingTimeout);

        it('should contain the correct values for properties compendium and bag', (done) => {
            request(global.test_host + '/api/v1/compendium', (err, res, body) => {
                createCompendiumPostRequest('./test/workspace/minimal-script-basedir', cookie_o2r, 'workspace', (req) => {
                    this.timeout(requestLoadingTimeout);

                    request(req, (err, res, body) => {
                        assert.ifError(err);
                        let compendium_id = JSON.parse(body).id;

                        let j = request.jar();
                        let ck = request.cookie('connect.sid=' + cookie_o2r);
                        j.setCookie(ck, global.test_host);
                        let get = {
                            uri: global.test_host + '/api/v1/compendium/' + compendium_id,
                            method: 'GET',
                            jar: j,
                            timeout: requestLoadingTimeout
                        };

                        request(get, (err, res, body) => {
                            assert.ifError(err);
                            let response = JSON.parse(body);
                            assert.property(response, 'bag');
                            assert.propertyVal(response, 'bag', false);
                            assert.property(response, 'compendium');
                            assert.propertyVal(response, 'compendium', false);
                            done();
                        });
                    });
                });
            });
        }).timeout(requestLoadingTimeout);
    });
});

describe('Direct upload of minimal workspace (script) as bag', function () {
    describe('Create compendium', () => {
        it('should respond with HTTP 200 OK and valid JSON', (done) => {
            request(global.test_host + '/api/v1/compendium', (err, res, body) => {
                createCompendiumPostRequest('./test/workspace/minimal-script-bag', cookie_o2r, 'workspace', (req) => {

                    request(req, (err, res, body) => {
                        assert.ifError(err);
                        assert.equal(res.statusCode, 200);
                        assert.isObject(JSON.parse(body), 'returned JSON');
                        done();
                    });
                });
            });
        }).timeout(requestLoadingTimeout * 2);

        it('should contain the correct values for properties compendium and bag', (done) => {
            request(global.test_host + '/api/v1/compendium', (err, res, body) => {
                createCompendiumPostRequest('./test/workspace/minimal-script-bag', cookie_o2r, 'workspace', (req) => {
                    this.timeout(requestLoadingTimeout);

                    request(req, (err, res, body) => {
                        assert.ifError(err);
                        let compendium_id = JSON.parse(body).id;

                        let j = request.jar();
                        let ck = request.cookie('connect.sid=' + cookie_o2r);
                        j.setCookie(ck, global.test_host);
                        let get = {
                            uri: global.test_host + '/api/v1/compendium/' + compendium_id,
                            method: 'GET',
                            jar: j
                        };

                        request(get, (err, res, body) => {
                            assert.ifError(err);
                            let response = JSON.parse(body);
                            assert.property(response, 'bag');
                            assert.propertyVal(response, 'bag', true);
                            assert.property(response, 'compendium');
                            assert.propertyVal(response, 'compendium', false);
                            done();
                        });
                    });
                });
            });
        }).timeout(requestLoadingTimeout * 2);
    });
});

describe('Direct upload of minimal workspace (rmd)', function () {
    describe('Create compendium', () => {
        it('should respond with HTTP 200 OK and valid JSON, including the ID field', (done) => {
            request(global.test_host + '/api/v1/compendium', (err, res, body) => {
                createCompendiumPostRequest('./test/workspace/minimal-rmd', cookie_o2r, 'workspace', (req) => {

                    request(req, (err, res, body) => {
                        assert.ifError(err);
                        assert.equal(res.statusCode, 200);
                        let response = JSON.parse(body);
                        assert.isObject(response, 'returned JSON');
                        assert.property(response, 'id');
                        done();
                    });
                });
            });
        }).timeout(requestLoadingTimeout * 2);
    });

    describe('Metadata brokering result after compendium creation', () => {
        let compendium_id = '';

        let j = request.jar();
        let ck = request.cookie('connect.sid=' + cookie_o2r);
        j.setCookie(ck, global.test_host);
        let get = {
            method: 'GET',
            jar: j,
            timeout: 10000
        };

        before(function (done) {
            request(global.test_host + '/api/v1/compendium', (err, res, body) => {
                this.timeout(requestLoadingTimeout);
                createCompendiumPostRequest('./test/workspace/minimal-rmd', cookie_o2r, 'workspace', (req) => {

                    request(req, (err, res, body) => {
                        assert.ifError(err);
                        assert.equal(res.statusCode, 200);
                        let response = JSON.parse(body);
                        compendium_id = response.id;
                        get.uri = global.test_host + '/api/v1/compendium/' + compendium_id;
                        done();
                    });
                });
            });
        });

        it('should have the extracted metadata from the header in the compendium main file', (done) => {
            request(get, (err, res, body) => {
                assert.ifError(err);
                let response = JSON.parse(body);

                assert.propertyVal(response.metadata.o2r, 'title', 'Capacity of container ships in seaborne trade from 1980 to 2016 (in million dwt)*');
                assert.propertyVal(response.metadata.o2r, 'description', 'Capacity of container ships in seaborne trade of the world container ship fleet.\n');

                done();
            });
        });

        it('should have detected the correct main and display file', (done) => {
            request(get, (err, res, body) => {
                assert.ifError(err);
                let response = JSON.parse(body);

                assert.propertyVal(response.metadata.o2r, 'mainfile', 'main.Rmd');
                assert.propertyVal(response.metadata.o2r, 'displayfile', 'display.html');

                done();
            });
        });
    });

    describe('Create compendium with different content types', () => {
        it('should respond with HTTP 400 with valid JSON and error message when using no content_type', (done) => {
            request(global.test_host + '/api/v1/compendium', (err, res, body) => {
                createCompendiumPostRequest('./test/workspace/minimal-rmd', cookie_o2r, 'workspace', (req) => {
                    delete req.formData.content_type;

                    request(req, (err, res, body) => {
                        assert.ifError(err);
                        assert.equal(res.statusCode, 400);
                        let response = JSON.parse(body);
                        assert.isObject(response, 'returned JSON');
                        assert.property(response, 'error');
                        assert.include(response.error, "content_type \"undefined\"");
                        done();
                    });
                });
            });
        }).timeout(requestLoadingTimeout);

        it('should respond with HTTP 400 with valid JSON and error message when using empty string as content type', (done) => {
            request(global.test_host + '/api/v1/compendium', (err, res, body) => {
                createCompendiumPostRequest('./test/workspace/minimal-rmd', cookie_o2r, 'workspace', (req) => {
                    req.formData.content_type = "";

                    request(req, (err, res, body) => {
                        assert.ifError(err);
                        assert.equal(res.statusCode, 400);
                        let response = JSON.parse(body);
                        assert.isObject(response, 'returned JSON');
                        assert.property(response, 'error');
                        assert.include(response.error, "content_type \"\"");
                        done();
                    });
                });
            });
        }).timeout(requestLoadingTimeout);

        it('should respond with HTTP 400 with valid JSON and error message (including the used string) when using some random string as content type', (done) => {
            request(global.test_host + '/api/v1/compendium', (err, res, body) => {
                let teststring = 'testnonexist';
                createCompendiumPostRequest('./test/workspace/minimal-rmd', cookie_o2r, 'workspace', (req) => {
                    req.formData.content_type = teststring;

                    request(req, (err, res, body) => {
                        assert.ifError(err);
                        assert.equal(res.statusCode, 400);
                        let response = JSON.parse(body);
                        assert.isObject(response, 'returned JSON');
                        assert.property(response, 'error');
                        assert.include(JSON.stringify(response), teststring);
                        done();
                    });
                });
            });
        }).timeout(requestLoadingTimeout);

        it('should respond with HTTP 400 with valid JSON and error message when using content_type "compendium"', (done) => {
            request(global.test_host + '/api/v1/compendium', (err, res, body) => {
                createCompendiumPostRequest('./test/workspace/minimal-rmd', cookie_o2r, 'workspace', (req) => {

                    request(req, (err, res, body) => {
                        assert.ifError(err);
                        assert.equal(res.statusCode, 400);
                        let response = JSON.parse(body);
                        assert.isObject(response, 'returned JSON');
                        assert.property(response, 'error');
                        done();
                    });
                });
            });
        }).timeout(requestLoadingTimeout);
    });
});

describe('Direct upload of minimal workspace (rmd) with data file', function () {
    describe('Create compendium', () => {
        let compendium_id = '';

        let j = request.jar();
        let ck = request.cookie('connect.sid=' + cookie_o2r);
        j.setCookie(ck, global.test_host);
        let get = {
            method: 'GET',
            jar: j,
            timeout: 10000
        };

        before(function (done) {
            request(global.test_host + '/api/v1/compendium', (err, res, body) => {
                this.timeout(requestLoadingTimeout);
                createCompendiumPostRequest('./test/workspace/minimal-rmd-data', cookie_o2r, 'workspace', (req) => {

                    request(req, (err, res, body) => {
                        assert.ifError(err);
                        assert.equal(res.statusCode, 200);
                        let response = JSON.parse(body);
                        compendium_id = response.id;
                        get.uri = global.test_host + '/api/v1/compendium/' + compendium_id;
                        done();
                    });
                });
            });
        });

        it('should list the data file along with three other files/directories', (done) => {
            let j = request.jar();
            let ck = request.cookie('connect.sid=' + cookie_o2r);
            j.setCookie(ck, global.test_host);
            let get = {
                uri: global.test_host + '/api/v1/compendium/' + compendium_id,
                method: 'GET',
                jar: j,
                timeout: 10000
            };

            request(get, (err, res, body) => {
                assert.ifError(err);
                let response = JSON.parse(body);
                assert.lengthOf(response.files.children, 4); // .erc, data.csv, display.html, main.Rmd
                assert.include(JSON.stringify(response.files.children), compendium_id + '/data/data.csv');
                done();
            });
        });
    });

});