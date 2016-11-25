/*
 * (C) Copyright 2016 o2r project
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
const host = 'http://localhost:' + config.net.port;
const chai = require('chai');
chai.use(require('chai-datetime'));
const createCompendiumPostRequest = require('./util').createCompendiumPostRequest;

require("./setup")
const cookie = 's:C0LIrsxGtHOGHld8Nv2jedjL4evGgEHo.GMsWD5Vveq0vBt7/4rGeoH5Xx7Dd2pgZR9DvhKCyDTY';

describe('Compendium upload', () => {
  describe('POST virustainer', () => {

    it('upload compendium should fail and return an error message about infected files', (done) => {
      let req = createCompendiumPostRequest(host, './test/bagtainers/virustainer', cookie);
      req.timeout = 10000;
      request(req, (err, res, body) => {
        assert.ifError(err);
        assert.equal(res.statusCode, 422);
        assert.include(body, 'infected file(s)');
        done();
      });
    });
  }).timeout(10000);

});
