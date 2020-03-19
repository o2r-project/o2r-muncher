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
const chai = require('chai');
chai.use(require('chai-datetime'));
const createCompendiumPostRequest = require('./util').createCompendiumPostRequest;
const mongojs = require('mongojs');

require("./setup");
const cookie_o2r = 's:C0LIrsxGtHOGHld8Nv2jedjL4evGgEHo.GMsWD5Vveq0vBt7/4rGeoH5Xx7Dd2pgZR9DvhKCyDTY';

describe('Brokering compendium metadata', () => {
  var db = mongojs('localhost/muncher', ['compendia']);

  after(function (done) {
    db.close();
    done();
  });

  let compendium_id = '';
  
  before(function (done) {
    this.timeout(90000);
    db.compendia.drop(function (err, doc) {
      createCompendiumPostRequest('./test/erc/metatainer', cookie_o2r, 'compendium', (req) => {
        request(req, (err, res, body) => {
          assert.ifError(err);
          let response = JSON.parse(body);
          assert.notProperty(response, 'error');
          compendium_id = response.id;

          let data = {
            'o2r': {
              'access_right': 'fake',
              'creators': [],
              'description': 'fake',
              'identifier': null,
              'title': 'New brokered title',
              'keywords': ['zen', 'o', 'do'],
              'communities': null,
              'license': {
                'data': 'wtf license'
              },
              'publication_date': '1970-01-01',
              'publication_type': 'test',
              'mainfile': 'test.R',
              'displayfile': 'test.html'
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
    });
  });

  describe('Metadata after publishing', () => {
    it('should have the brokered metadata for Zenodo', (done) => {
      request(global.test_host + '/api/v1/compendium/' + compendium_id, (err, res, body) => {
        assert.ifError(err);
        let response = JSON.parse(body);
        assert.property(response, 'metadata');
        assert.property(response.metadata, 'zenodo');
        assert.property(response.metadata.zenodo, 'metadata');
        assert.property(response.metadata.zenodo.metadata, 'title');
        assert.propertyVal(response.metadata.zenodo.metadata, 'title', 'New brokered title');
        assert.includeMembers(response.metadata.zenodo.metadata.keywords, ['zen', 'do']);
        done();
      });
    }).timeout(20000);
  });

});
