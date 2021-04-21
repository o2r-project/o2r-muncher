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

require("./setup");
const cookie = 's:C0LIrsxGtHOGHld8Nv2jedjL4evGgEHo.GMsWD5Vveq0vBt7/4rGeoH5Xx7Dd2pgZR9DvhKCyDTY';
const cookie_plain = 's:yleQfdYnkh-sbj9Ez--_TWHVhXeXNEgq.qRmINNdkRuJ+iHGg5woRa9ydziuJ+DzFG9GnAZRvaaM';
const requestLoadingTimeout = 20000;


describe('Sciebo loader with workspaces', function () {
    describe('create new compendium based on a workspace in a public WebDAV', () => {
        it('should respond with a compendium ID', (done) => {
            let form = {
                share_url: 'https://uni-muenster.sciebo.de/s/96XJFrmd3cSYGko',
                content_type: 'workspace'
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
                done();
            });
        }).timeout(20000);

        it('should download the files in the workspace and list them via the API', (done) => {
            let form = {
                share_url: 'https://uni-muenster.sciebo.de/index.php/s/96XJFrmd3cSYGko',
                content_type: 'workspace'
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

                    assert.include(JSON.stringify(response), 'data/main.Rmd');
                    assert.include(JSON.stringify(response), 'data/display.html');

                    done();
                });
            });
        }).timeout(20000);
    });

    describe('create new compendium based on a workspace in a public WebDAV with workspace in a subdirectory', () => {
        let compendium_id = null;

        it('should respond with a compendium ID', (done) => {
            let form = {
                share_url: 'https://uni-muenster.sciebo.de/s/VEX8Bd88hPAm7fa',
                path: '/my-research',
                content_type: 'workspace'
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

        it('should have downloaded the files in the workspace and list them via the API', (done) => {
            let j = request.jar();
            let ck = request.cookie('connect.sid=' + cookie);
            j.setCookie(ck, global.test_host);

            request({
                uri: global.test_host + '/api/v1/compendium/' + compendium_id,
                method: 'GET',
                jar: j,
                timeout: requestLoadingTimeout
            }, (err, res, body) => {
                assert.ifError(err);
                assert.equal(res.statusCode, 200);
                let response = body;

                assert.include(JSON.stringify(response), 'data/main.Rmd');
                assert.include(JSON.stringify(response), 'data/display.html');
                assert.notInclude(JSON.stringify(response), 'shouldnotbethere');

                done();
            });
        });
    });

    describe('create new compendium based on a workspace in a public WebDAV with a single zip file', () => {
        it('should respond with a compendium ID', (done) => {
            let form = {
                share_url: 'https://uni-muenster.sciebo.de/index.php/s/Pu58dfPYcIvM2GX',
                path: '/',
                content_type: 'workspace'
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
                done();
            });
        }).timeout(20000);

        it('should download the files in the workspace and list them via the API', (done) => {
            let form = {
                share_url: 'https://uni-muenster.sciebo.de/index.php/s/Pu58dfPYcIvM2GX',
                content_type: 'workspace'
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

                    assert.include(JSON.stringify(response), 'data/main.R');
                    assert.include(JSON.stringify(response), 'data/display.png');

                    done();
                });
            });
        }).timeout(20000);
    });

    describe.skip('create new compendium based on a workspace in a public WebDAV that contains a directory', () => {
        it('should respond with a compendium ID', (done) => {
            let form = {
                share_url: 'https://uni-muenster.sciebo.de/s/Dct9JUTgnhAtZaM',
                path: '/',
                content_type: 'workspace'
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
                done();
            });
        }).timeout(20000);

        it('should download the files in the workspace and list them via the API', (done) => {
            let form = {
                share_url: 'https://uni-muenster.sciebo.de/s/Dct9JUTgnhAtZaM',
                content_type: 'workspace'
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

                    assert.include(JSON.stringify(response), 'data/main.Rmd');
                    assert.include(JSON.stringify(response), 'data/display.html');
                    assert.include(JSON.stringify(response), 'data/subDirectory/data.csv');

                    done();
                });
            });
        }).timeout(20000);
    });
});

describe('Sciebo loader with invalid requests', () => {
    it('should respond with an error 422 for an invalid share URL', (done) => {
        let form = {
            share_url: 'htts:/uni-muenster.sciebo.de/index.php/s/7EoWgjLSFV',
            path: '/',
            content_type: 'workspace',
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

    it('invalid host (not a sciebo public share): should respond with an error 403', (done) => {
        let form = {
            share_url: 'https://myowncloud.wxyz/index.php/s/G8vxQ1h50V4HpuA',
            path: '/',
            content_type: 'workspace',
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

    it('invalid token: should respond with an error 404', (done) => {
        let form = {
            share_url: 'https://uni-muenster.sciebo.de/index.php/s/89k3ljf93kjfa',
            path: '/',
            content_type: 'workspace',
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

    it('insufficient user level: should respond with an error 403', (done) => {
        let form = {
            share_url: 'https://uni-muenster.sciebo.de/index.php/s/G8vxQ1h50V4HpuA',
            path: '/ekjsle5',
            content_type: 'workspace',
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

describe('Sciebo loader with empty workspace', function () {
    it('should respond with an error 404 and valid JSON with error message', (done) => {
        let form = {
            share_url: 'https://uni-muenster.sciebo.de/index.php/s/KScGmzyCIMJkFa9',
            path: '/',
            content_type: 'workspace',
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
            assert.propertyVal(body, 'error', 'public share is empty');
            done();
        });
    }).timeout(10000);

});
