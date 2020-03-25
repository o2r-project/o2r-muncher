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

const createCompendiumPostRequest = require('./util').createCompendiumPostRequest;
const publishCandidate = require('./util').publishCandidate;
const startJob = require('./util').startJob;
const waitForJob = require('./util').waitForJob;

require("./setup")
const cookie = 's:C0LIrsxGtHOGHld8Nv2jedjL4evGgEHo.GMsWD5Vveq0vBt7/4rGeoH5Xx7Dd2pgZR9DvhKCyDTY';

describe('ZIP downloading', function () {
    let compendium_id = null;

    before(function (done) {
        this.timeout(60000);

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

    describe('non-existing compendium', function () {
        it('should respond with HTTP 404 error', (done) => {
            request(global.test_host + '/api/v1/compendium/1234.zip', (err, res, body) => {
                assert.ifError(err);
                assert.equal(res.statusCode, 404);
                done();
            });
        });

        it('should mention "no compendium" in the error message', (done) => {
            request(global.test_host + '/api/v1/compendium/1234.zip', (err, res, body) => {
                assert.include(JSON.parse(body).error, 'no compendium');
                done();
            });
        });
    });

    describe('Download compendium', function () {
        it('should respond with HTTP 200 in response', (done) => {
            request(global.test_host + '/api/v1/compendium/' + compendium_id + '.zip?image=false', (err, res) => {
                assert.ifError(err);
                assert.equal(res.statusCode, 200);
                done();
            });
        });

        it('content-type should be zip', (done) => {
            request(global.test_host + '/api/v1/compendium/' + compendium_id + '.zip?image=false', (err, res) => {
                assert.ifError(err);
                assert.equal(res.headers['content-type'], 'application/zip');
                done();
            });
        });

        it('content disposition is set to file name attachment', (done) => {
            request(global.test_host + '/api/v1/compendium/' + compendium_id + '.zip?image=false', (err, res) => {
                assert.ifError(err);
                assert.equal(res.headers['content-disposition'], 'attachment; filename="' + compendium_id + '.zip"');
                done();
            });
        });

        it('downloaded file is a zip without image (can be extracted, all files exist)', (done) => {
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

                    assert.oneOf('main.Rmd', filenames);
                    assert.oneOf('display.html', filenames);
                    assert.oneOf('Dockerfile', filenames);
                    assert.oneOf('erc.yml', filenames);
                    assert.oneOf('.erc/metadata_o2r_1.json', filenames);
                    done();
                });
        });

        it('zip file comment is correct', (done) => {
            let tmpfile = tmp.tmpNameSync() + '.zip';
            let url_path = '/api/v1/compendium/' + compendium_id + '.zip';
            let url = global.test_host + url_path;
            request.get(url + '?image=false') // parameters are not used in download URL
                .on('error', function (err) {
                    done(err);
                })
                .pipe(fs.createWriteStream(tmpfile))
                .on('finish', function () {
                    let zip = new AdmZip(tmpfile);

                    assert.include(zip.getZipComment(), 'Created by o2r [');
                    assert.include(zip.getZipComment(), url_path);
                    done();
                });
        });
    });
});