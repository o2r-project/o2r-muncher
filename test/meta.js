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
const chai = require('chai');
chai.use(require('chai-datetime'));
const createCompendiumPostRequest = require('./util').createCompendiumPostRequest;

require("./setup")
const cookie_o2r = 's:C0LIrsxGtHOGHld8Nv2jedjL4evGgEHo.GMsWD5Vveq0vBt7/4rGeoH5Xx7Dd2pgZR9DvhKCyDTY';
const cookie_plain = 's:yleQfdYnkh-sbj9Ez--_TWHVhXeXNEgq.qRmINNdkRuJ+iHGg5woRa9ydziuJ+DzFG9GnAZRvaaM';
const cookie_admin = 's:hJRjapOTVCEvlMYCb8BXovAOi2PEOC4i.IEPb0lmtGojn2cVk2edRuomIEanX6Ddz87egE5Pe8UM';
const cookie_editor = 's:xWHihqZq6jEAObwbfowO5IwdnBxohM7z.VxqsRC5A1VqJVspChcxVPuzEKtRE+aKLF8k3nvCcZ8g';

describe('Reading compendium metadata', () => {
  let compendium_id = '';
  before(function (done) {
    let req = createCompendiumPostRequest('./test/bagtainers/metatainer', cookie_o2r);
    this.timeout(10000);

    request(req, (err, res, body) => {
      compendium_id = JSON.parse(body).id;
      done();
    });
  });

  describe('GET /api/v1/compendium/<id of loaded compendium>', () => {
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

  describe('Metadata objects contents for compendium', () => {
    var metadata = {};
    it('should response with document', (done) => {
      request(global.test_host + '/api/v1/compendium/' + compendium_id, (err, res, body) => {
        assert.ifError(err);
        let response = JSON.parse(body);
        metadata = response.metadata[config.meta.extract.targetElement];
        done();
        //console.log(JSON.stringify(metadata));
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
    let main_file = 'document.Rmd';
    it('should contain non-empty paperSource', (done) => {
      assert.property(metadata, 'paperSource');
      assert.propertyVal(metadata, 'paperSource', main_file);
      done();
    });
    it('should contain filepath information', (done) => {
      assert.property(metadata, 'file');
      done();
    });
    it('should contain correct filepath', (done) => {
      assert.property(metadata.file, 'filepath');
      assert.propertyVal(metadata.file, 'filepath', compendium_id + '/data/' + main_file);
      done();
    });
    it('should contain correct file', (done) => {
      assert.property(metadata.file, 'filename');
      assert.propertyVal(metadata.file, 'filename', main_file);
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

describe('Updating compendium metadata', () => {
  let compendium_id = '';
  before(function (done) {
    let req = createCompendiumPostRequest('./test/bagtainers/metatainer', cookie_o2r);
    this.timeout(10000);

    request(req, (err, res, body) => {
      compendium_id = JSON.parse(body).id;
      done();
    });
  });

  describe('GET /api/v1/compendium/<id of loaded compendium>/metadata', () => {
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

  let data = {
    'o2r': {
      'title': 'New title on the block',
      'author': 'npm test!'
    }
  };

  let j = request.jar();
  let ck = request.cookie('connect.sid=' + cookie_plain);
  j.setCookie(ck, global.test_host);

  let req_doc_plain = {
    method: 'PUT',
    jar: j,
    json: data,
    timeout: 10000
  };

  let j2 = request.jar();
  let ck2 = request.cookie('connect.sid=' + cookie_o2r);
  j2.setCookie(ck2, global.test_host);

  let req_doc_o2r = {
    method: 'PUT',
    jar: j2,
    json: data,
    timeout: 10000
  };

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

  describe('PUT /api/v1/compendium/<id of loaded compendium>/metadata with wrong user', () => {
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
        assert.propertyVal(body, 'error', 'not authorized to edit metadata of ' + compendium_id);
        done();
      });
    }).timeout(20000);
  });

  describe('PUT /api/v1/compendium/<id of loaded compendium>/metadata with *author* user', () => {
    it('should respond with HTTP 200', (done) => {
      req_doc_o2r.uri = global.test_host + '/api/v1/compendium/' + compendium_id + '/metadata';
      request(req_doc_o2r, (err, res, body) => {
        assert.ifError(err);
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
        assert.property(response.metadata.o2r, 'author');
        assert.propertyVal(response.metadata.o2r, 'title', 'New title on the block');
        assert.propertyVal(response.metadata.o2r, 'author', 'npm test!');
        assert.notProperty(response.metadata.o2r, 'abstract');
        assert.notProperty(response.metadata.o2r, 'file');
        done();
      });
    }).timeout(20000);
  });

  describe('PUT /api/v1/compendium/<id of loaded compendium>/metadata with *editor* user', () => {

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

  describe('PUT /api/v1/compendium/<id of loaded compendium>/metadata with invalid payload', () => {
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

  describe('PUT /api/v1/compendium/<id of loaded compendium>/metadata with invalid payload structure', () => {
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

describe('Brokering updated compendium metadata', () => {
  let compendium_id = '';
  before(function (done) {
    let req = createCompendiumPostRequest('./test/bagtainers/metatainer', cookie_o2r);
    this.timeout(10000);

    request(req, (err, res, body) => {
      compendium_id = JSON.parse(body).id;

      let data = {
        'o2r': {
          'title': 'New brokered title on the block'
        }
      };
      let j2 = request.jar();
      let ck2 = request.cookie('connect.sid=' + cookie_o2r);
      j2.setCookie(ck2, global.test_host);

      let req_doc_o2r = {
        method: 'PUT',
        jar: j2,
        json: data,
        timeout: 10000
      };

      req_doc_o2r.uri = global.test_host + '/api/v1/compendium/' + compendium_id + '/metadata';
      request(req_doc_o2r, (err, res, body) => {
        assert.ifError(err);
        done();
      });
    });
  });

  describe('PUT /api/v1/compendium/<id of loaded compendium>/metadata with author user', () => {
    it('should have the brokered metadata in the respective section', (done) => {
      console.log(global.test_host + '/api/v1/compendium/' + compendium_id);
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
