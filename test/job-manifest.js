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
const config = require('../config/config');
const createCompendiumPostRequest = require('./util').createCompendiumPostRequest;
const publishCandidate = require('./util').publishCandidate;
const waitForJob = require('./util').waitForJob;
const startJob = require('./util').startJob;
const mongojs = require('mongojs');

require("./setup");
const cookie_o2r = 's:C0LIrsxGtHOGHld8Nv2jedjL4evGgEHo.GMsWD5Vveq0vBt7/4rGeoH5Xx7Dd2pgZR9DvhKCyDTY';
const cookie_plain = 's:yleQfdYnkh-sbj9Ez--_TWHVhXeXNEgq.qRmINNdkRuJ+iHGg5woRa9ydziuJ+DzFG9GnAZRvaaM';

describe('Manifest creation during a job', () => {
  var db = mongojs('localhost/muncher', ['compendia', 'jobs']);

  before(function (done) {
    db.compendia.drop(function (err, doc) {
      db.jobs.drop(function (err, doc) {
        done();
      });
    });
  });

  after(function (done) {
    db.close();
    done();
  });

  describe('Manifest generation and image build for workspace minimal-rmd-data', () => {
    let job_id = '';
    let compendium_id = '';

    before(function (done) {
      this.timeout(90000);
      createCompendiumPostRequest('./test/workspace/rmd-data', cookie_o2r, 'workspace', (req) => {
        request(req, (err, res, body) => {
          compendium_id = JSON.parse(body).id;
          publishCandidate(compendium_id, cookie_o2r, () => {
            startJob(compendium_id, id => {
              job_id = id;
              waitForJob(job_id, (finalStatus) => {
                done();
              });
            });
          });
        });
      });
    });

    it('should skip previous steps', (done) => {
      request(global.test_host + '/api/v1/job/' + job_id, (err, res, body) => {
        assert.ifError(err);
        let response = JSON.parse(body);

        assert.propertyVal(response.steps.validate_bag, 'status', 'skipped');
        assert.propertyVal(response.steps.validate_compendium, 'status', 'success');
        done();
      });
    });

    it('should complete step "generate_manifest"', (done) => {
      request(global.test_host + '/api/v1/job/' + job_id, (err, res, body) => {
        assert.ifError(err);
        let response = JSON.parse(body);
        assert.propertyVal(response.steps.generate_manifest, 'status', 'success');
        done();
      });
    });

    it('should have the manifest file in the job files', (done) => {
      request(global.test_host + '/api/v1/job/' + job_id, (err, res, body) => {
        assert.ifError(err);
        let response = JSON.parse(body);

        filePaths = response.files.children.map(elem => { return elem.path; });
        assert.include(filePaths, '/api/v1/job/' + job_id + '/data/Dockerfile');
        done();
      });
    });

    it('should have the manifest file in the compendium files', (done) => {
      request(global.test_host + '/api/v1/compendium/' + compendium_id, (err, res, body) => {
        assert.ifError(err);
        let response = JSON.parse(body);

        filePaths = response.files.children.map(elem => { return elem.path; });
        assert.include(filePaths, '/api/v1/compendium/' + compendium_id + '/data/Dockerfile');
        done();
      });
    });

    it('should have the expected content in the manifest file via the job', function (done) {
      request(global.test_host + '/api/v1/job/' + job_id + '/data/Dockerfile', (err, res, body) => {
        assert.ifError(err);
        assert.isNotObject(body, 'response is not JSON');
        assert.include(body, 'FROM ' + config.containerit.baseImage);
        assert.include(body, 'rmarkdown::render(input = \\"/erc/main.Rmd\\"');
        done();
      });
    });

    it('should have the expected content in the manifest file via the compendium', function (done) {
      request(global.test_host + '/api/v1/compendium/' + compendium_id + '/data/Dockerfile', (err, res, body) => {
        assert.ifError(err);
        assert.isNotObject(body, 'response is not JSON');
        assert.include(body, 'FROM ' + config.containerit.baseImage);
        assert.include(body, 'rmarkdown::render(input = \\"/erc/main.Rmd\\"');
        done();
      });
    });

    it('should have the manifest build log in the compendium metadata files', (done) => {
      request(global.test_host + '/api/v1/compendium/' + compendium_id, (err, res, body) => {
        assert.ifError(err);
        let response = JSON.parse(body);

        filePaths = response.files.children
          .find((element) => { return element.name === '.erc' })
          .children.map(elem => { return elem.path; });
        assert.include(filePaths, '/api/v1/compendium/' + compendium_id + '/data/.erc/generate_manifest.log');
        done();
      });
    });

    it('should complete build, execute, and cleanup', function (done) {
      request(global.test_host + '/api/v1/job/' + job_id, (err, res, body) => {
        assert.ifError(err);
        let response = JSON.parse(body);

        assert.propertyVal(response.steps.image_build, 'status', 'success');
        assert.propertyVal(response.steps.image_execute, 'status', 'success');
        assert.propertyVal(response.steps.cleanup, 'status', 'success');
        done();
      });
    });

    it('should have the image build log in the compendium metadata files', (done) => {
      request(global.test_host + '/api/v1/compendium/' + compendium_id, (err, res, body) => {
        assert.ifError(err);
        let response = JSON.parse(body);

        filePaths = response.files.children
          .find((element) => { return element.name === '.erc' })
          .children.map(elem => { return elem.path; });
        assert.include(filePaths, '/api/v1/compendium/' + compendium_id + '/data/.erc/image_build.log');
        done();
      });
    });

  });

  describe('Manifest generation for workspace minimal-script', () => {
    let job_id = '';
    let compendium_id = '';

    before(function (done) {
      this.timeout(240000); // image tarball saving takes time
      createCompendiumPostRequest('./test/workspace/script', cookie_o2r, 'workspace', (req) => {
        request(req, (err, res, body) => {
          compendium_id = JSON.parse(body).id;
          publishCandidate(compendium_id, cookie_o2r, () => {
            startJob(compendium_id, id => {
              job_id = id;
              waitForJob(job_id, (finalStatus) => {
                done();
              });
            });
          });
        });
      });
    });

    it('should skip validation steps because it is a workspace', (done) => {
      request(global.test_host + '/api/v1/job/' + job_id, (err, res, body) => {
        assert.ifError(err);
        let response = JSON.parse(body);

        assert.propertyVal(response.steps.validate_bag, 'status', 'skipped');
        assert.propertyVal(response.steps.validate_compendium, 'status', 'success');
        done();
      });
    });

    it('should complete step "generate_manifest"', (done) => {
      request(global.test_host + '/api/v1/job/' + job_id, (err, res, body) => {
        assert.ifError(err);
        let response = JSON.parse(body);
        assert.propertyVal(response.steps.generate_manifest, 'status', 'success');
        done();
      });
    });

    it('should have the manifest file in the job files', (done) => {
      request(global.test_host + '/api/v1/job/' + job_id, (err, res, body) => {
        assert.ifError(err);
        let response = JSON.parse(body);

        filePaths = response.files.children.map(elem => { return elem.path; });
        assert.include(filePaths, '/api/v1/job/' + job_id + '/data/Dockerfile');
        done();
      });
    });

    it('should have the manifest file in the compendium files', (done) => {
      request(global.test_host + '/api/v1/compendium/' + compendium_id, (err, res, body) => {
        assert.ifError(err);
        let response = JSON.parse(body);

        filePaths = response.files.children.map(elem => { return elem.path; });
        assert.include(filePaths, '/api/v1/compendium/' + compendium_id + '/data/Dockerfile');
        done();
      });
    });

    it('should have the expected content in the manifest', function (done) {
      request(global.test_host + '/api/v1/job/' + job_id + '/data/Dockerfile', (err, res, body) => {
        assert.ifError(err);
        assert.isNotObject(body, 'response is not JSON');
        assert.notInclude(body, 'COPY', 'no COPY statement, because files are mounted');
        assert.include(body, 'CMD ["R", "--vanilla", "-f", "main.R"]');
        done();
      });
    });

    it('should complete build, execute, and cleanup', function (done) {
      request(global.test_host + '/api/v1/job/' + job_id, (err, res, body) => {
        assert.ifError(err);
        let response = JSON.parse(body);

        assert.propertyVal(response.steps.image_build, 'status', 'success');
        assert.propertyVal(response.steps.image_execute, 'status', 'success');
        assert.propertyVal(response.steps.cleanup, 'status', 'success');
        done();
      });
    });

  });

  describe.skip('Manifest generation with skipping base images (only run manually against containerised muncher, otherwise permission issues)', () => {
    let job_id = '';
    let compendium_id = '';

    before(function (done) {
      this.timeout(240000); // image tarball saving takes time
      createCompendiumPostRequest('./test/workspace/rmd-geospatial', cookie_o2r, 'workspace', (req) => {
        request(req, (err, res, body) => {
          compendium_id = JSON.parse(body).id;
          publishCandidate(compendium_id, cookie_o2r, () => {
            startJob(compendium_id, id => {
              job_id = id;
              waitForJob(job_id, (finalStatus) => {
                done();
              });
            });
          });
        });
      });
    });

    it('should complete step "generate_manifest"', (done) => {
      request(global.test_host + '/api/v1/job/' + job_id, (err, res, body) => {
        assert.ifError(err);
        let response = JSON.parse(body);
        assert.propertyVal(response.steps.generate_manifest, 'status', 'success');
        done();
      });
    });

    it('should have the expected content in the manifest', function (done) {
      request(global.test_host + '/api/v1/job/' + job_id + '/data/Dockerfile', (err, res, body) => {
        assert.ifError(err);
        assert.isNotObject(body, 'response is not JSON');
        assert.include(body, 'RUN ["install2.r", "here", "lwgeom"]', 'lwgeom and here packages installed in Dockerfile');
        assert.include(body, 'Packages skipped');
        assert.match(body, '^# Packages skipped.*sf', 'skip sf package');
        assert.match(body, '^# Packages skipped.*rmarkdown', 'skip rmarkdown package');
        assert.match(body, '^# Packages skipped.*yaml', 'skip yaml package');
        done();
      });
    });
  });

});
