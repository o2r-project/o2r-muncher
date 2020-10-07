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
const tmp = require('tmp');
const AdmZip = require('adm-zip');
const tarStream = require('tar-stream');

const createCompendiumPostRequest = require('./util').createCompendiumPostRequest;
const publishCandidate = require('./util').publishCandidate;
const publishLink = require('./util').publishLink;
const startJob = require('./util').startJob;
const waitForJob = require('./util').waitForJob;
const mongojs = require('mongojs');

require("./setup")
const cookie = 's:C0LIrsxGtHOGHld8Nv2jedjL4evGgEHo.GMsWD5Vveq0vBt7/4rGeoH5Xx7Dd2pgZR9DvhKCyDTY';
const cookie_admin = 's:hJRjapOTVCEvlMYCb8BXovAOi2PEOC4i.IEPb0lmtGojn2cVk2edRuomIEanX6Ddz87egE5Pe8UM';

describe('Downloading using public link', function () {
    var db = mongojs('localhost/muncher', ['compendia', 'publiclinks', 'jobs']);

    after(function (done) {
        db.close();
        done();
    });

    before(function (done) {
        this.timeout(30000);
        db.compendia.drop(function (err, doc) {
            db.publiclinks.drop(function (err, doc) {
                done();
            });
        });
    });

    describe('TAR', function () {
        let public_id = '';

        before(function (done) {
            this.timeout(720000);

            createCompendiumPostRequest('./test/workspace/dummy', cookie, 'workspace', (req) => {
                request(req, (err, res, body) => {
                    compendium_id = JSON.parse(body).id;
                    publishLink(compendium_id, cookie_admin, (response) => {
                        public_id = response.id;

                        startJob(public_id, job_id => {
                            assert.ok(job_id);
                            waitForJob(job_id, (finalStatus) => {
                                done();
                            });
                        })
                    });
                });
            });
        });

        it('should respond with HTTP 200 and expected headers', (done) => {
            request(global.test_host + '/api/v1/compendium/' + public_id + '.tar?image=false', (err, res) => {
                assert.ifError(err);
                assert.equal(res.statusCode, 200);
                assert.equal(res.headers['content-type'], 'application/x-tar');
                assert.equal(res.headers['content-disposition'], 'attachment; filename="' + public_id + '.tar"');
                done();
            });
        });

        it('downloaded file is a tar archive (can be extracted, files exist)', (done) => {
            let url = global.test_host + '/api/v1/compendium/' + public_id + '.tar?image=false';
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

    describe('ZIP', function () {
        let public_id = '';

        before(function (done) {
            this.timeout(720000);

            createCompendiumPostRequest('./test/workspace/dummy', cookie, 'workspace', (req) => {
                request(req, (err, res, body) => {
                    compendium_id = JSON.parse(body).id;
                    publishLink(compendium_id, cookie_admin, (response) => {
                        public_id = response.id;

                        startJob(public_id, job_id => {
                            assert.ok(job_id);
                            waitForJob(job_id, (finalStatus) => {
                                done();
                            });
                        })
                    });
                });
            });
        });

        it('should respond with HTTP 200 and expected headers', (done) => {
            request(global.test_host + '/api/v1/compendium/' + public_id + '.zip?image=false', (err, res) => {
                assert.ifError(err);
                assert.equal(res.statusCode, 200);
                assert.equal(res.headers['content-type'], 'application/zip');
                assert.equal(res.headers['content-disposition'], 'attachment; filename="' + public_id + '.zip"');
                done();
            });
        });

        it('downloaded file is a zip without image (can be extracted, all files exist)', (done) => {
            let tmpfile = tmp.tmpNameSync() + '.zip';
            let url = global.test_host + '/api/v1/compendium/' + public_id + '.zip?image=false';
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

                    assert.oneOf('main.Rmd', filenames);
                    assert.oneOf('display.html', filenames);
                    assert.oneOf('Dockerfile', filenames);
                    assert.oneOf('erc.yml', filenames);
                    assert.oneOf('.erc/metadata_o2r_1.json', filenames);
                    done();
                });
        });
    });
});