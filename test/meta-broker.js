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

describe('Brokering compendium metadata', () => {
  let compendium_id = '';
  before(function (done) {
    let req = createCompendiumPostRequest('./test/erc/metatainer', cookie_o2r);
    this.timeout(60000);

    request(req, (err, res, body) => {
      assert.ifError(err);
      let response = JSON.parse(body);
      assert.notProperty(response, 'error');
      compendium_id = response.id;

      let data = {
        o2r: {
          title: 'New brokered title on the block'
        }
      };
      let j2 = request.jar();
      let ck2 = request.cookie('connect.sid=' + cookie_o2r);
      j2.setCookie(ck2, global.test_host);

      let req_doc_o2r = {
        method: 'PUT',
        jar: j2,
        json: data,
        timeout: 20000
      };

      req_doc_o2r.uri = global.test_host + '/api/v1/compendium/' + compendium_id + '/metadata';
      request(req_doc_o2r, (err, res, body) => {
        assert.ifError(err);
        done();
      });
    });
  });

  describe('PUT /api/v1/compendium/<id of loaded compendium>/metadata with author user', () => {
    it('should have the brokered metadata for zenodo', (done) => {
      request(global.test_host + '/api/v1/compendium/' + compendium_id, (err, res, body) => {
        assert.ifError(err);
        let response = JSON.parse(body);
        assert.property(response, 'metadata');
        assert.property(response.metadata, 'zenodo');
        assert.property(response.metadata.zenodo, 'metadata');
        assert.property(response.metadata.zenodo.metadata, 'title');
        assert.propertyVal(response.metadata.zenodo.metadata, 'title', 'New brokered title on the block');
        done();
      });
    }).timeout(20000);
  });

});
