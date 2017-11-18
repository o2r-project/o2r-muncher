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
const path = require('path');
const sleep = require('sleep');
const chai = require('chai');
chai.use(require('chai-datetime'));
const createCompendiumPostRequest = require('./util').createCompendiumPostRequest;
const publishCandidate = require('./util').publishCandidate;

require("./setup");
const cookie_o2r = 's:C0LIrsxGtHOGHld8Nv2jedjL4evGgEHo.GMsWD5Vveq0vBt7/4rGeoH5Xx7Dd2pgZR9DvhKCyDTY';
const cookie_plain = 's:yleQfdYnkh-sbj9Ez--_TWHVhXeXNEgq.qRmINNdkRuJ+iHGg5woRa9ydziuJ+DzFG9GnAZRvaaM';
const cookie_admin = 's:hJRjapOTVCEvlMYCb8BXovAOi2PEOC4i.IEPb0lmtGojn2cVk2edRuomIEanX6Ddz87egE5Pe8UM';
const cookie_editor = 's:xWHihqZq6jEAObwbfowO5IwdnBxohM7z.VxqsRC5A1VqJVspChcxVPuzEKtRE+aKLF8k3nvCcZ8g';


describe('compendium metadata', () => {
  let compendium_id = '';
  before(function (done) {
    let req = createCompendiumPostRequest('./test/erc/metatainer', cookie_o2r);
    this.timeout(60000);

    request(req, (err, res, body) => {
      compendium_id = JSON.parse(body).id;
      publishCandidate(compendium_id, cookie_o2r, () => {
        done();
      });
    });
  });

  describe('GET /api/v1/compendium/<id>', () => {
    it('should respond with HTTP 200 OK', (done) => {
      request(global.test_host + '/api/v1/compendium', (err, res) => {
        assert.ifError(err);
        assert.equal(res.statusCode, 200);
        done();
      });
    });

    it('should respond with a valid JSON document', (done) => {
      request(global.test_host + '/api/v1/compendium', (err, res, body) => {
        assert.ifError(err);
        assert.isObject(JSON.parse(body));
        done();
      });
    });

    it('should respond with document containing metadata properties', (done) => {
      request(global.test_host + '/api/v1/compendium/' + compendium_id, (err, res, body) => {
        assert.ifError(err);
        let response = JSON.parse(body);
        assert.property(response, 'metadata');
        done();
      });
    });
  });

  describe('checking contents of compendium metadata', () => {
    let metadata = {};
    let main_file = 'document.Rmd';
    let display_file = 'document.html';

    it('should response with document', (done) => {
      request(global.test_host + '/api/v1/compendium/' + compendium_id, (err, res, body) => {
        assert.ifError(err);
        let response = JSON.parse(body);
        assert.property(response, 'metadata');
        assert.property(response.metadata, 'o2r');
        metadata = response.metadata.o2r;
        assert.propertyVal(response, 'id', compendium_id);
        done();
      });
    });

    it('should contain correct non-empty title', (done) => {
      assert.property(metadata, 'title');
      assert.isNotEmpty(metadata, 'title');
      assert.include(metadata.title, 'This is the title');
      done();
    });

    it('should contain correct description', (done) => {
      assert.property(metadata, 'description');
      assert.include(metadata.description, 'Suspendisse ac ornare ligula.');
      done();
    });

    it('should contain correct main file', (done) => {
      assert.property(metadata, 'mainfile');
      assert.propertyVal(metadata, 'mainfile', path.join(config.bagit.payloadDirectory, main_file));
      done();
    });

    it('should contain correct display file', (done) => {
      assert.property(metadata, 'displayfile');
      assert.propertyVal(metadata, 'displayfile', path.join(config.bagit.payloadDirectory, display_file));
      done();
    });

    it('should contain the correct erc identifier', (done) => {
      assert.property(metadata, 'ercIdentifier');
      assert.propertyVal(metadata, 'ercIdentifier', compendium_id);
      done();
    });

    it('should contain creators array with all author names', (done) => {
      assert.property(metadata, 'creators');
      assert.isArray(metadata.creators);
      let authorNames = metadata.creators.map(function (author) { return author.name; });
      assert.include(authorNames, 'Ted Tester');
      assert.include(authorNames, 'Carl Connauthora');
      done();
    });
  });

  describe('reading from candidate compendium', () => {
    let metadata_uri = '';

    before(function (done) {
      let req = createCompendiumPostRequest('./test/erc/metatainer', cookie_o2r);
      this.timeout(60000);

      request(req, (err, res, body) => {
        metadata_uri = global.test_host + '/api/v1/compendium/' + JSON.parse(body).id + '/metadata';
        done();
      });
    });

    it('should respond with HTTP 401 and valid JSON document when accessing metadata directly', (done) => {
      request(metadata_uri, (err, res, body) => {
        assert.ifError(err);
        assert.equal(res.statusCode, 401);
        assert.isObject(JSON.parse(body));
        done();
      });
    });

    it('should respond with error message when accessing metadata directly', (done) => {
      request(metadata_uri, (err, res, body) => {
        assert.ifError(err);
        let response = JSON.parse(body);
        assert.property(response, 'error');
        done();
      });
    });

    it('should respond with HTTP 403 and valid JSON document when accessing metadata directly as _another user_', (done) => {
      let j = request.jar();
      let ck = request.cookie('connect.sid=' + cookie_plain);
      j.setCookie(ck, global.test_host);

      request({
        uri: metadata_uri,
        jar: j,
      }, (err, res, body) => {
        assert.ifError(err);
        assert.equal(res.statusCode, 403);
        assert.isObject(JSON.parse(body));
        done();
      });
    });

    it('should respond with HTTP 200 and valid JSON document when accessing metadata directly _as the author_', (done) => {
      let j = request.jar();
      let ck = request.cookie('connect.sid=' + cookie_o2r);
      j.setCookie(ck, global.test_host);

      request({
        uri: metadata_uri,
        jar: j,
      }, (err, res, body) => {
        assert.ifError(err);
        assert.equal(res.statusCode, 200);
        assert.isObject(JSON.parse(body));
        done();
      });
    });

    it('should respond with metadata when accessing metadata directly _as the author_', (done) => {
      let j = request.jar();
      let ck = request.cookie('connect.sid=' + cookie_o2r);
      j.setCookie(ck, global.test_host);

      request({
        uri: metadata_uri,
        jar: j,
      }, (err, res, body) => {
        assert.ifError(err);
        let response = JSON.parse(body);
        assert.property(response, 'id');
        assert.notProperty(response, 'candidate');
        done();
      });
    });
  });

  let newMetadata = {
    'o2r': {
      'title': 'New title on the block',
      'author': 'npm test!'
    }
  };

  describe('Updating compendium metadata - read test', () => {
    let compendium_id = '';
    before(function (done) {
      let req = createCompendiumPostRequest('./test/erc/metatainer', cookie_o2r);
      this.timeout(60000);

      request(req, (err, res, body) => {
        compendium_id = JSON.parse(body).id;
        publishCandidate(compendium_id, cookie_o2r, () => {
          done();
        });
      });
    });

    it('should respond with HTTP 200 OK', (done) => {
      request(global.test_host + '/api/v1/compendium/' + compendium_id + '/metadata', (err, res, body) => {
        assert.ifError(err);
        assert.equal(res.statusCode, 200);
        done();
      });
    });
    it('should respond with a valid JSON document', (done) => {
      request(global.test_host + '/api/v1/compendium/' + compendium_id + '/metadata', (err, res, body) => {
        assert.ifError(err);
        assert.isObject(JSON.parse(body));
        done();
      });
    });
    it('should respond with document containing _only_ the o2r metadata properties', (done) => {
      request(global.test_host + '/api/v1/compendium/' + compendium_id + '/metadata', (err, res, body) => {
        assert.ifError(err);
        let response = JSON.parse(body);
        assert.property(response, 'metadata');
        assert.property(response, 'id');
        assert.notProperty(response, 'raw');
        assert.property(response.metadata, 'o2r');
        assert.notProperty(response.metadata, 'raw');
        assert.notProperty(response.metadata, 'zenodo');
        assert.notProperty(response.metadata, 'orcid');
        assert.notProperty(response.metadata, 'cris');

        assert.propertyVal(response.metadata.o2r, 'title', 'This is the title: it contains a colon');
        done();
      });
    });
  });

  describe('Updating compendium metadata with wrong user', () => {
    let compendium_id = '';

    let j = request.jar();
    let ck = request.cookie('connect.sid=' + cookie_plain);
    j.setCookie(ck, global.test_host);

    let req_doc_plain = {
      method: 'PUT',
      jar: j,
      json: newMetadata,
      timeout: 10000
    };

    before(function (done) {
      let req = createCompendiumPostRequest('./test/erc/metatainer', cookie_o2r);
      this.timeout(60000);

      request(req, (err, res, body) => {
        compendium_id = JSON.parse(body).id;
        publishCandidate(compendium_id, cookie_o2r, () => {
          done();
        });
      });
    });

    it('should respond with HTTP 401', (done) => {
      req_doc_plain.uri = global.test_host + '/api/v1/compendium/' + compendium_id + '/metadata';
      request(req_doc_plain, (err, res, body) => {
        assert.ifError(err);
        assert.equal(res.statusCode, 401);
        done();
      });
    }).timeout(20000);

    it('should respond with a valid JSON document with error message', (done) => {
      req_doc_plain.uri = global.test_host + '/api/v1/compendium/' + compendium_id + '/metadata';
      request(req_doc_plain, (err, res, body) => {
        assert.ifError(err);
        assert.isObject(body);
        assert.propertyVal(body, 'error', 'not authorized to edit/view ' + compendium_id);
        done();
      });
    }).timeout(20000);
  });

  describe('Updating compendium metadata with *author* user', () => {
    let j2 = request.jar();
    let ck2 = request.cookie('connect.sid=' + cookie_o2r);
    j2.setCookie(ck2, global.test_host);

    let req_doc_o2r = {
      method: 'PUT',
      jar: j2,
      json: newMetadata,
      timeout: 10000
    };

    before(function (done) {
      let req = createCompendiumPostRequest('./test/erc/metatainer', cookie_o2r);
      this.timeout(60000);

      request(req, (err, res, body) => {
        compendium_id = JSON.parse(body).id;
        publishCandidate(compendium_id, cookie_o2r, () => {
          sleep.sleep(30);
          done();
        });
      });
    });

    it('should respond with HTTP 200', (done) => {
      req_doc_o2r.uri = global.test_host + '/api/v1/compendium/' + compendium_id + '/metadata';
      request(req_doc_o2r, (err, res, body) => {
        assert.ifError(err);
        console.log(body);
        assert.equal(res.statusCode, 200);
        done();
      });
    }).timeout(20000);

    it('should respond with a valid JSON document with the updated metadata', (done) => {
      req_doc_o2r.uri = global.test_host + '/api/v1/compendium/' + compendium_id + '/metadata';
      request(req_doc_o2r, (err, res, body) => {
        assert.ifError(err);
        assert.isObject(body);
        assert.include(body.metadata.o2r.title, 'New title on the block');
        done();
      });
    }).timeout(20000);

    it('should have the updated metadata in the metadata section', (done) => {
      request(global.test_host + '/api/v1/compendium/' + compendium_id, (err, res, body) => {
        assert.ifError(err);
        let response = JSON.parse(body);
        assert.property(response, 'metadata');
        assert.property(response.metadata, 'o2r');
        assert.property(response.metadata, 'raw');
        assert.property(response.metadata.o2r, 'title');
        //assert.property(response.metadata.o2r, 'author');
        assert.propertyVal(response.metadata.o2r, 'title', 'New title on the block');
        //assert.propertyVal(response.metadata.o2r, 'author', 'npm test!');
        assert.notProperty(response.metadata.o2r, 'abstract');
        done();
      });
    });
  });

  describe('Updating compendium metadata with *editor* user', () => {
    let j3 = request.jar();
    let ck3 = request.cookie('connect.sid=' + cookie_editor);
    j3.setCookie(ck3, global.test_host);

    let req_doc_editor = {
      method: 'PUT',
      jar: j3,
      json: {
        'o2r': {
          'title': 'New edited title on the block',
          'author': 'editor!'
        }
      },
      timeout: 10000
    };

    before(function (done) {
      let req = createCompendiumPostRequest('./test/erc/metatainer', cookie_o2r);
      this.timeout(60000);

      request(req, (err, res, body) => {
        compendium_id = JSON.parse(body).id;
        publishCandidate(compendium_id, cookie_o2r, () => {
          done();
        });
      });
    });

    it('should respond with a valid JSON document with the updated metadata', (done) => {
      req_doc_editor.uri = global.test_host + '/api/v1/compendium/' + compendium_id + '/metadata';
      request(req_doc_editor, (err, res, body) => {
        assert.ifError(err);
        assert.isObject(body);
        assert.include(body.metadata.o2r.title, 'New edited title on the block');
        done();
      });
    }).timeout(20000);
    it('should have the updated metadata in the metadata section', (done) => {
      request(global.test_host + '/api/v1/compendium/' + compendium_id, (err, res, body) => {
        assert.ifError(err);
        let response = JSON.parse(body);
        assert.propertyVal(response.metadata.o2r, 'title', 'New edited title on the block');
        done();
      });
    }).timeout(20000);
  });

  describe('Updating compendium metadata with invalid payload', () => {
    let data = "{ \
      'o2r': { \
        [] \
        'title': // yes this is invalid by purpose \
      } \
    }";
    let j = request.jar();
    let ck = request.cookie('connect.sid=' + cookie_o2r);
    j.setCookie(ck, global.test_host);

    let req = {
      method: 'PUT',
      jar: j,
      json: data,
      timeout: 10000
    };

    before(function (done) {
      let req = createCompendiumPostRequest('./test/erc/metatainer', cookie_o2r);
      this.timeout(60000);

      request(req, (err, res, body) => {
        compendium_id = JSON.parse(body).id;
        publishCandidate(compendium_id, cookie_o2r, () => {
          done();
        });
      });
    });

    it('should respond with HTTP 400', (done) => {
      req.uri = global.test_host + '/api/v1/compendium/' + compendium_id + '/metadata';
      request(req, (err, res, body) => {
        assert.ifError(err);
        assert.equal(res.statusCode, 400);
        done();
      });
    }).timeout(20000);
    it('should respond with a valid JSON document and error message', (done) => {
      req.uri = global.test_host + '/api/v1/compendium/' + compendium_id + '/metadata';
      request(req, (err, res, body) => {
        assert.ifError(err);
        assert.include(body, 'SyntaxError');
        done();
      });
    }).timeout(20000);
  });

  describe('Updating compendium metadata with invalid payload structure', () => {
    let data = {
      'not_o2r': {
        'title': 'New title on the block (NTOTB)'
      }
    };
    let j = request.jar();
    let ck = request.cookie('connect.sid=' + cookie_o2r);
    j.setCookie(ck, global.test_host);

    let req = {
      method: 'PUT',
      jar: j,
      json: data,
      timeout: 10000
    };

    before(function (done) {
      let req = createCompendiumPostRequest('./test/erc/metatainer', cookie_o2r);
      this.timeout(60000);

      request(req, (err, res, body) => {
        compendium_id = JSON.parse(body).id;
        publishCandidate(compendium_id, cookie_o2r, () => {
          done();
        });
      });
    });

    it('should respond with HTTP 422', (done) => {
      req.uri = global.test_host + '/api/v1/compendium/' + compendium_id + '/metadata';
      request(req, (err, res, body) => {
        assert.ifError(err);
        assert.equal(res.statusCode, 422);
        done();
      });
    });
    it('should respond with a valid JSON document and error message', (done) => {
      req.uri = global.test_host + '/api/v1/compendium/' + compendium_id + '/metadata';
      request(req, (err, res, body) => {
        assert.ifError(err);
        assert.isObject(body);
        assert.property(body, 'error');
        assert.propertyVal(body, 'error', "JSON with root element 'o2r' required");
        done();
      });
    });
  });
});

