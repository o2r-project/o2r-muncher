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
const chai = require('chai');
const assert = chai.assert;
const request = require('request');
const fs = require('fs');
const tmp = require('tmp');
const AdmZip = require('adm-zip');
const tarStream = require('tar-stream');
const gunzip = require('gunzip-maybe');
const stream = require('stream');
const exec = require('child_process').exec;

const createCompendiumPostRequest = require('./util').createCompendiumPostRequest;
const publishCandidate = require('./util').publishCandidate;
const startJob = require('./util').startJob;
const waitForJob = require('./util').waitForJob;

const config = require('../config/config');

require("./setup");
const cookie = 's:C0LIrsxGtHOGHld8Nv2jedjL4evGgEHo.GMsWD5Vveq0vBt7/4rGeoH5Xx7Dd2pgZR9DvhKCyDTY';

describe('Accessing payload data of compendia', () => {
    let compendium_data_uri, compendium_id = '';

    before(function (done) {
        this.timeout(60000);

        createCompendiumPostRequest('./test/workspace/dummy', cookie, 'workspace', (req) => {
            request(req, (err, res, body) => {
                assert.ifError(err);
                compendium_id = JSON.parse(body).id;
                test_compendium_id = compendium_id;
                compendium_data_uri = global.test_host + '/api/v1/compendium/' + compendium_id + '/data/';
                publishCandidate(compendium_id, cookie, () => {
                    done();
                });
            });
        });
    });

    describe('GET /api/v1/compendium/<id>/data/', () => {
        it('should respond with 200 Found', (done) => {
            request(compendium_data_uri, (err, res, body) => {
                assert.ifError(err);
                assert.equal(res.statusCode, 200);
                done();
            });
        });

        it('should respond with valid JSON', (done) => {
            request(compendium_data_uri, (err, res, body) => {
                assert.ifError(err);
                assert.isObject(JSON.parse(body), 'returned JSON');
                done();
            });
        });

        it('should contain the name and base path in the response', (done) => {
            request(compendium_data_uri, (err, res, body) => {
                assert.ifError(err);

                let response = JSON.parse(body);
                assert.property(response, 'path');
                assert.property(response, 'name');
                assert.propertyVal(response, 'path', '/api/v1/compendium/' + compendium_id + '/data/');
                assert.propertyVal(response, 'name', compendium_id);
                done();
            });
        });

        it('should contain file paths of upload files', (done) => {
            request(global.test_host + '/api/v1/compendium/' + compendium_id + '/data/', (err, res, body) => {
                assert.ifError(err);
                assert.include(body, '/api/v1/compendium/' + compendium_id + '/data/Dockerfile');
                assert.include(body, '/api/v1/compendium/' + compendium_id + '/data/main.Rmd');
                assert.include(body, '/api/v1/compendium/' + compendium_id + '/data/display.html');
                done();
            });
        });

        it('should not contain the internal base path', (done) => {
            request(global.test_host + '/api/v1/compendium/' + compendium_id + '/data/', (err, res, body) => {
                assert.ifError(err);
                assert.notInclude(body, config.fs.base);
                done();
            });
        });
    });
});

describe('Accessing archive downloads', function () {
    describe('GET non-existing compendium at tar endpoint', function () {
        it('should respond with HTTP 404 status code at .tar', (done) => {
            request(global.test_host + '/api/v1/compendium/1234.tar', (err, res, body) => {
                assert.ifError(err);
                assert.equal(res.statusCode, 404);
                done();
            });
        });

        it('should mention "no compendium" in a valid JSON document with error message at .tar', (done) => {
            request(global.test_host + '/api/v1/compendium/1234.tar', (err, res, body) => {
                assert.ifError(err);
                let response = JSON.parse(body);
                assert.isObject(response);
                assert.property(response, 'error');
                assert.include(response.error, 'no compendium');
                done();
            });
        });

        it('should respond with HTTP 404 status code at tar.gz', (done) => {
            request(global.test_host + '/api/v1/compendium/1234.tar.gz', (err, res, body) => {
                assert.ifError(err);
                assert.equal(res.statusCode, 404);
                done();
            });
        });

        it('should mention "no compendium" in a valid JSON document with error message at .tar.gz', (done) => {
            request(global.test_host + '/api/v1/compendium/1234.tar.gz', (err, res, body) => {
                assert.ifError(err);
                let response = JSON.parse(body);
                assert.isObject(response);
                assert.property(response, 'error');
                assert.include(response.error, 'no compendium');
                done();
            });
        });
    });

    describe('GET non-existing compendium at zip endpoint', function () {
        it('should respond with HTTP 404 error at .zip', (done) => {
            request(global.test_host + '/api/v1/compendium/1234.zip', (err, res, body) => {
                assert.ifError(err);
                assert.equal(res.statusCode, 404);
                done();
            });
        });
        it('should mention "no compendium" in the error message at .zip', (done) => {
            request(global.test_host + '/api/v1/compendium/1234.zip', (err, res, body) => {
                assert.include(JSON.parse(body).error, 'no compendium');
                done();
            });
        });
    });
});

describe('Accessing job files', () => {
    let job_data_uri, job_id;

    before(function (done) {
        this.timeout(40000);

        createCompendiumPostRequest('./test/workspace/with-csv-data', cookie, 'workspace', (req) => {
            request(req, (err, res, body) => {
                assert.ifError(err);
                let compendium_id = JSON.parse(body).id;
                // let compendium_data_uri = global.test_host + '/api/v1/compendium/' + compendium_id + '/data/';
                publishCandidate(compendium_id, cookie, () => {
                    startJob(compendium_id, (res) => {
                        job_id = res;
                        job_data_uri = global.test_host + '/api/v1/job/' + job_id + '/data/';
                        waitForJob(job_id, (finalStatus) => {
                            done();
                        });
                    });
                });
            });
        });
    });

    it('should respond with HTTP 200 content-type and size of requested file (.html)', (done) => {
        request(job_data_uri + 'display.html', (err, res, body) => {
            assert.ifError(err);
            assert.equal(res.statusCode, 200);
            assert.include(res.headers, { 'content-type': 'text/html; charset=utf-8', 'content-length': '19' }, 'returned file has unexpected mime-type or size');
            done();
        });
    });

    it('should respond with content-type and size of requested file (.yml)', (done) => {
        request(job_data_uri + 'erc.yml', (err, res, body) => {
            assert.ifError(err);
            assert.equal(res.statusCode, 200);
            assert.include(res.headers, { 'content-type': 'text/yaml; charset=utf-8', 'content-length': '136' }, 'returned file has unexpected mime-type or size');
            done();
        });
    });

    it('should respond with content-type and size of requested file (.Rmd)', (done) => {
        request(job_data_uri + 'main.Rmd', (err, res, body) => {
            assert.ifError(err);
            assert.equal(res.statusCode, 200);
            assert.include(res.headers, { 'content-type': 'text/x-r-markdown; charset=utf-8', 'content-length': '859' }, 'returned file has unexpected mime-type or size');
            done();
        });
    });

    it('should respond with content-type and new size of requested file when passing a query-param \'size\' (.Rmd)', (done) => {
        request({ uri: job_data_uri + 'main.Rmd', qs: { size: 10 } }, (err, res, body) => {
            assert.ifError(err);
            assert.equal(res.statusCode, 200);
            assert.include(res.headers, { 'content-type': 'text/x-r-markdown; charset=utf-8', 'content-length': '281' }, 'returned file was not truncated correctly');
            done();
        });
    });

    it('should respond with content-type and size of requested file (.csv)', (done) => {
        request(job_data_uri + 'data.csv', (err, res, body) => {
            assert.ifError(err);
            assert.equal(res.statusCode, 200);
            assert.include(res.headers, { 'content-type': 'text/csv; charset=utf-8', 'content-length': '1645' }, 'returned file has unexpected mime-type or size');
            done();
        });
    });

    it('should respond with content-type and new size of requested file when passing a query-param \'size\' (.csv)', (done) => {
        request({ uri: job_data_uri + 'data.csv', qs: { size: 10 } }, (err, res, body) => {
            assert.ifError(err);
            assert.equal(res.statusCode, 200);
            assert.include(res.headers, { 'content-type': 'text/csv; charset=utf-8', 'content-length': '319' }, 'returned file was not truncated correctly');
            done();
        });
    });
});

describe('Image download', function () {
    var compendium_id, job_id = null;

    before(function (done) {
        this.timeout(30000);

        createCompendiumPostRequest('./test/workspace/dummy', cookie, 'workspace', (req) => {
            request(req, (err, res, body) => {
                assert.ifError(err);
                compendium_id = JSON.parse(body).id;

                publishCandidate(compendium_id, cookie, () => {
                    startJob(compendium_id, id => {
                        assert.ok(id);
                        job_id = id;
                        waitForJob(job_id, (finalStatus) => {
                            done();
                        });
                    })
                });
            });
        });
    });

    describe('downloading a compendium', function () {

        it('should contain a tarball of Docker image in zip archive by default', (done) => {
            let tmpfile = tmp.tmpNameSync() + '.zip';
            let url = global.test_host + '/api/v1/compendium/' + compendium_id + '.zip';
            request.get(url)
                .on('error', function (err) {
                    done(err);
                })
                .pipe(fs.createWriteStream(tmpfile))
                .on('finish', function () {
                    let zip = new AdmZip(tmpfile);
                    let zipEntries = zip.getEntries();

                    let filenames = [];
                    zipEntries.forEach(function (entry) {
                        filenames.push(entry.entryName);
                    });

                    assert.oneOf('image.tar', filenames);
                    assert.oneOf('main.Rmd', filenames);
                    assert.oneOf('.erc/metadata_o2r_1.json', filenames);
                    done();
                });
        });

        it('should contain a tarball of Docker image in gzipped .tar archive', (done) => {
            let url = global.test_host + '/api/v1/compendium/' + compendium_id + '.tar?gzip';
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
                assert.oneOf('image.tar', filenames);
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

        it('should contain a tarball of Docker image in zip archive when explicitly asking for it', (done) => {
            let tmpfile = tmp.tmpNameSync() + '.zip';
            let url = global.test_host + '/api/v1/compendium/' + compendium_id + '.zip?image=true';
            request.get(url)
                .on('error', function (err) {
                    done(err);
                })
                .pipe(fs.createWriteStream(tmpfile))
                .on('finish', function () {
                    let zip = new AdmZip(tmpfile);
                    let zipEntries = zip.getEntries();

                    let filenames = [];
                    zipEntries.forEach(function (entry) {
                        filenames.push(entry.entryName);
                    });
                    assert.oneOf('image.tar', filenames);
                    assert.oneOf('.erc/metadata_o2r_1.json', filenames);
                    done();
                });
        });

        it('should contain a tarball of Docker image in tar.gz archive when explicitly asking for it', (done) => {
            let url = global.test_host + '/api/v1/compendium/' + compendium_id + '.tar?gzip&image=true';
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
                assert.oneOf('image.tar', filenames);
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

        it('should not have a tarball of Docker image in zip archive when explicitly not asking for it', (done) => {
            let tmpfile = tmp.tmpNameSync() + '.zip';
            let url = global.test_host + '/api/v1/compendium/' + compendium_id + '.zip?image=false';
            request.get(url)
                .on('error', function (err) {
                    done(err);
                })
                .pipe(fs.createWriteStream(tmpfile))
                .on('finish', function () {
                    let zip = new AdmZip(tmpfile);
                    let zipEntries = zip.getEntries();

                    let filenames = [];
                    zipEntries.forEach(function (entry) {
                        filenames.push(entry.entryName);
                    });

                    assert.notInclude(filenames, 'image.tar');
                    assert.oneOf('.erc/metadata_o2r_1.json', filenames);
                    done();
                });
        });

        it('should not have a tarball of Docker image in tar.gz archive when explicitly not asking for it', (done) => {
            let url = global.test_host + '/api/v1/compendium/' + compendium_id + '.tar.gz?image=false';
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
                assert.notInclude(filenames, 'image.tar');
                assert.oneOf('erc.yml', filenames);
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

        it('should not have a tarball of Docker image in gzipped tar archive when explicitly not asking for it', (done) => {
            let url = global.test_host + '/api/v1/compendium/' + compendium_id + '.tar?image=false&gzip';
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
                assert.notInclude(filenames, 'image.tar');
                assert.oneOf('erc.yml', filenames);
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

        it('should contain expected files in tarball', (done) => {
            let tmpfile = tmp.tmpNameSync() + '.zip';
            let url = global.test_host + '/api/v1/compendium/' + compendium_id + '.zip';
            request.get(url)
                .on('error', function (err) {
                    done(err);
                })
                .pipe(fs.createWriteStream(tmpfile))
                .on('finish', function () {
                    let zip = new AdmZip(tmpfile);

                    zip.getEntries().forEach(function (entry) {
                        if (entry.entryName === 'image.tar') {
                            let filenames = [];
                            let manifestJson = null;
                            let extractTar = tarStream.extract();
                            extractTar.on('entry', function (header, stream, next) {
                                filenames.push(header.name);
                                if (header.name == 'manifest.json') {
                                    const chunks = [];
                                    stream.on('data', function (chunk) {
                                        chunks.push(chunk);
                                    });
                                    stream.on('end', function () {
                                        manifestJson = JSON.parse(chunks)[0];
                                        next();
                                    });
                                } else {
                                    stream.on('end', function () {
                                        next();
                                    })
                                }
                                stream.resume();
                            });
                            extractTar.on('finish', function () {
                                assert.oneOf('manifest.json', filenames);
                                assert.oneOf('repositories', filenames);
                                assert.include(filenames.toString(), '/VERSION');
                                assert.include(filenames.toString(), '/layer.tar');
                                assert.property(manifestJson, 'RepoTags');

                                done();
                            });
                            extractTar.on('error', function (e) {
                                done(e);
                            });

                            let bufferStream = new stream.PassThrough();
                            bufferStream.end(new Buffer(entry.getData()));
                            bufferStream.pipe(extractTar);
                        }
                    });
                });
        }).timeout(60000);

        it('should have the correct job tag on the image in tarball', (done) => {
            let tmpfile = tmp.tmpNameSync() + '.zip';
            let url = global.test_host + '/api/v1/compendium/' + compendium_id + '.zip';
            request.get(url)
                .on('error', function (err) {
                    done(err);
                })
                .pipe(fs.createWriteStream(tmpfile))
                .on('finish', function () {
                    let zip = new AdmZip(tmpfile);

                    zip.getEntries().forEach(function (entry) {
                        if (entry.entryName === 'image.tar') {
                            let manifestJson = null;
                            let extractTar = tarStream.extract();
                            extractTar.on('entry', function (header, stream, next) {
                                if (header.name == 'manifest.json') {
                                    const chunks = [];
                                    stream.on('data', function (chunk) {
                                        chunks.push(chunk);
                                    });
                                    stream.on('end', function () {
                                        manifestJson = JSON.parse(chunks)[0];
                                        next();
                                    });
                                } else {
                                    stream.on('end', function () {
                                        next();
                                    })
                                }
                                stream.resume();
                            });
                            extractTar.on('finish', function () {
                                assert.oneOf('job:' + job_id, manifestJson.RepoTags, '"job:<job_id>" tag is in RepoTags list');

                                done();
                            });
                            extractTar.on('error', function (e) {
                                done(e);
                            });

                            let bufferStream = new stream.PassThrough();
                            bufferStream.end(new Buffer(entry.getData()));
                            bufferStream.pipe(extractTar);
                        }
                    });
                });
        }).timeout(60000);

        it('should have the correct compendium tag on the image in tarball', (done) => {
            let tmpfile = tmp.tmpNameSync() + '.zip';
            let url = global.test_host + '/api/v1/compendium/' + compendium_id + '.zip';
            request.get(url)
                .on('error', function (err) {
                    done(err);
                })
                .pipe(fs.createWriteStream(tmpfile))
                .on('finish', function () {
                    let zip = new AdmZip(tmpfile);

                    zip.getEntries().forEach(function (entry) {
                        if (entry.entryName === 'image.tar') {
                            let manifestJson = null;
                            let extractTar = tarStream.extract();
                            extractTar.on('entry', function (header, stream, next) {
                                if (header.name == 'manifest.json') {
                                    const chunks = [];
                                    stream.on('data', function (chunk) {
                                        chunks.push(chunk);
                                    });
                                    stream.on('end', function () {
                                        manifestJson = JSON.parse(chunks)[0];
                                        next();
                                    });
                                } else {
                                    stream.on('end', function () {
                                        next();
                                    })
                                }
                                stream.resume();
                            });
                            extractTar.on('finish', function () {
                                assert.oneOf('erc:' + compendium_id, manifestJson.RepoTags, '"erc:<erc_id>" tag is in RepoTags list');

                                done();
                            });
                            extractTar.on('error', function (e) {
                                done(e);
                            });

                            let bufferStream = new stream.PassThrough();
                            bufferStream.end(new Buffer(entry.getData()));
                            bufferStream.pipe(extractTar);
                        }
                    });
                });
        }).timeout(60000);
    });

    describe('tinkering with local images outside of transporter', function () {
        it('should return an error (HTTP 400, error message in JSON response) when no job was started', (done) => {
            let compendium_id = null;

            createCompendiumPostRequest('./test/workspace/dummy', cookie, 'workspace', (req) => {
                request(req, (err, res, body) => {
                    assert.ifError(err);
                    compendium_id = JSON.parse(body).id;

                    publishCandidate(compendium_id, cookie, () => {
                        request(global.test_host + '/api/v1/compendium/' + compendium_id + '.zip', (err, res, body) => {
                            assert.ifError(err);
                            let response = JSON.parse(body);
                            console.log(response);
                            assert.equal(res.statusCode, 400);
                            assert.isObject(response);
                            assert.property(response, 'error');
                            assert.include(response.error, 'successful job execution');
                            done();
                        });

                    });
                });
            });
        }).timeout(30000);

        it('should not fail if image got additional tag', (done) => {
            let compendium_id_tag = null;

            createCompendiumPostRequest('./test/workspace/dummy', cookie, 'workspace', (req) => {
                request(req, (err, res, body) => {
                    assert.ifError(err);
                    compendium_id_tag = JSON.parse(body).id;

                    publishCandidate(compendium_id_tag, cookie, () => {
                        startJob(compendium_id_tag, id => {
                            assert.ok(id);
                            waitForJob(id, (finalStatus) => {
                                exec('docker tag job:' + id + ' another:tag', (err, stdout, stderr) => {
                                    if (err || stderr) {
                                        assert.ifError(err);
                                        assert.ifError(stderr);
                                    } else {
                                        let tmpfile = tmp.tmpNameSync() + '.zip';
                                        request.get(global.test_host + '/api/v1/compendium/' + compendium_id_tag + '.zip')
                                            .on('error', function (err) {
                                                done(err);
                                            })
                                            .pipe(fs.createWriteStream(tmpfile))
                                            .on('finish', function () {
                                                let zip = new AdmZip(tmpfile);
                                                let zipEntries = zip.getEntries();

                                                let filenames = [];
                                                zipEntries.forEach(function (entry) {
                                                    filenames.push(entry.entryName);
                                                });

                                                assert.oneOf('image.tar', filenames);
                                                assert.oneOf('erc.yml', filenames);
                                                done();
                                            });
                                    }
                                });
                            });
                        });
                    });
                });
            });
        }).timeout(30000);

    });

});