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
const mongojs = require('mongojs');
const request = require('request');
const assert = require('chai').assert;
const bagit = require('../lib/bagit');
const tags = require('mocha-tags');
const fse = require('fs-extra');
const path = require('path');
const config = require('../config/config');

const createCompendiumPostRequest = require('./util').createCompendiumPostRequest;
const publishCandidate = require('./util').publishCandidate;
const waitForJob = require('./util').waitForJob;
const startJob = require('./util').startJob;

require("./setup");

const cookie = 's:C0LIrsxGtHOGHld8Nv2jedjL4evGgEHo.GMsWD5Vveq0vBt7/4rGeoH5Xx7Dd2pgZR9DvhKCyDTY';

tags('storage_access')
  .describe('BagIt functions', () => {
    var db = mongojs('localhost/muncher', ['compendia']);

    after(function (done) {
      db.close();
      fse.removeSync(path.join(config.fs.compendium, 'KIbebWnPlx-validate-comp'));
      fse.removeSync(path.join(config.fs.compendium, 'KIbebWnPlx-execute'));

      done();
    });

    describe('bag detection for compendium', function () {
      let compendium_id = null;

      before(function (done) {
        this.timeout(90000);
        db.compendia.drop(function (err, doc) {
          createCompendiumPostRequest('./test/erc/step_validate_compendium', cookie, 'compendium', (req) => {
            request(req, (err, res, body) => {
              compendium_id = JSON.parse(body).id;
              publishCandidate(compendium_id, cookie, () => {
                done();
              });
            });
          });
        });
      });

      it('should correctly identify a bag directory', (done) => {
        assert.isTrue(bagit.compendiumIsBag(compendium_id));
        assert.isNotFalse(bagit.compendiumIsBag(compendium_id));
        done();
      });
    });

    describe('bag detection for workspace', function () {
      let compendium_id = null;

      before(function (done) {
        this.timeout(90000);
        db.compendia.drop(function (err, doc) {
          createCompendiumPostRequest('./test/workspace/minimal-rmd-data', cookie, 'workspace', (req) => {
            request(req, (err, res, body) => {
              assert.equal(res.statusCode, 200);
              compendium_id = JSON.parse(body).id;
              publishCandidate(compendium_id, cookie, () => {
                done();
              });
            });
          });
        });
      });

      it('should correctly identify a not-bag directory', (done) => {
        assert.isNotTrue(bagit.compendiumIsBag(compendium_id));
        assert.isFalse(bagit.compendiumIsBag(compendium_id));
        done();
      });
    });

    describe('bag detection for job on workspace', function () {
      let job_id = null;

      before(function (done) {
        this.timeout(90000);
        db.compendia.drop(function (err, doc) {
          createCompendiumPostRequest('./test/workspace/minimal-rmd-data', cookie, 'workspace', (req) => {
            request(req, (err, res, body) => {
              let compendium_id = JSON.parse(body).id;
              publishCandidate(compendium_id, cookie, () => {
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
      });

      it('should correctly identify a not-bag directory', (done) => {
        assert.isNotTrue(bagit.jobIsBag(job_id));
        assert.isFalse(bagit.jobIsBag(job_id));
        done();
      });
    });

    describe('bag detection for job on compendium', function () {
      let job_id = null;

      before(function (done) {
        this.timeout(90000);
        db.compendia.drop(function (err, doc) {
          createCompendiumPostRequest('./test/erc/step_image_execute', cookie, 'compendium', (req) => {
            request(req, (err, res, body) => {
              compendium_id = JSON.parse(body).id;
              publishCandidate(compendium_id, cookie, () => {
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
      });

      it('should not find a bag in the job', (done) => {
        assert.isTrue(bagit.jobIsBag(job_id));
        assert.isNotFalse(bagit.jobIsBag(job_id));
        done();
      });
    });
  });
