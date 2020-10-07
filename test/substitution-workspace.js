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

require("./setup")
const cookie_o2r = 's:C0LIrsxGtHOGHld8Nv2jedjL4evGgEHo.GMsWD5Vveq0vBt7/4rGeoH5Xx7Dd2pgZR9DvhKCyDTY';
const uploadCompendium = require('./util').uploadCompendium;
const createSubstitutionPostRequest = require('./util').createSubstitutionPostRequest;
const publishCandidate = require('./util').publishCandidate;
const getErcYml = require('./util').getErcYml;
const getFile = require('./util').getFile;
const startJob = require('./util').startJob;


describe('Substitution of data with two workspaces', function () {
    var base_id;
    var overlay_id;
    var metadataHandling = "keepBase";

    before(function (done) {
        let req_workspace_base01 = uploadCompendium('./test/workspace/base01', cookie_o2r, 'workspace');
        let req_workspace_overlay03 = uploadCompendium('./test/workspace/overlay03', cookie_o2r, 'workspace');
        this.timeout(120000);

        // first upload
        request(req_workspace_base01, (err, res, body) => {
            assert.ifError(err);
            base_id = JSON.parse(body).id;

            publishCandidate(base_id, cookie_o2r, (err) => {
                assert.ifError(err);

                // second upload
                request(req_workspace_overlay03, (err, res, body) => {
                    assert.ifError(err);
                    overlay_id = JSON.parse(body).id;

                    publishCandidate(overlay_id, cookie_o2r, (err) => {
                        assert.ifError(err);

                        // run job for base and overlay compendium
                        startJob(base_id, jid1 => {
                            assert.isOk(jid1);
                            sleep.sleep(20);

                            startJob(overlay_id, jid2 => {
                                assert.isOk(jid2);
                                sleep.sleep(20);
                                done();
                            });
                        });
                    });
                });
            });
        });
    });

    describe('Creation responses', () => {
        var substituted_id;
        var substituted_id_moreOverlays;
        let base_file = "files/BerlinMit.csv";
        let overlay_file = "BerlinOhne.csv";

        it('should respond with HTTP 200 OK and valid JSON', (done) => {
            request(global.test_host + '/api/v1/substitution', (err, res, body) => {
                let req = createSubstitutionPostRequest(base_id, overlay_id, base_file, overlay_file, metadataHandling, cookie_o2r);

                request(req, (err, res, body) => {
                    assert.ifError(err);
                    assert.equal(res.statusCode, 200);
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
    });

    describe('Substitution metadata', () => {
        let substituted_id;
        var substituted_id_moreOverlays;
        let base_file = "files/BerlinMit.csv";
        let overlay_file = "BerlinOhne.csv";

        before(function (done) {
            this.timeout(60000);
            let req = createSubstitutionPostRequest(base_id, overlay_id, base_file, overlay_file, metadataHandling, cookie_o2r);
            request(req, (err, res, body) => {
                assert.ifError(err);
                substituted_id = body.id;

                publishCandidate(substituted_id, cookie_o2r, (err) => {
                    assert.ifError(err);

                    // second substitution for tests
                    let req = createSubstitutionPostRequest(base_id, overlay_id, base_file, overlay_file, metadataHandling, cookie_o2r);
                    req.json.substitutionFiles.push({ base: "Dockerfile", overlay: "main.Rmd" });
                    req.json.substitutionFiles.push({ base: "main.Rmd", overlay: "Dockerfile" });

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

        it('should respond with metadata for base and overlay filenames, and new filename at root directory', (done) => {
            request(global.test_host + '/api/v1/compendium/' + substituted_id, (err, res, body) => {
                assert.ifError(err);
                let response = JSON.parse(body);
                assert.property(response.metadata.substitution, 'substitutionFiles');
                assert.equal(response.metadata.substitution.substitutionFiles.length, 1);
                assert.property(response.metadata.substitution.substitutionFiles[0], 'base');
                assert.property(response.metadata.substitution.substitutionFiles[0], 'overlay');
                assert.propertyVal(response.metadata.substitution.substitutionFiles[0], 'base', "files/BerlinMit.csv");
                assert.propertyVal(response.metadata.substitution.substitutionFiles[0], 'overlay', "BerlinOhne.csv");
                assert.propertyVal(response.metadata.substitution.substitutionFiles[0], 'filename', "overlay_overlay_BerlinOhne.csv");
                done();
            });
        });

        it('should respond with correct execution command in erc.yml', (done) => {
            getErcYml(substituted_id, doc => {
                assert.include(doc.execution.cmd, "overlay_overlay_BerlinOhne.csv:/erc/files/BerlinMit.csv:ro");
                done();
            });
        });

        it('should respond with correct binds in erc.yml (has the overlay, does not have payload mount)', (done) => {
            getErcYml(substituted_id, doc => {
                assert.isArray(doc.execution.bind_mounts);
                doc.execution.bind_mounts.forEach(bind => {
                    assert.isObject(bind);
                });
                assert.oneOf('overlay_overlay_BerlinOhne.csv', doc.execution.bind_mounts.map(bind => { return (bind.source); }));
                assert.oneOf('/erc/files/BerlinMit.csv', doc.execution.bind_mounts.map(bind => { return (bind.destination); }));
                assert.notInclude('/erc', doc.execution.bind_mounts.map(bind => { return (bind.destination); }));
                done();
            });
        });

        it('should respond with overlay file from the substitution', (done) => {
            getFile(substituted_id, 'overlay_overlay_BerlinOhne.csv', (err, res, body) => {
                assert.ifError(err);

                assert.equal(res.statusCode, 200);
                assert.equal(body, '1,2,3');
                done();
            });
        });

        it('should respond with correct substitution file list with multiple overlays', (done) => {
            request(global.test_host + '/api/v1/compendium/' + substituted_id_moreOverlays, (err, res, body) => {
                assert.ifError(err);
                let response = JSON.parse(body);
                assert.property(response.metadata.substitution, 'substitutionFiles');
                assert.equal(response.metadata.substitution.substitutionFiles.length, 3);
                done();
            });
        });

        it('should respond with correct written erc.yml with multiple overlays', (done) => {
            getErcYml(substituted_id_moreOverlays, doc => {
                assert.include(doc.execution.cmd, "BerlinOhne.csv:/erc/files/BerlinMit.csv:ro");
                assert.include(doc.execution.cmd, "overlay_main.Rmd:/erc/Dockerfile:ro");
                assert.include(doc.execution.cmd, "overlay_Dockerfile:/erc/main.Rmd:ro");
                done();
            });
        });

        it('should respond with correct overlay file from substitution', (done) => {
            getFile(substituted_id_moreOverlays, 'overlay_main.Rmd', (err, res, body) => {
                assert.ifError(err);

                assert.equal(res.statusCode, 200);
                assert.include(body, '02 ohne Berlin');
                done();
            });
        });

        it('should respond with correct base file from substitution', (done) => {
            getFile(substituted_id_moreOverlays, 'main.Rmd', (err, res, body) => {
                assert.ifError(err);

                assert.equal(res.statusCode, 200);
                assert.include(body, '01 mit Berlin');
                done();
            });
        });
    });
});
