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
const chai = require('chai');
chai.use(require('chai-datetime'));
const createCompendiumPostRequest = require('./util').createCompendiumPostRequest;
const publishCandidate = require('./util').publishCandidate;

require("./setup");
const cookie_o2r = 's:C0LIrsxGtHOGHld8Nv2jedjL4evGgEHo.GMsWD5Vveq0vBt7/4rGeoH5Xx7Dd2pgZR9DvhKCyDTY';
const cookie_plain = 's:yleQfdYnkh-sbj9Ez--_TWHVhXeXNEgq.qRmINNdkRuJ+iHGg5woRa9ydziuJ+DzFG9GnAZRvaaM';
const cookie_admin = 's:hJRjapOTVCEvlMYCb8BXovAOi2PEOC4i.IEPb0lmtGojn2cVk2edRuomIEanX6Ddz87egE5Pe8UM';
const cookie_editor = 's:xWHihqZq6jEAObwbfowO5IwdnBxohM7z.VxqsRC5A1VqJVspChcxVPuzEKtRE+aKLF8k3nvCcZ8g';

var metadataRequestTimeout = 30000;

describe('Updating workspace metadata', () => {
  let compendium_id = '';
  let newMetadata = {
    'o2r': {
      'title': 'New title on the block for a workspace upload',
      'author': 'npm test!'
    }
  };

  let j5 = request.jar();
  let ck5 = request.cookie('connect.sid=' + cookie_o2r);
  j5.setCookie(ck5, global.test_host);

  let req_doc_workspace = {
    method: 'PUT',
    jar: j5,
    json: newMetadata,
    timeout: metadataRequestTimeout
  };

  before(function (done) {
    this.timeout(60000);
    createCompendiumPostRequest('./test/erc/metatainer/data', cookie_o2r, 'workspace', (req) => {
      request(req, (err, res, body) => {
        compendium_id = JSON.parse(body).id;
        publishCandidate(compendium_id, cookie_o2r, () => {
          done();
        });
      });
    });
  });

  describe('metadata update as the authoring user', () => {
    it('should respond with HTTP 200 OK and a valid JSON document with the new title', (done) => {
      req_doc_workspace.uri = global.test_host + '/api/v1/compendium/' + compendium_id + '/metadata';
      request(req_doc_workspace, (err, res, body) => {
        assert.ifError(err);
        assert.equal(res.statusCode, 200);
        assert.isObject(body);
        assert.propertyVal(body.metadata.o2r, 'title', newMetadata.o2r.title);
        done();
      });
    }).timeout(metadataRequestTimeout * 2);
  });
});
