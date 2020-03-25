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
const tarStream = require('tar-stream');
const gunzip = require('gunzip-maybe');

const createCompendiumPostRequest = require('./util').createCompendiumPostRequest;
const publishCandidate = require('./util').publishCandidate;
const startJob = require('./util').startJob;
const waitForJob = require('./util').waitForJob;

require("./setup")
const cookie = 's:C0LIrsxGtHOGHld8Nv2jedjL4evGgEHo.GMsWD5Vveq0vBt7/4rGeoH5Xx7Dd2pgZR9DvhKCyDTY';

describe('TAR downloading', function () {
    let compendium_id = null;

    before(function (done) {
        this.timeout(720000);

        createCompendiumPostRequest('./test/workspace/dummy', cookie, 'workspace', (req) => {
            request(req, (err, res, body) => {
                compendium_id = JSON.parse(body).id;

                publishCandidate(compendium_id, cookie, () => {
                    startJob(compendium_id, job_id => {
                        assert.ok(job_id);
                        waitForJob(job_id, (finalStatus) => {
                            done();
                        });
                    })
                });
            });
        });
    });

    describe('Download compendium using .tar', function () {
        it('should respond with HTTP 200 in response', (done) => {
            request(global.test_host + '/api/v1/compendium/' + compendium_id + '.tar?image=false', (err, res) => {
                assert.ifError(err);
                assert.equal(res.statusCode, 200);
                done();
            });
        });
        it('should have correct response headers', (done) => {
            request(global.test_host + '/api/v1/compendium/' + compendium_id + '.tar?image=false', (err, res) => {
                assert.ifError(err);
                assert.equal(res.headers['content-type'], 'application/x-tar');
                assert.equal(res.headers['content-disposition'], 'attachment; filename="' + compendium_id + '.tar"');
                done();
            });
        });
        it('downloaded file is a tar archive (can be extracted, files exist)', (done) => {
            let url = global.test_host + '/api/v1/compendium/' + compendium_id + '.tar?image=false';
            let filenames = [];
            let extractTar = tarStream.extract();
            extractTar.on('entry', function (header, stream, next) {
                filenames.push(header.name);
                stream.on('end', function () {
                    next();
                })
                stream.resume();
            });
            extractTar.on('finish', function () {
                assert.oneOf('erc.yml', filenames);
                assert.oneOf('main.Rmd', filenames);
                assert.oneOf('.erc/metadata_o2r_1.json', filenames);
                done();
            });
            extractTar.on('error', function (e) {
                done(e);
            });

            request.get(url)
                .on('error', function (err) {
                    done(err);
                })
                // NOT using gunzip() here, should not be needed!
                .pipe(extractTar);
        });
    });

    describe('Download compendium using .tar with gzip', function () {
        it('should respond with HTTP 200 in response for .gz', (done) => {
            request(global.test_host + '/api/v1/compendium/' + compendium_id + '.tar.gz?image=false', (err, res) => {
                assert.ifError(err);
                assert.equal(res.statusCode, 200);
                done();
            });
        });

        it('should respond with HTTP 200 in response for ?gzip', (done) => {
            request(global.test_host + '/api/v1/compendium/' + compendium_id + '.tar?gzip&image=false', (err, res) => {
                assert.ifError(err);
                assert.equal(res.statusCode, 200);
                done();
            });
        });

        it('content-type should be application/gzip', (done) => { // https://superuser.com/a/960710
            request(global.test_host + '/api/v1/compendium/' + compendium_id + '.tar?gzip&image=false', (err, res) => {
                assert.ifError(err);
                assert.equal(res.headers['content-type'], 'application/gzip');
                done();
            });
        });

        it('content disposition is set to file name attachment', (done) => {
            request(global.test_host + '/api/v1/compendium/' + compendium_id + '.tar?gzip&image=false', (err, res) => {
                assert.ifError(err);
                assert.equal(res.headers['content-disposition'], 'attachment; filename="' + compendium_id + '.tar.gz"');
                done();
            });
        });

        it('downloaded file is a gzipped tar archive (can be extracted, files exist)', (done) => {
            let url = global.test_host + '/api/v1/compendium/' + compendium_id + '.tar?gzip&image=false';
            let filenames = [];
            let extractTar = tarStream.extract();
            extractTar.on('entry', function (header, stream, next) {
                filenames.push(header.name);
                stream.on('end', function () {
                    next();
                })
                stream.resume();
            });
            extractTar.on('finish', function () {
                assert.oneOf('erc.yml', filenames);
                assert.oneOf('main.Rmd', filenames);
                assert.oneOf('.erc/metadata_o2r_1.json', filenames);
                done();
            });
            extractTar.on('error', function (e) {
                done(e);
            });

            request.get(url)
                .on('error', function (err) {
                    done(err);
                })
                .pipe(gunzip())
                .pipe(extractTar);
        });
    });
});
