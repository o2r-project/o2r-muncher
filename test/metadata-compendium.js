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
const mongojs = require('mongojs');
const chai = require('chai');
chai.use(require('chai-datetime'));
const createCompendiumPostRequest = require('./util').createCompendiumPostRequest;
const publishCandidate = require('./util').publishCandidate;
const waitForJob = require('./util').waitForJob;
const startJob = require('./util').startJob;
const deleteCompendium = require('./util').deleteCompendium;

require("./setup");
const cookie_o2r = 's:C0LIrsxGtHOGHld8Nv2jedjL4evGgEHo.GMsWD5Vveq0vBt7/4rGeoH5Xx7Dd2pgZR9DvhKCyDTY';
const cookie_plain = 's:yleQfdYnkh-sbj9Ez--_TWHVhXeXNEgq.qRmINNdkRuJ+iHGg5woRa9ydziuJ+DzFG9GnAZRvaaM';
const cookie_admin = 's:hJRjapOTVCEvlMYCb8BXovAOi2PEOC4i.IEPb0lmtGojn2cVk2edRuomIEanX6Ddz87egE5Pe8UM';
const cookie_editor = 's:xWHihqZq6jEAObwbfowO5IwdnBxohM7z.VxqsRC5A1VqJVspChcxVPuzEKtRE+aKLF8k3nvCcZ8g';

describe('compendium metadata', () => {
  var db = mongojs('localhost/muncher', ['compendia']);

  after(function (done) {
    db.close();
    done();
  });

  describe('GET /api/v1/compendium/<id> and checking contents of compendium metadata', () => {
    let compendium_id = '';
    let metadata = {};

    before(function (done) {
      this.timeout(90000);
      db.compendia.drop(function (err, doc) {
        createCompendiumPostRequest('./test/erc/metatainer', cookie_o2r, 'compendium', (req) => {
          request(req, (err, res, body) => {
            compendium_id = JSON.parse(body).id;
            publishCandidate(compendium_id, cookie_o2r, () => {
              request(global.test_host + '/api/v1/compendium/' + compendium_id, (err, res, body) => {
                assert.ifError(err);
                let response = JSON.parse(body);
                metadata = response.metadata;
                done();
              });
            });
          });
        });
      });
    });

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

    function assertMimeType(file) {
      if (file.extension) {
        switch (file.extension) {
          case (".txt"):
            assert.propertyVal(file, "type", "text/plain");
            break;
          case (".html"):
            assert.propertyVal(file, "type", "text/html");
            break;
          case (".yml"):
            assert.propertyVal(file, "type", "text/yaml");
            break;
          case (".tex"):
            assert.propertyVal(file, "type", "application/x-tex");
            break;
          case (".rdata"):
          case (".rda"):
            assert.propertyVal(file, "type", "application/x-r-data");
            break;
          case (".r"):
            assert.propertyVal(file, "type", "script/x-R");
            break;
          case (".rmd"):
            assert.notProperty(file, "type");
            break;
          default:
            break;
        }
      }
    }

    it('should contain correct non-empty title', (done) => {
      assert.property(metadata.o2r, 'title');
      assert.isNotEmpty(metadata.o2r, 'title');
      assert.include(metadata.o2r.title, 'This is the title');
      done();
    });

    it('should contain correct description', (done) => {
      assert.property(metadata.o2r, 'description');
      assert.include(metadata.o2r.description, 'Suspendisse ac ornare ligula.');
      done();
    });

    it('should contain correct main file', (done) => {
      assert.property(metadata.o2r, 'mainfile');
      assert.propertyVal(metadata.o2r, 'mainfile', path.join(config.bagit.payloadDirectory, 'document.Rmd'));
      done();
    });

    it('should contain correct display file', (done) => {
      assert.property(metadata.o2r, 'displayfile');
      assert.propertyVal(metadata.o2r, 'displayfile', path.join(config.bagit.payloadDirectory, 'document.html'));
      done();
    });

    it('should contain the correctly extracted compendium identifier in the raw metadata', (done) => {
      assert.property(metadata.raw, 'id');
      assert.propertyVal(metadata.raw, 'id', '66b173cb682d6');
      done();
    });

    it('should contain creators array with all author names', (done) => {
      assert.property(metadata.o2r, 'creators');
      assert.isArray(metadata.o2r.creators);
      authorNames = metadata.o2r.creators.map(function (author) { return author.name; });
      assert.include(authorNames, 'Ted Tester');
      assert.include(authorNames, 'Carl Connauthora');
      done();
    });

    it('should contain correct mime-types (including custom types) for all files', (done) => {
      request(global.test_host + '/api/v1/compendium/' + compendium_id, (err, res, body) => {
        assert.ifError(err);
        response = JSON.parse(body);
        assert.isArray(response.files.children);
        erc_files = response.files.children.map((child) => {
          if (child.name == 'data')
            return (child.children);
          return [];
        }).reduce((a, b) => a.concat(b), []);

        erc_files.forEach(f => assertMimeType(f));
        done();
      });
    });
  });

  describe('reading from candidate compendium', () => {
    let metadata_uri = '';

    before(function (done) {
      this.timeout(90000);

      db.compendia.drop(function (err, doc) {
        createCompendiumPostRequest('./test/erc/metatainer', cookie_o2r, 'compendium', (req) => {
          request(req, (err, res, body) => {
            metadata_uri = global.test_host + '/api/v1/compendium/' + JSON.parse(body).id + '/metadata';
            done();
          });
        });
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
      'access_right': 'fake',
      'creators': [],
      'description': 'fake',
      'identifier': null,
      'title': 'New metadata',
      'keywords': [],
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

  describe('Updating compendium metadata - read test', () => {
    let compendium_id = '';
    before(function (done) {
      this.timeout(90000);
      db.compendia.drop(function (err, doc) {
        createCompendiumPostRequest('./test/erc/metatainer', cookie_o2r, 'compendium', (req) => {
          request(req, (err, res, body) => {
            compendium_id = JSON.parse(body).id;
            publishCandidate(compendium_id, cookie_o2r, () => {
              done();
            });
          });
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
      this.timeout(90000);
      db.compendia.drop(function (err, doc) {
        createCompendiumPostRequest('./test/erc/metatainer', cookie_o2r, 'compendium', (req) => {
          request(req, (err, res, body) => {
            compendium_id = JSON.parse(body).id;
            publishCandidate(compendium_id, cookie_o2r, () => {
              done();
            });
          });
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
      this.timeout(90000);
      db.compendia.drop(function (err, doc) {
        createCompendiumPostRequest('./test/erc/metatainer', cookie_o2r, 'compendium', (req) => {
          request(req, (err, res, body) => {
            compendium_id = JSON.parse(body).id;
            publishCandidate(compendium_id, cookie_o2r, () => {
              done();
            });
          });
        });
      });
    });

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
        assert.include(body.metadata.o2r.title, 'New metadata');
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
        assert.propertyVal(response.metadata.o2r, 'title', 'New metadata');
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
          'access_right': 'fake',
          'creators': [],
          'description': 'fake',
          'identifier': null,
          'title': 'New metadata by editor',
          'keywords': [],
          'communities': null,
          'license': {
            'data': 'wtf license'
          },
          'publication_date': '1970-01-01',
          'publication_type': 'test',
          'mainfile': 'test.R',
          'displayfile': 'test.html'
        }
      },
      timeout: 10000
    };

    before(function (done) {
      this.timeout(90000);
      db.compendia.drop(function (err, doc) {
        createCompendiumPostRequest('./test/erc/metatainer', cookie_o2r, 'compendium', (req) => {
          request(req, (err, res, body) => {
            compendium_id = JSON.parse(body).id;
            publishCandidate(compendium_id, cookie_o2r, () => {
              done();
            });
          });
        });
      });
    });

    it('should respond with a valid JSON document with the updated metadata', (done) => {
      req_doc_editor.uri = global.test_host + '/api/v1/compendium/' + compendium_id + '/metadata';
      request(req_doc_editor, (err, res, body) => {
        assert.ifError(err);
        assert.isObject(body);
        assert.include(body.metadata.o2r.title, 'New metadata by editor');
        done();
      });
    }).timeout(20000);

    it('should have the updated metadata in the metadata section', (done) => {
      request(global.test_host + '/api/v1/compendium/' + compendium_id, (err, res, body) => {
        assert.ifError(err);
        let response = JSON.parse(body);
        assert.propertyVal(response.metadata.o2r, 'title', 'New metadata by editor');
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
      this.timeout(90000);
      db.compendia.drop(function (err, doc) {
        createCompendiumPostRequest('./test/erc/metatainer', cookie_o2r, 'compendium', (req) => {
          request(req, (err, res, body) => {
            compendium_id = JSON.parse(body).id;
            publishCandidate(compendium_id, cookie_o2r, () => {
              done();
            });
          });
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
      this.timeout(90000);
      db.compendia.drop(function (err, doc) {
        createCompendiumPostRequest('./test/erc/metatainer', cookie_o2r, 'compendium', (req) => {
          request(req, (err, res, body) => {
            compendium_id = JSON.parse(body).id;
            publishCandidate(compendium_id, cookie_o2r, () => {
              done();
            });
          });
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

describe('compendium metadata and the compendium configuration file', () => {
  var db = mongojs('localhost/muncher', ['compendia', 'jobs']);

  before(function (done) {
    db.compendia.drop(function (err, doc) {
      db.jobs.drop(function (err, doc) {
        db.close();
        done();
      });
    });
  });

  let compendium_id = '';
  before(function (done) {
    this.timeout(180000);
    createCompendiumPostRequest('./test/erc/step_check', cookie_o2r, 'compendium', (req) => {
      request(req, (err, res, body) => {
        compendium_id = JSON.parse(body).id;
        publishCandidate(compendium_id, cookie_o2r, () => {
          done();
        });
      });
    });
  });

  describe('Updating compendium metadata must also update compendium configuration file (erc.yml)', () => {
    it('should have the configuration file with correct content after publish', (done) => {
      request(global.test_host + '/api/v1/compendium/' + compendium_id + '/data/data/' + config.bagtainer.configFile.name, (err, res, body) => {
        assert.ifError(err);
        assert.include(body, 'main: doc.Rmd');
        assert.include(body, 'display: test.html');
        done();
      });
    });

    it('should complete a job', (done) => {
      startJob(compendium_id, id => {
        waitForJob(id, (finalStatus) => {
          assert.equal(finalStatus, 'success');
          done();
        });
      });
    }).timeout(180000);

    it('should have updated the configuration file after updating the metadata', (done) => {
      let j2 = request.jar();
      let ck2 = request.cookie('connect.sid=' + cookie_o2r);
      j2.setCookie(ck2, global.test_host);

      let req_doc_o2r = {
        method: 'PUT',
        jar: j2,
        json: {
          'o2r': {
            'access_right': 'fake',
            'creators': [],
            'description': 'fake',
            'identifier': null,
            'title': 'New title on the block',
            'keywords': [],
            'communities': null,
            'license': {
              'data': 'wtf license'
            },
            'publication_date': '1970-01-01',
            'publication_type': 'test',
            'mainfile': 'data/test.R',
            'displayfile': 'data/wrongUpdate.html'
          }
        },
        timeout: 60000
      };

      req_doc_o2r.uri = global.test_host + '/api/v1/compendium/' + compendium_id + '/metadata';
      request(req_doc_o2r, (err, res, body) => {
        assert.ifError(err);

        request(global.test_host + '/api/v1/compendium/' + compendium_id + '/data/data/' + config.bagtainer.configFile.name, (err, res, body) => {
          assert.ifError(err);
          assert.include(body, 'main: test.R');
          assert.include(body, 'display: wrongUpdate.html');
          done();
        });
      });
    }).timeout(60000);

    it('should fail subsequent job (step: check) because of the incorrect configuration file', (done) => {
      startJob(compendium_id, id => {
        waitForJob(id, (finalStatus) => {
          assert.equal(finalStatus, 'failure');
          request(global.test_host + '/api/v1/job/' + id + '?steps=all', (err, res, body) => {
            assert.ifError(err);
            response = JSON.parse(body);
            assert.propertyVal(response.steps.check, 'checkSuccessful', false);
            assert.include(JSON.stringify(response.steps.check.errors), 'wrongUpdate.html');
            done();
          });
        });
      });
    }).timeout(90000);
  });
});

describe('compendium metadata extraction from the compendium configuration file', () => {
  var db = mongojs('localhost/muncher', ['compendia', 'jobs']);

  let compendium_id = '';
  let metadata_o2r = {};
  let j = request.jar();
  let ck = request.cookie('connect.sid=' + cookie_o2r);
  j.setCookie(ck, global.test_host);

  before(function (done) {
    this.timeout(180000);
    db.compendia.drop(function (err, doc) {
      db.jobs.drop(function (err, doc) {
        createCompendiumPostRequest('./test/erc/metatainer-licenses', cookie_o2r, 'compendium', (req) => {
          request(req, (err, res, body) => {
            compendium_id = JSON.parse(body).id;
            db.close();
            done();
          });
        });
      });
    });
  });

  it('should have the found the configured licenses and brokered them from raw to o2r metadata during load', (done) => {
    request({
      method: 'GET',
      uri: global.test_host + '/api/v1/compendium/' + compendium_id + '/metadata',
      jar: j
    }, (err, res, body) => {
      assert.ifError(err);
      response = JSON.parse(body);
      metadata_o2r.o2r = response.metadata.o2r;

      assert.property(response.metadata.o2r, 'license');
      assert.propertyVal(response.metadata.o2r.license, 'code', 'Apache-2.0');
      assert.propertyVal(response.metadata.o2r.license, 'data', 'ODbL-1.0');
      assert.propertyVal(response.metadata.o2r.license, 'text', 'CC0-1.0');
      assert.propertyVal(response.metadata.o2r.license, 'metadata', 'license-md.txt');
      done();
    });
  });

  it('should be possible to publish the compendium without any metadata editing', (done) => {
    let updateMetadata = {
      uri: global.test_host + '/api/v1/compendium/' + compendium_id + '/metadata',
      method: 'PUT',
      jar: j,
      timeout: 10000,
      json: metadata_o2r
    };
    request(updateMetadata, (err, res, body) => {
      assert.ifError(err);
      assert.equal(res.statusCode, 200);
      assert.isObject(body);
      assert.doesNotHaveAnyKeys(body, ['error', 'log']);
      assert.notInclude(JSON.stringify(body), '!invalid');
      assert.propertyVal(body, 'id', compendium_id);
      done();
    });
  }).timeout(20000);

});