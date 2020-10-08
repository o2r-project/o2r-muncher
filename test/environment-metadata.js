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
const semver = require("semver");
const tmp = require('tmp');
const AdmZip = require('adm-zip');
const fs = require('fs');
const tarStream = require('tar-stream');
const stream = require('stream');
const config = require('../config/config');

const createCompendiumPostRequest = require('./util').createCompendiumPostRequest;
const publishCandidate = require('./util').publishCandidate;
const startJob = require('./util').startJob;
const waitForJob = require('./util').waitForJob;
const getFile = require('./util').getFile;

const cookie_o2r = 's:C0LIrsxGtHOGHld8Nv2jedjL4evGgEHo.GMsWD5Vveq0vBt7/4rGeoH5Xx7Dd2pgZR9DvhKCyDTY';

require("./setup");

describe.only('Environment metadata', () => {
  describe('Environment metadata about the architecture', () => {

    it('should include the supported architecture(s)', function (done) {
      request(global.test_host + '/api/v1/environment/', (err, res, body) => {
        assert.ifError(err);
        response = JSON.parse(body);
        assert.property(response, "architecture");
        assert.typeOf(response.architecture, "array");
        assert.lengthOf(response.architecture, 1);
        done();
      });
    });

  });

  describe('Environment metadata about the OS and kernel', () => {

    it('should include the metadata in the response', (done) => {
      request(global.test_host + '/api/v1/environment/', (err, res, body) => {
        assert.ifError(err);
        response = JSON.parse(body);
        assert.property(response, "os");
        assert.typeOf(response.os, "array");
        response.os.forEach(rt => {
          assert.property(rt, "name");
          assert.property(rt, "version");
          assert.isNotNull(semver.valid(rt.version));
        });
        done();
      });
    });
  });

  describe('Environment metadata container runtime', () => {

    it('should include the available version(s)', (done) => {
      request(global.test_host + '/api/v1/environment/', (err, res, body) => {
        assert.ifError(err);
        response = JSON.parse(body);
        assert.property(response, "container_runtimes");
        response.container_runtimes.forEach(rt => {
          assert.property(rt, "name");
          assert.property(rt, "version");
          assert.isNotNull(semver.valid(rt.version.replace('0', ''))); // remove leading zeros
        });
        done();
      });
    });
  });

  describe('Resources available to ERCs', () => {

    it('should provide available resources for execution of ERCs', (done) => {
      request(global.test_host + '/api/v1/environment/', (err, res, body) => {
        assert.ifError(err);
        response = JSON.parse(body);
        assert.property(response, "erc");
        assert.property(response.erc.manifest, "capture_image");
        assert.property(response.erc.manifest, "base_image");
        assert.property(response.erc.manifest, "memory");
        assert.isNumber(response.erc.manifest.memory);
        assert.isNumber(response.erc.execution.memory);
        done();
      });
    });
  });

  describe('Environment metadata in created images', () => {
    var compendium_id, job_id = null;

    before(function (done) {
      this.timeout(720000);

      createCompendiumPostRequest('./test/workspace/dummy', cookie_o2r, 'workspace', (req) => {
        request(req, (err, res, body) => {
          assert.ifError(err);
          compendium_id = JSON.parse(body).id;

          publishCandidate(compendium_id, cookie_o2r, () => {
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

    it('should store the used kernel in the image metadata', (done) => {
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
              let imageMetadata = null;
              let extractTar = tarStream.extract();
              extractTar.on('entry', function (header, stream, next) {
                if (header.name.endsWith('.json') && header.name !== 'manifest.json') {
                  const chunks = [];
                  stream.on('data', function (chunk) {
                    chunks.push(chunk);
                  });
                  stream.on('end', function () {
                    imageMetadata = JSON.parse(chunks);
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
                assert.property(imageMetadata.container_config.Labels, "info.o2r.build.engine");
                assert.isNotNull(semver.valid(imageMetadata.container_config.Labels["info.o2r.build.kernel"]));
                done();
              });
              extractTar.on('error', function (e) {
                done(e);
              });

              let bufferStream = new stream.PassThrough();
              bufferStream.end(new Buffer.from(entry.getData()));
              bufferStream.pipe(extractTar);
            }
          });
        });
    }).timeout(60000);
  });

});
