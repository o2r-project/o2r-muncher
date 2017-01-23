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

describe.only('Compendium metadata', () => {
  let compendium_id = '';

  describe('POST /api/v1/compendium ./test/bagtainers/metatainer', () => {
    it('upload compendium should succeed and return an ID', (done) => {
      let req = createCompendiumPostRequest(host, './test/bagtainers/metatainer', cookie);

      request(req, (err, res, body) => {
        assert.ifError(err);
        assert.equal(res.statusCode, 200);
        assert.property(JSON.parse(body), 'id');
        compendium_id = JSON.parse(body).id;
        done();
      });
    }).timeout(10000);
  });

  describe('GET /api/v1/compendium/<id of loaded compendium>', () => {
    it('should respond with HTTP 200 OK', (done) => {
      request(host + '/api/v1/compendium', (err, res) => {
        assert.ifError(err);
        assert.equal(res.statusCode, 200);
        done();
      });
    });
    it('should respond with a valid JSON document', (done) => {
      request(host + '/api/v1/compendium', (err, res, body) => {
        assert.ifError(err);
        assert.isObject(JSON.parse(body));
        done();
      });
    });
    it('should respond with document containing metadata properties', (done) => {
      request(host + '/api/v1/compendium/' + compendium_id, (err, res, body) => {
        assert.ifError(err);
        let response = JSON.parse(body);
        assert.property(response, 'metadata');
        done();
      });
    });
  });

  describe('Metadata objects contents for compendium', () => {
    var metadata = {};
    it('should response with document', (done) => {
      request(host + '/api/v1/compendium/' + compendium_id, (err, res, body) => {
        assert.ifError(err);
        let response = JSON.parse(body);
        metadata = response.metadata[config.bagtainer.metaextract.targetElement];
        done();
      });
    });

    it('should contain non-empty title', (done) => {
      assert.property(metadata, 'title');
      assert.propertyNotVal(metadata, 'title', '');
      done();
    });
    it('should contain correct title', (done) => {
      assert.property(metadata, 'title');
      assert.include(metadata.title, 'This is the title');
      done();
    });
    it('should contain correct abstract', (done) => {
      assert.property(metadata, 'abstract');
      assert.include(metadata.abstract, 'Suspendisse ac ornare ligula.');
      done();
    });
    it('should contain non-empty paperSource', (done) => {
      assert.property(metadata, 'paperSource');
      assert.propertyNotVal(metadata, 'paperSource', '');
      done();
    });
    let main_file = 'document.Rmd';
    it('should contain correct filepath', (done) => {
      assert.property(metadata, 'filepath');
      assert.propertyVal(metadata, 'filepath', '/' + compendium_id + '/data/' + main_file);
      done();
    });
    it('should contain correct file', (done) => {
      assert.property(metadata, 'file');
      assert.propertyVal(metadata, 'file', main_file);
      done();
    });
    it('should contain the correct erc identifier', (done) => {
      assert.property(metadata, 'ercIdentifier');
      assert.propertyVal(metadata, 'ercIdentifier', compendium_id);
      done();
    });
    it('should contain author array with all author names', (done) => {
      assert.property(metadata, 'author');
      assert.isArray(metadata.author);
      let authorNames = metadata.author.map(function (author) { return author.name; });
      assert.include(authorNames, 'Ted Tester');
      assert.include(authorNames, 'Carl Connauthora');
      done();
    });
  });
});
