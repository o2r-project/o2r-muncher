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
const config = require('../config/config');
const mongojs = require('mongojs');
const fs = require('fs-extra');
const env = process.env;
const path = require('path');
const exec = require('child_process').exec;

require("./setup");
const cookie = 's:C0LIrsxGtHOGHld8Nv2jedjL4evGgEHo.GMsWD5Vveq0vBt7/4rGeoH5Xx7Dd2pgZR9DvhKCyDTY';
const cookie_plain = 's:yleQfdYnkh-sbj9Ez--_TWHVhXeXNEgq.qRmINNdkRuJ+iHGg5woRa9ydziuJ+DzFG9GnAZRvaaM';
const requestLoadingTimeout = 30000;

describe('Sciebo loader with compendia', function () {
    var db = mongojs('localhost/muncher', ['compendia']);

    beforeEach(function(done) {
        // 1. Delete database compendium collection
        if(env.TRAVIS === "true") {
            db.compendia.drop(function (err, doc) {
                // 2. Delete compendium files
                let cmd = 'docker exec testloader rm -rf ' + path.join(config.fs.compendium, '*');
                exec(cmd, (error, stdout, stderr) => {
                    if (error || stderr) {
                        assert.ifError(error);
                    } else {
                        done();
                    }
                });
            });
        } else {
            db.compendia.drop(function (err, doc) {
                // 2. Delete compendium files
                fs.emptyDir(config.fs.compendium, err => {
                    if (err) assert.ifError(err);
                    done();
                });
            });
        }
    });

    after(function (done) {
        db.close();
        done();
    });

    let compendium_id = '';

    describe('create new compendium based on public WebDAV share with bagit.txt', () => {
        it('should respond with the compendium ID specified in erc.yml', (done) => {
            let form = {
                share_url: 'https://uni-muenster.sciebo.de/index.php/s/7Y7U4HC8GzJr5b9',
                content_type: 'compendium'
            };

            let j = request.jar();
            let ck = request.cookie('connect.sid=' + cookie);
            j.setCookie(ck, global.test_host);

            request({
                uri: global.test_host + '/api/v1/compendium',
                method: 'POST',
                jar: j,
                json: form,
                timeout: requestLoadingTimeout
            }, (err, res, body) => {
                assert.ifError(err);
                assert.equal(res.statusCode, 200);
                assert.isObject(body, 'returned JSON');
                assert.isDefined(body.id, 'returned id');
                assert.equal(body.id, '6afbdbc29965');
                done();
            });
        }).timeout(20000);

        it('should download the files in the share and make them available via API', (done) => {
            let form = {
                share_url: 'https://uni-muenster.sciebo.de/index.php/s/7Y7U4HC8GzJr5b9',
                content_type: 'compendium'
            };

            let j = request.jar();
            let ck = request.cookie('connect.sid=' + cookie);
            j.setCookie(ck, global.test_host);

            request({
                uri: global.test_host + '/api/v1/compendium',
                method: 'POST',
                jar: j,
                json: form,
                timeout: requestLoadingTimeout
            }, (err, res, body) => {
                assert.ifError(err);
                let compendium_id = body.id;

                request({
                    uri: global.test_host + '/api/v1/compendium/' + compendium_id,
                    method: 'GET',
                    jar: j,
                    json: form,
                    timeout: requestLoadingTimeout
                }, (err, res, body) => {
                    assert.ifError(err);
                    assert.equal(res.statusCode, 200);
                    let response = body;

                    assert.include(JSON.stringify(response), 'data/data/test2.Rmd');
                    assert.include(JSON.stringify(response), 'data/data/test.txt');
                    assert.include(JSON.stringify(response), 'data/data/erc.yml');

                    done();
                });
            });
        }).timeout(20000);
    });

    describe('create new compendium based on public WebDAV share with one zip file', () => {
        it('should respond with a compendium ID', (done) => {
            let form = {
                share_url: 'https://uni-muenster.sciebo.de/index.php/s/oAyW77dQ1KQi1ka',
                path: '/',
                content_type: 'compendium'
            };

            let j = request.jar();
            let ck = request.cookie('connect.sid=' + cookie);
            j.setCookie(ck, global.test_host);

            request({
                uri: global.test_host + '/api/v1/compendium',
                method: 'POST',
                jar: j,
                json: form,
                timeout: requestLoadingTimeout
            }, (err, res, body) => {
                assert.ifError(err);
                assert.equal(res.statusCode, 200);
                assert.isObject(body, 'returned JSON');
                assert.isDefined(body.id, 'returned id');
                compendium_id = body.id;
                done();
            });
        }).timeout(20000);

        it('should download the files in the share and make them available via API', (done) => {
            let form = {
                share_url: 'https://uni-muenster.sciebo.de/index.php/s/oAyW77dQ1KQi1ka',
                content_type: 'compendium'
            };

            let j = request.jar();
            let ck = request.cookie('connect.sid=' + cookie);
            j.setCookie(ck, global.test_host);

            request({
                uri: global.test_host + '/api/v1/compendium',
                method: 'POST',
                jar: j,
                json: form,
                timeout: requestLoadingTimeout
            }, (err, res, body) => {
                assert.ifError(err);
                let compendium_id = body.id;

                request({
                    uri: global.test_host + '/api/v1/compendium/' + compendium_id,
                    method: 'GET',
                    jar: j,
                    timeout: requestLoadingTimeout
                }, (err, res, body) => {
                    assert.ifError(err);
                    assert.equal(res.statusCode, 200);
                    let response = body;

                    assert.include(JSON.stringify(response), 'data/document.html');
                    assert.include(JSON.stringify(response), 'data/document.Rmd');
                    assert.include(JSON.stringify(response), 'data/document.tex');

                    done();
                });
            });
        }).timeout(20000);
    });

    describe.skip('create new compendium based on specific zip file in public WebDAV share with multiple zip files', () => {
        it('should respond with a compendium ID', (done) => {
            let form = {
                share_url: 'https://uni-muenster.sciebo.de/s/w9Ste65jjStVlI4',
                path: '/newtainer2.zip',
                content_type: 'compendium'
            };

            let j = request.jar();
            let ck = request.cookie('connect.sid=' + cookie);
            j.setCookie(ck, global.test_host);

            request({
                uri: global.test_host + '/api/v1/compendium',
                method: 'POST',
                jar: j,
                json: form,
                timeout: requestLoadingTimeout
            }, (err, res, body) => {
                assert.ifError(err);
                assert.equal(res.statusCode, 200);
                assert.isObject(body, 'returned JSON');
                assert.isDefined(body.id, 'returned id');
                compendium_id = body.id;
                done();
            });
        }).timeout(20000);

        it('should download the files in the share and make them available via API', (done) => {
            let form = {
                share_url: 'https://uni-muenster.sciebo.de/s/w9Ste65jjStVlI4',
                path: '/newtainer2.zip',
                content_type: 'compendium'
            };

            let j = request.jar();
            let ck = request.cookie('connect.sid=' + cookie);
            j.setCookie(ck, global.test_host);

            request({
                uri: global.test_host + '/api/v1/compendium',
                method: 'POST',
                jar: j,
                json: form,
                timeout: requestLoadingTimeout
            }, (err, res, body) => {
                assert.ifError(err);
                let compendium_id = body.id;

                request({
                    uri: global.test_host + '/api/v1/compendium/' + compendium_id,
                    method: 'GET',
                    jar: j,
                    json: form,
                    timeout: requestLoadingTimeout
                }, (err, res, body) => {
                    assert.ifError(err);
                    assert.equal(res.statusCode, 200);
                    let response = body;

                    assert.include(JSON.stringify(response), 'data/data/document.Rmd');
                    assert.include(JSON.stringify(response), 'data/data/document.tex');
                    assert.include(JSON.stringify(response), 'data/data/erc.yml');

                    done();
                });
            });
        }).timeout(20000);
    });
});

describe('Sciebo loader with invalid requests', () => {
    describe('load from public share with single directory', () => {
        it('should throw an error and notify that the directory has no bag for content_type compendium', (done) => {
            let form = {
                share_url: 'https://uni-muenster.sciebo.de/index.php/s/96XJFrmd3cSYGko',
                path: '/',
                content_type: 'compendium',
            };

            let j = request.jar();
            let ck = request.cookie('connect.sid=' + cookie);
            j.setCookie(ck, global.test_host);

            request({
                uri: global.test_host + '/api/v1/compendium',
                method: 'POST',
                jar: j,
                json: form,
                timeout: requestLoadingTimeout
            }, (err, res, body) => {
                assert.ifError(err);
                assert.equal(res.statusCode, 400);
                assert.isUndefined(body.id, 'returned no id');
                assert.propertyVal(body, 'error', 'load from share failed: bagit not found but content type is compendium');
                done();
            });
        }).timeout(10000);
    });

    describe('load from public share with multiple directories', () => {
        it('should throw an error for content_type "compendium"', (done) => {
            let form = {
                share_url: 'https://uni-muenster.sciebo.de/index.php/s/UkQtsyOfYLDQVr1',
                path: '/testdir',
                content_type: 'compendium',
            };

            let j = request.jar();
            let ck = request.cookie('connect.sid=' + cookie);
            j.setCookie(ck, global.test_host);

            request({
                uri: global.test_host + '/api/v1/compendium',
                method: 'POST',
                jar: j,
                json: form,
                timeout: requestLoadingTimeout
            }, (err, res, body) => {
                assert.ifError(err);
                assert.equal(res.statusCode, 400);
                assert.isUndefined(body.id, 'returned no id');
                assert.propertyVal(body, 'error', 'load from share failed: bagit not found but content type is compendium');
                done();
            });
        }).timeout(10000);
    });

    describe('load from public share with multiple zip files', () => {
        it('should respond with an error', (done) => {
            let form = {
                share_url: 'https://uni-muenster.sciebo.de/index.php/s/NSqqEdjVIjhPf0N',
                path: '/',
                content_type: 'compendium'
            };

            let j = request.jar();
            let ck = request.cookie('connect.sid=' + cookie);
            j.setCookie(ck, global.test_host);

            request({
                uri: global.test_host + '/api/v1/compendium',
                method: 'POST',
                jar: j,
                json: form,
                timeout: requestLoadingTimeout
            }, (err, res, body) => {
                assert.ifError(err);
                assert.equal(res.statusCode, 400);
                assert.isUndefined(body.id, 'returned no id');
                assert.include(body.error, 'load from share failed');
                done();
            });
        }).timeout(20000);
    });

    describe('invalid share URLs', () => {
        it('should respond with an error 422', (done) => {
            let form = {
                share_url: 'htts:/uni-muenster.sciebo.de/index.php/s/7EoWgjLSFV',
                path: '/',
                content_type: 'compendium',
            };

            let j = request.jar();
            let ck = request.cookie('connect.sid=' + cookie);
            j.setCookie(ck, global.test_host);

            request({
                uri: global.test_host + '/api/v1/compendium',
                method: 'POST',
                jar: j,
                json: form,
                timeout: requestLoadingTimeout
            }, (err, res, body) => {
                assert.ifError(err);
                assert.equal(res.statusCode, 422);
                assert.isUndefined(body.id, 'returned no id');
                assert.propertyVal(body, 'error', 'public share URL is invalid');
                done();
            });
        }).timeout(10000);
    });

    describe('invalid host (not a Sciebo public share)', () => {
        it('should respond with an error 403', (done) => {
            let form = {
                share_url: 'https://myowncloud.wxyz/index.php/s/G8vxQ1h50V4HpuA',
                path: '/',
                content_type: 'compendium',
            };

            let j = request.jar();
            let ck = request.cookie('connect.sid=' + cookie);
            j.setCookie(ck, global.test_host);

            request({
                uri: global.test_host + '/api/v1/compendium',
                method: 'POST',
                jar: j,
                json: form,
                timeout: requestLoadingTimeout
            }, (err, res, body) => {
                assert.ifError(err);
                assert.equal(res.statusCode, 403);
                assert.isUndefined(body.id, 'returned no id');
                assert.propertyVal(body, 'error', 'host is not allowed');
                done();
            });
        }).timeout(10000);
    });

    describe('invalid token', () => {
        it('should respond with an error 404', (done) => {
            let form = {
                share_url: 'https://uni-muenster.sciebo.de/index.php/s/89k3ljf93kjfa',
                path: '/',
                content_type: 'compendium',
            };

            let j = request.jar();
            let ck = request.cookie('connect.sid=' + cookie);
            j.setCookie(ck, global.test_host);

            request({
                uri: global.test_host + '/api/v1/compendium',
                method: 'POST',
                jar: j,
                json: form,
                timeout: requestLoadingTimeout
            }, (err, res, body) => {
                assert.ifError(err);
                assert.equal(res.statusCode, 404);
                assert.isUndefined(body.id, 'returned no id');
                assert.propertyVal(body, 'error', 'could not read webdav contents');
                done();
            });
        }).timeout(10000);
    });

    describe('invalid WebDAV path', () => {
        it('should respond with an error 404', (done) => {
            let form = {
                share_url: 'https://uni-muenster.sciebo.de/index.php/s/G8vxQ1h50V4HpuA',
                path: '/ekjsle5',
                content_type: 'compendium',
            };

            let j = request.jar();
            let ck = request.cookie('connect.sid=' + cookie);
            j.setCookie(ck, global.test_host);

            request({
                uri: global.test_host + '/api/v1/compendium',
                method: 'POST',
                jar: j,
                json: form,
                timeout: requestLoadingTimeout
            }, (err, res, body) => {
                assert.ifError(err);
                assert.equal(res.statusCode, 404);
                assert.isUndefined(body.id, 'returned no id');
                assert.propertyVal(body, 'error', 'could not read webdav contents');
                done();
            });
        }).timeout(10000);
    });

    describe('unauthorised user', () => {
        it('should respond with an error 401', (done) => {
            let form = {
                share_url: 'https://uni-muenster.sciebo.de/index.php/s/7Y7U4HC8GzJr5b9',
                content_type: 'compendium',
            };

            request({
                uri: global.test_host + '/api/v1/compendium',
                method: 'POST',
                json: form,
                timeout: requestLoadingTimeout
            }, (err, res, body) => {
                assert.ifError(err);
                assert.equal(res.statusCode, 401);
                assert.isUndefined(body.id, 'returned no id');
                assert.propertyVal(body, 'error', 'user is not authenticated');
                done();
            });
        }).timeout(10000);
    });

    describe('invalid user level', () => {
        it('should respond with an error 403', (done) => {
            let form = {
                share_url: 'https://uni-muenster.sciebo.de/index.php/s/7Y7U4HC8GzJr5b9',
                content_type: 'compendium',
            };

            let j = request.jar();
            let ck = request.cookie('connect.sid=' + cookie_plain);
            j.setCookie(ck, global.test_host);

            request({
                uri: global.test_host + '/api/v1/compendium',
                method: 'POST',
                jar: j,
                json: form,
                timeout: requestLoadingTimeout
            }, (err, res, body) => {
                assert.ifError(err);
                assert.equal(res.statusCode, 403);
                assert.isUndefined(body.id, 'returned no id');
                assert.propertyVal(body, 'error', 'user level does not allow compendium creation');
                done();
            });
        }).timeout(10000);
    });
});
