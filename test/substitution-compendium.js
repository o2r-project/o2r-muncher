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
const sleep = require('sleep');
const mongojs = require('mongojs');

require("./setup")
const cookie_o2r = 's:C0LIrsxGtHOGHld8Nv2jedjL4evGgEHo.GMsWD5Vveq0vBt7/4rGeoH5Xx7Dd2pgZR9DvhKCyDTY';
const uploadCompendium = require('./util').uploadCompendium;
const createSubstitutionPostRequest = require('./util').createSubstitutionPostRequest;
const publishCandidate = require('./util').publishCandidate;
const startJob = require('./util').startJob;
const getErcYml = require('./util').getErcYml;
const getFile = require('./util').getFile;

describe.skip('Substitution with two compendia', function () {
    var base_id;
    var overlay_id;
    var metadataHandling = "keepBase";

    db = mongojs('localhost/muncher', ['compendia']);

    before(function (done) {
        let req_erc_base02 = uploadCompendium('./test/erc/base', cookie_o2r);
        let req_erc_overlay02 = uploadCompendium('./test/erc/overlay', cookie_o2r);
        this.timeout(120000);

        // clear compendia
        db.compendia.drop(function (err, doc) {

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
                            done();
                        });
                    });
                });
            });
        });
    });

    after(function (done) {
        db.close();
        done();
    });

    // FIXME issues with invalid metadata (required property "creators" missing)
    describe.skip('Create substitution', () => {
        let base_file = "data/BerlinMit.csv";
        let overlay_file = "data/BerlinOhne.csv";

        it('should respond with HTTP 200 OK', (done) => {
            request(global.test_host + '/api/v1/substitution', (err, res, body) => {
                let req = createSubstitutionPostRequest(base_id, overlay_id, base_file, overlay_file, metadataHandling, cookie_o2r);

                request(req, (err, res, body) => {
                    assert.ifError(err);
                    assert.equal(res.statusCode, 200);
                    done();
                });
            });
        });

        it('should respond with valid JSON', (done) => {
            request(global.test_host + '/api/v1/substitution', (err, res, body) => {
                let req = createSubstitutionPostRequest(base_id, overlay_id, base_file, overlay_file, metadataHandling, cookie_o2r);

                request(req, (err, res, body) => {
                    assert.ifError(err);
                    assert.isObject(body);
                    done();
                });
            });
        });

        it('should respond with valid ID and allow publishing', (done) => {
            request(global.test_host + '/api/v1/substitution', (err, res, body) => {
                let req = createSubstitutionPostRequest(base_id, overlay_id, base_file, overlay_file, metadataHandling, cookie_o2r);

                request(req, (err, res, body) => {
                    assert.ifError(err);
                    assert.property(body, 'id');
                    assert.isString(body.id);

                    publishCandidate(body.id, cookie_o2r, (err) => {
                        assert.ifError(err);
                        done();
                    });
                });
            });
        }).timeout(20000);
    });

    describe('Substitution metadata', () => {
        let substituted_id;
        let base_file = "data/BerlinMit.csv";
        let overlay_file = "data/BerlinOhne.csv";

        before(function (done) {
            this.timeout(120000);

            request(global.test_host + '/api/v1/substitution', (err, res, body) => {
                let req = createSubstitutionPostRequest(base_id, overlay_id, base_file, overlay_file, metadataHandling, cookie_o2r);

                request(req, (err, res, body) => {
                    assert.ifError(err);
                    assert.property(body, 'id');
                    assert.isString(body.id);

                    publishCandidate(body.id, cookie_o2r, (err) => {
                        assert.ifError(err);
                        substituted_id = body.id;
                        done();
                    });
                });
            });
        });

        it('should respond with substituted property', (done) => {
            request(global.test_host + '/api/v1/compendium/' + substituted_id, (err, res, body) => {
                assert.ifError(err);
                let response = JSON.parse(body);
                assert.property(response, 'substituted');
                assert.propertyVal(response, 'substituted', true);
                done();
            });
        });

        it('should respond with metadata for base and overlay ID', (done) => {
            request(global.test_host + '/api/v1/compendium/' + substituted_id, (err, res, body) => {
                assert.ifError(err);
                let response = JSON.parse(body);
                assert.property(response.metadata, 'substitution');
                assert.property(response.metadata.substitution, 'base');
                assert.property(response.metadata.substitution, 'overlay');
                assert.propertyVal(response.metadata.substitution, 'base', base_id);
                assert.propertyVal(response.metadata.substitution, 'overlay', overlay_id);
                done();
            });
        });

        it('should respond with metadata for base and overlay filenames, and new filenames now at root directory (not a compendium anymore)', (done) => {
            request(global.test_host + '/api/v1/compendium/' + substituted_id, (err, res, body) => {
                assert.ifError(err);
                let response = JSON.parse(body);
                assert.property(response.metadata.substitution, 'substitutionFiles');
                assert.equal(response.metadata.substitution.substitutionFiles.length, 1);
                assert.property(response.metadata.substitution.substitutionFiles[0], 'base');
                assert.property(response.metadata.substitution.substitutionFiles[0], 'overlay');
                assert.propertyVal(response.metadata.substitution.substitutionFiles[0], 'filename', "BerlinOhne.csv");
                assert.propertyVal(response.metadata.substitution.substitutionFiles[0], 'base', "data/BerlinMit.csv");
                assert.propertyVal(response.metadata.substitution.substitutionFiles[0], 'overlay', "data/BerlinOhne.csv");
                done();
            });
        });

        it('should respond with existence of substituted ERC files', (done) => {
            getFile(substituted_id, 'BerlinMit.csv', (err, res, body) => {
                assert.ifError(err);
                assert.equal(res.statusCode, 200);
                assert.include(body, '1990,18186');

                getFile(substituted_id, 'BerlinOhne.csv', (err, res, body) => {
                    assert.ifError(err);
                    assert.equal(res.statusCode, 200);
                    assert.include(body, '1990,61568');
                    done();
                });
            });
        });

        it('should have replaced the old ID with the new one in the configuration file', (done) => {
            getFile(substituted_id, 'erc.yml', (err, res, body) => {
                assert.ifError(err);
                assert.equal(res.statusCode, 200);
                assert.include(body, 'id: ' + substituted_id);
                assert.notInclude(body, 'b9b0099e-base');
                assert.notInclude(body, 'b9b0099e-overlay');
                done();
            });
        });
    });

    describe('Substitution execution', () => {
        let substituted_id, job_id;
        let base_file = "data/BerlinMit.csv";
        let overlay_file = "data/BerlinOhne.csv";

        before(function (done) {
            this.timeout(120000);

            request(global.test_host + '/api/v1/substitution', (err, res, body) => {
                let req = createSubstitutionPostRequest(base_id, overlay_id, base_file, overlay_file, metadataHandling, cookie_o2r);

                request(req, (err, res, body) => {
                    assert.ifError(err);
                    assert.property(body, 'id');
                    assert.isString(body.id);

                    publishCandidate(body.id, cookie_o2r, (err) => {
                        assert.ifError(err);
                        substituted_id = body.id;
                        done();
                    });
                });
            });
        });

        it("should fail the check step of a job execution, skip bag validation (it's not a bag anymore), but succeed other steps", (done) => {
            startJob(substituted_id, id => {
                job_id = id;
                assert.isOk(id);
                
                sleep.sleep(30);
                request(global.test_host + '/api/v1/job/' + job_id, (err, res, body) => {
                    assert.ifError(err);
                    response = JSON.parse(body);
                    assert.propertyVal(response, 'status', 'failure');
                    assert.propertyVal(response.steps.validate_bag, 'status', 'skipped');
                    assert.propertyVal(response.steps.validate_compendium, 'status', 'success');
                    assert.propertyVal(response.steps.image_prepare, 'status', 'success');
                    assert.propertyVal(response.steps.image_build, 'status', 'success');
                    assert.propertyVal(response.steps.image_execute, 'status', 'success');
                    assert.propertyVal(response.steps.cleanup, 'status', 'success');
                    done();
                });
            });
        }).timeout(90000);

        // base uses points for the plot, the overlay uses lines
        it('job display file should have been created with overlay dataset', (done) => {
            // should not be base data ("mitBerlin"), maximum is 55.1
            // should be overlay data ("ohneBerlin"), maximum is 1051.2

            request(global.test_host + '/api/v1/job/' + job_id + '/data/main.html', (err, res, body) => {
                assert.ifError(err);
                assert.include(body, 'maximum of ‘Gesamtbilanz’: 1051.2');
                assert.notInclude(body, '55.1');
                done();
            });
        });
    });

    describe('Substitution metadata with more overlays', () => {
        let substituted_id_moreOverlays;
        let base_file = "data/BerlinMit.csv";
        let overlay_file = "data/BerlinOhne.csv";

        before(function (done) {
            this.timeout(120000);

            request(global.test_host + '/api/v1/substitution', (err, res, body) => {
                let req = createSubstitutionPostRequest(base_id, overlay_id, base_file, overlay_file, metadataHandling, cookie_o2r);

                req.json.substitutionFiles.push({ base: "data/Dockerfile", overlay: "data/erc.yml" });
                req.json.substitutionFiles.push({ base: "data/main.Rmd", overlay: "data/Dockerfile" });

                request(req, (err, res, body) => {
                    assert.ifError(err);
                    assert.property(body, 'id');
                    assert.isString(body.id);
                    substituted_id_moreOverlays = body.id;

                    publishCandidate(substituted_id_moreOverlays, cookie_o2r, (err) => {
                        assert.ifError(err);
                        done();
                    });
                });
            });
        });

        it('should respond with correct substitution file list with multiple overlays', (done) => {
            request(global.test_host + '/api/v1/compendium/' + substituted_id_moreOverlays, (err, res, body) => {
                assert.ifError(err);
                response = JSON.parse(body);
                assert.property(response.metadata.substitution, 'substitutionFiles');
                assert.equal(response.metadata.substitution.substitutionFiles.length, 3);
                done();
            });
        });

        it('should respond with correct written erc.yml with multiple overlays', (done) => {
            getErcYml(substituted_id_moreOverlays, doc => {
                assert.include(doc.execution.cmd, "BerlinOhne.csv:/erc/BerlinMit.csv:ro");
                assert.include(doc.execution.cmd, "overlay_erc.yml:/erc/Dockerfile:ro");
                assert.include(doc.execution.cmd, "overlay_Dockerfile:/erc/main.Rmd:ro");
                done();
            });
        });
    });

    describe('Create substitution with an overlay filename that already exists as an base filename', () => {
        var substituted_id;
        let base_file = "data/main.Rmd";
        let overlay_file = "data/main.Rmd";

        it('should respond with HTTP 200 OK', (done) => {
            request(global.test_host + '/api/v1/substitution', (err, res, body) => {
                let req = createSubstitutionPostRequest(base_id, overlay_id, base_file, overlay_file, metadataHandling, cookie_o2r);

                request(req, (err, res, body) => {
                    assert.ifError(err);
                    assert.equal(res.statusCode, 200);
                    done();
                });
            });
        });

        it('should respond with valid JSON', (done) => {
            request(global.test_host + '/api/v1/substitution', (err, res, body) => {
                let req = createSubstitutionPostRequest(base_id, overlay_id, base_file, overlay_file, metadataHandling, cookie_o2r);

                request(req, (err, res, body) => {
                    assert.ifError(err);
                    assert.isObject(body);
                    done();
                });
            });
        });

        it('should respond with valid ID and allow publishing', (done) => {
            request(global.test_host + '/api/v1/substitution', (err, res, body) => {
                let req = createSubstitutionPostRequest(base_id, overlay_id, base_file, overlay_file, metadataHandling, cookie_o2r);

                request(req, (err, res, body) => {
                    assert.ifError(err);
                    assert.property(body, 'id');
                    assert.isString(body.id);
                    substituted_id = body.id;

                    publishCandidate(substituted_id, cookie_o2r, (err) => {
                        assert.ifError(err);
                        done();
                    });
                });
            });
        }).timeout(20000);

        it('should respond with substituted property', (done) => {
            request(global.test_host + '/api/v1/compendium/' + substituted_id, (err, res, body) => {
                assert.ifError(err);
                let response = JSON.parse(body);
                assert.property(response, 'substituted');
                assert.propertyVal(response, 'substituted', true);
                done();
            });
        });

        it('should respond with metadata for base and overlay ID', (done) => {
            request(global.test_host + '/api/v1/compendium/' + substituted_id, (err, res, body) => {
                assert.ifError(err);
                let response = JSON.parse(body);
                assert.property(response.metadata, 'substitution');
                assert.property(response.metadata.substitution, 'base');
                assert.property(response.metadata.substitution, 'overlay');
                assert.propertyVal(response.metadata.substitution, 'base', base_id);
                assert.propertyVal(response.metadata.substitution, 'overlay', overlay_id);
                done();
            });
        });

        it('should respond with metadata for base, overlay and filename', (done) => {
            request(global.test_host + '/api/v1/compendium/' + substituted_id, (err, res, body) => {
                assert.ifError(err);
                let response = JSON.parse(body);
                assert.property(response.metadata.substitution, 'substitutionFiles');
                assert.property(response.metadata.substitution.substitutionFiles[0], 'base');
                assert.property(response.metadata.substitution.substitutionFiles[0], 'overlay');
                assert.property(response.metadata.substitution.substitutionFiles[0], 'filename');
                assert.propertyVal(response.metadata.substitution.substitutionFiles[0], 'base', "data/main.Rmd");
                assert.propertyVal(response.metadata.substitution.substitutionFiles[0], 'overlay', "data/main.Rmd");
                assert.propertyVal(response.metadata.substitution.substitutionFiles[0], 'filename', "overlay_main.Rmd");
                done();
            });
        });
    });

    describe('Create substitution with invalid base ID', () => {
        let base_id = "12345";
        let base_file = "data/BerlinMit.csv";
        let overlay_file = "data/BerlinOhne.csv";

        it('should fail the substitution because of invalid base ID', (done) => {
            request(global.test_host + '/api/v1/substitution', (err, res, body) => {
                let req = createSubstitutionPostRequest(base_id, overlay_id, base_file, overlay_file, metadataHandling, cookie_o2r);

                request(req, (err, res, body) => {
                    assert.ifError(err);
                    assert.equal(res.statusCode, 400);
                    assert.include(body, { error: 'base ID is invalid' });
                    done();
                });
            });
        });
    });

    describe('Create substitution with missing base ID', () => {
        let base_file = "data/BerlinMit.csv";
        let overlay_file = "data/BerlinOhne.csv";

        it('should fail with HTTP 400 and error message', (done) => {
            request(global.test_host + '/api/v1/substitution', (err, res, body) => {
                let req = createSubstitutionPostRequest(base_id, overlay_id, base_file, overlay_file, metadataHandling, cookie_o2r);
                delete req.json.base;

                request(req, (err, res, body) => {
                    assert.ifError(err);
                    assert.equal(res.statusCode, 400);
                    assert.include(body, { error: 'base ID is invalid' });
                    done();
                });
            });
        });
    });

    describe('Create substitution with invalid overlay ID', () => {
        let overlay_id = "12345";
        let base_file = "data/BerlinMit.csv";
        let overlay_file = "data/BerlinOhne.csv";

        it('should fail with HTTP 400 and error message', (done) => {
            request(global.test_host + '/api/v1/substitution', (err, res, body) => {
                let req = createSubstitutionPostRequest(base_id, overlay_id, base_file, overlay_file, metadataHandling, cookie_o2r);

                request(req, (err, res, body) => {
                    assert.ifError(err);
                    assert.equal(res.statusCode, 400);
                    assert.include(body, { error: 'overlay ID is invalid' });
                    done();
                });
            });
        });
    });

    describe('Create substitution with missing overlay ID', () => {
        let overlay_id = "12345";
        let base_file = "data/BerlinMit.csv";
        let overlay_file = "data/BerlinOhne.csv";

        it('should fail with HTTP 400 and error message', (done) => {
            request(global.test_host + '/api/v1/substitution', (err, res, body) => {
                let req = createSubstitutionPostRequest(base_id, overlay_id, base_file, overlay_file, metadataHandling, cookie_o2r);
                delete req.json.overlay;

                request(req, (err, res, body) => {
                    assert.ifError(err);
                    assert.equal(res.statusCode, 400);
                    assert.include(body, { error: 'overlay ID is invalid' });
                    done();
                });
            });
        });
    });

    describe('Create substitution with invalid base file', () => {
        let base_file = "doesNotExist.csv";
        let overlay_file = "data/BerlinOhne.csv";

        it('should fail with HTTP 400 and error message', (done) => {
            request(global.test_host + '/api/v1/substitution', (err, res, body) => {
                let req = createSubstitutionPostRequest(base_id, overlay_id, base_file, overlay_file, metadataHandling, cookie_o2r);

                request(req, (err, res, body) => {
                    assert.ifError(err);
                    assert.equal(res.statusCode, 400);
                    assert.include(body, { error: 'base file "doesNotExist.csv" does not exist' });
                    done();
                });
            });
        });
    });

    describe('Create substitution with invalid overlay file', () => {
        let base_file = "data/BerlinMit.csv";
        let overlay_file = "doesNotExist.csv";

        it('should fail with HTTP 400 and error message', (done) => {
            request(global.test_host + '/api/v1/substitution', (err, res, body) => {
                let req = createSubstitutionPostRequest(base_id, overlay_id, base_file, overlay_file, metadataHandling, cookie_o2r);

                request(req, (err, res, body) => {
                    assert.ifError(err);
                    assert.equal(res.statusCode, 400);
                    assert.include(body, { error: 'overlay file "doesNotExist.csv" does not exist' });
                    done();
                });
            });
        });
    });

    describe('Create substitution with empty substitution files', () => {
        let base_file = "data/BerlinMit.csv";
        let overlay_file = "data/BerlinOhne.csv";

        it('should fail with HTTP 400 and error message', (done) => {
            request(global.test_host + '/api/v1/substitution', (err, res, body) => {
                let req = createSubstitutionPostRequest(base_id, overlay_id, base_file, overlay_file, metadataHandling, cookie_o2r);
                req.json.substitutionFiles = [];   // set Array of substitutionFiles empty

                request(req, (err, res, body) => {
                    assert.ifError(err);
                    assert.equal(res.statusCode, 400);
                    assert.include(body, { error: 'substitution files missing' });
                    done();
                });
            });
        });
    });

    describe('Create substitution with no substitution files', () => {
        let base_file = "data/BerlinMit.csv";
        let overlay_file = "data/BerlinOhne.csv";

        it('should fail with HTTP 400 and error message', (done) => {
            request(global.test_host + '/api/v1/substitution', (err, res, body) => {
                let req = createSubstitutionPostRequest(base_id, overlay_id, base_file, overlay_file, metadataHandling, cookie_o2r);
                delete req.json.substitutionFiles;

                request(req, (err, res, body) => {
                    assert.ifError(err);
                    assert.equal(res.statusCode, 400);
                    assert.include(body, { error: 'substitution files missing' });
                    done();
                });
            });
        });
    });

    describe('Create substitution with only base filename but no overlay filename', () => {
        let base_file = "data/BerlinMit.csv";
        let overlay_file = "data/BerlinOhne.csv";

        it('should fail with HTTP 400 and error message', (done) => {
            request(global.test_host + '/api/v1/substitution', (err, res, body) => {
                let req = createSubstitutionPostRequest(base_id, overlay_id, base_file, overlay_file, metadataHandling, cookie_o2r);
                req.json.substitutionFiles = [{
                    base: "data/BerlinMit.csv"
                }];

                request(req, (err, res, body) => {
                    assert.ifError(err);
                    assert.equal(res.statusCode, 400);
                    assert.include(body, { error: 'overlay file is undefined' });
                    done();
                });
            });
        });
    });

    describe('Create substitution with only overlay filename but not base filename', () => {
        let base_file = "data/BerlinMit.csv";
        let overlay_file = "data/BerlinOhne.csv";

        it('should fail with HTTP 400 and error message', (done) => {
            request(global.test_host + '/api/v1/substitution', (err, res, body) => {
                let req = createSubstitutionPostRequest(base_id, overlay_id, base_file, overlay_file, metadataHandling, cookie_o2r);
                req.json.substitutionFiles = [{
                    overlay: "data/BerlinOhne.csv"
                }];

                request(req, (err, res, body) => {
                    assert.ifError(err);
                    assert.equal(res.statusCode, 400);
                    assert.include(body, { error: 'base file is undefined' });
                    done();
                });
            });
        });
    });
});


describe.skip('Path updating for substitution with two compendia', function () {
    var base_id;
    var overlay_id;
    var metadataHandling = "keepBase";

    var db = mongojs('localhost/muncher', ['compendia']);

    before(function (done) {
        let req_erc_base02 = uploadCompendium('./test/erc/base', cookie_o2r);
        let req_erc_overlay02 = uploadCompendium('./test/erc/overlay', cookie_o2r);
        this.timeout(120000);

        // clear compendia
        db.compendia.drop(function (err, doc) {

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

                            db.close();
                            done();
                        });
                    });
                });
            });
        });
    });

    describe('Create substitution with two valid compendia', () => {
        var substituted_id;
        var substituted_id_moreOverlays;
        let base_file = "data/BerlinMit.csv";
        let overlay_file = "data/BerlinOhne.csv";

        it('should respond with HTTP 200 OK and valid JSON', (done) => {

            request(global.test_host + '/api/v1/substitution', (err, res, body) => {
                let req = createSubstitutionPostRequest(base_id, overlay_id, base_file, overlay_file, metadataHandling, cookie_o2r);

                request(req, (err, res, body) => {
                    assert.ifError(err);
                    assert.equal(res.statusCode, 200);
                    done();
                });
            });
        });

        it('should respond with valid JSON', (done) => {

            request(global.test_host + '/api/v1/substitution', (err, res, body) => {
                let req = createSubstitutionPostRequest(base_id, overlay_id, base_file, overlay_file, metadataHandling, cookie_o2r);

                request(req, (err, res, body) => {
                    assert.ifError(err);
                    done();
                });
            });
        });

        it('should respond with valid ID and allow publishing', (done) => {
            request(global.test_host + '/api/v1/substitution', (err, res, body) => {
                let req = createSubstitutionPostRequest(base_id, overlay_id, base_file, overlay_file, metadataHandling, cookie_o2r);

                request(req, (err, res, body) => {
                    assert.ifError(err);
                    assert.property(body, 'id');
                    assert.isString(body.id);
                    substituted_id = body.id;

                    publishCandidate(substituted_id, cookie_o2r, (err) => {
                        assert.ifError(err);
                        done();
                    });
                });
            });
        }).timeout(20000);

        it('should respond with substituted metadata', (done) => {
            request(global.test_host + '/api/v1/compendium/' + substituted_id, (err, res, body) => {
                assert.ifError(err);
                let response = JSON.parse(body);
                assert.property(response, 'substituted');
                assert.propertyVal(response, 'substituted', true);
                done();
            });
        });

        it('should respond with substituted compendium id', (done) => {
            request(global.test_host + '/api/v1/compendium/' + substituted_id, (err, res, body) => {
                assert.ifError(err);
                let response = JSON.parse(body);
                assert.propertyVal(response, 'id', substituted_id);
                done();
            });
        });

        it('should respond with updated path in o2r metadata', (done) => {
            request(global.test_host + '/api/v1/compendium/' + substituted_id, (err, res, body) => {
                assert.ifError(err);
                let response = JSON.parse(body);
                assert.property(response, 'metadata');
                assert.property(response.metadata, 'o2r');
                assert.property(response.metadata.o2r, 'mainfile');
                assert.propertyVal(response.metadata.o2r, 'mainfile', 'main.Rmd');
                done();
            });
        });

    });
});
