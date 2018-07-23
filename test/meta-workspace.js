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
const mongojs = require('mongojs');
const createCompendiumPostRequest = require('./util').createCompendiumPostRequest;
const publishCandidate = require('./util').publishCandidate;
const waitForJob = require('./util').waitForJob;
const startJob = require('./util').startJob;

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

  let j5 = request.jar();
  let ck5 = request.cookie('connect.sid=' + cookie_o2r);
  j5.setCookie(ck5, global.test_host);

  let req_doc_workspace = {
    method: 'PUT',
    jar: j5,
    json: newMetadata,
    timeout: metadataRequestTimeout
  };

  var db = mongojs('localhost/muncher', ['compendia', 'jobs']);

  before(function (done) {
    this.timeout(90000);
    db.compendia.drop(function (err, doc) {
      db.jobs.drop(function (err, doc) {
        createCompendiumPostRequest('./test/erc/metatainer/data', cookie_o2r, 'workspace', (req) => {
          request(req, (err, res, body) => {
            compendium_id = JSON.parse(body).id;
            publishCandidate(compendium_id, cookie_o2r, () => {
              done();
            });
          });
        });
      });
    });
  });

  after(function (done) {
    db.close();
    done();
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

  describe('metadata update fails for incomplete metadata with HTTP 400 and error message', () => {
    it('should respond with HTTP 200 OK and a valid JSON document with the new title', (done) => {
      req_doc_workspace.uri = global.test_host + '/api/v1/compendium/' + compendium_id + '/metadata';
      req_doc_workspace.json = {
        'o2r': {
          'title': 'New title on the block for a workspace upload',
          'author': 'incomplete!'
        }
      };
      request(req_doc_workspace, (err, res, body) => {
        assert.ifError(err);
        assert.equal(res.statusCode, 400);
        assert.isObject(body);
        assert.include(body.log, '!invalid');
        done();
      });
    }).timeout(metadataRequestTimeout * 2);
  });

  describe('Updating workspace metadata must also update the generated compendium configuration file (erc.yml)', () => {
    let compendium_id = '';
    before(function (done) {
      this.timeout(90000);
      createCompendiumPostRequest('./test/workspace/minimal-rmd-data', cookie_o2r, 'workspace', (req) => {
        request(req, (err, res, body) => {
          compendium_id = JSON.parse(body).id;
          publishCandidate(compendium_id, cookie_o2r, () => {
            startJob(compendium_id, id => {
              waitForJob(id, (finalStatus) => {
                done();
              });
            });
          });
        });
      });
    });

    it('should have the configuration file with correct content after generating it during first job', (done) => {
      request(global.test_host_transporter + '/api/v1/compendium/' + compendium_id + '/data/' + config.bagtainer.configFile.name, (err, res, body) => {
        assert.ifError(err);
        assert.include(body, 'main: main.Rmd');
        assert.include(body, 'display: display.html');
        done();
      });
    });

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
            'mainfile': 'test.R',
            'displayfile': 'test.html'
          }
        },
        timeout: 10000
      };

      req_doc_o2r.uri = global.test_host + '/api/v1/compendium/' + compendium_id + '/metadata';
      request(req_doc_o2r, (err, res, body) => {
        assert.ifError(err);
        request(global.test_host_transporter + '/api/v1/compendium/' + compendium_id + '/data/' + config.bagtainer.configFile.name, (err, res, body) => {
          assert.ifError(err);
          assert.include(body, 'main: test.R');
          assert.include(body, 'display: test.html');
          done();
        });
      });
    }).timeout(30000);

    it('should fail subsequent job (step: check) because of the incorrect configuration file', (done) => {
      startJob(compendium_id, id => {
        waitForJob(id, (finalStatus) => {
          assert.equal(finalStatus, 'failure');
          request(global.test_host + '/api/v1/job/' + id + '?steps=all', (err, res, body) => {
            assert.ifError(err);
            response = JSON.parse(body);
            assert.propertyVal(response.steps.check, 'checkSuccessful', false);
            done();
          });
        });
      });
    }).timeout(30000);
  });
});

describe('Publishing workspace metadata', () => {
  let compendium_id = '';

  let j = request.jar();
  let ck = request.cookie('connect.sid=' + cookie_o2r);
  j.setCookie(ck, global.test_host);

  before(function (done) {
    this.timeout(90000);
    createCompendiumPostRequest('./test/erc/metatainer/data', cookie_o2r, 'workspace', (req) => {
      request(req, (err, res, body) => {
        compendium_id = JSON.parse(body).id;
        done();
      });
    });
  });

  describe('candidate publishing fails with wrong metadata root element', () => {
    it('should respond with HTTP 422 and a valid JSON document with error message', (done) => {
      let updateMetadata = {
        uri: global.test_host + '/api/v1/compendium/' + compendium_id + '/metadata',
        method: 'PUT',
        jar: j,
        timeout: metadataRequestTimeout,
        json: {
          incomplete: 'metadata'
        }
      };

      request(updateMetadata, (err, res, body) => {
        assert.ifError(err);
        assert.equal(res.statusCode, 422);
        assert.isObject(body);
        assert.property(body, 'error');
        assert.include(body.error, 'root element');
        done();
      });
    }).timeout(metadataRequestTimeout * 2);
  });

  describe('candidate publishing fails with incomplete metadata', () => {
    it('should respond with HTTP 400 and a valid JSON document with error message and error log', (done) => {
      let updateMetadata = {
        uri: global.test_host + '/api/v1/compendium/' + compendium_id + '/metadata',
        method: 'PUT',
        jar: j,
        timeout: metadataRequestTimeout,
        json: {
          o2r: {
            title: 'title alone is not enough'
          }
        }
      };

      request(updateMetadata, (err, res, body) => {
        assert.ifError(err);
        assert.equal(res.statusCode, 400);
        assert.isObject(body);
        assert.containsAllKeys(body, ['error', 'log']);
        assert.include(body.log, '!invalid');
        assert.include(body.log, 'required property');
        done();
      });
    }).timeout(20000);

    it('should still provide the unchanged metadata after the failed publish', (done) => {
      let updateMetadata = {
        uri: global.test_host + '/api/v1/compendium/' + compendium_id + '/metadata',
        method: 'PUT',
        jar: j,
        timeout: metadataRequestTimeout,
        json: {
          o2r: {
            title: 'i should not be there'
          }
        }
      };

      request(updateMetadata, (err, res, body) => {
        assert.ifError(err);
        assert.hasAnyKeys(body, ['error'], 'an error response must be given before the actual test');
        request({
          uri: global.test_host + '/api/v1/compendium/' + compendium_id + '/metadata',
          jar: j
        }, (err, res, body) => {
          assert.ifError(err);
          response = JSON.parse(body);
          assert.isObject(response);
          assert.notInclude(response.metadata.o2r.title, 'i should not be there');
          assert.propertyVal(response.metadata.o2r, 'title', 'This is the title: it contains a colon');
          done();
        });
      });
    }).timeout(20000);
  });

  describe('candidate publishing works with valid metadata', () => {
    it('should respond with HTTP 200 OK and a valid JSON document with the new title', (done) => {
      let updateMetadata = {
        uri: global.test_host + '/api/v1/compendium/' + compendium_id + '/metadata',
        method: 'PUT',
        jar: j,
        timeout: metadataRequestTimeout,
        json: {
          // See https://github.com/o2r-project/o2r-meta/blob/master/schema/json/o2r-meta-schema.json#L131 for required elements
          o2r: {
            "access_right": "open",
            "creators": [
              {
                "orcid": "0000-0002-0166-519X",
                "name": "Ted Tester"
              },
              {
                "orcid": "0000-0003-1021-5374",
                "name": "Carl Connauthora",
                "affiliation": "N.O.N.E"
              }
            ],
            "description": "Tempus eget nunc eu, lobortis condimentum nulla.",
            "identifier": {
              "doi": null
            },
            "title": "This is the title: it contains a colon",
            "keywords": [
              "keyword",
              "another"
            ],
            "communities": [
              {
                "identifier": "o2r"
              }
            ],
            "license": {
              "uibindings": null,
              "text": null,
              "md": null,
              "data": null,
              "code": null
            },
            "publication_type": "other",
            "publication_date": "2018-03-01",
            "mainfile": "document.Rmd",
            "displayfile": "document.html"
          }
        }
      };
      request(updateMetadata, (err, res, body) => {
        assert.ifError(err);
        assert.equal(res.statusCode, 200);
        assert.isObject(body);
        assert.doesNotHaveAnyKeys(['error', 'log']);
        assert.notInclude(JSON.stringify(body), '!invalid');
        done();
      });
    }).timeout(metadataRequestTimeout * 2);
  });
});

describe('Publishing workspace without editing metadata', () => {
  let j = request.jar();
  let ck = request.cookie('connect.sid=' + cookie_o2r);
  j.setCookie(ck, global.test_host);

  describe('with licenses in the compendium configuration file', () => {
    let compendium_id = '';
    let metadata_o2r = {};

    before(function (done) {
      this.timeout(90000);
      createCompendiumPostRequest('./test/erc/metatainer-licenses/data', cookie_o2r, 'workspace', (req) => {
        request(req, (err, res, body) => {
          compendium_id = JSON.parse(body).id;

          request({
            method: 'GET',
            uri: global.test_host + '/api/v1/compendium/' + compendium_id + '/metadata',
            jar: j
          }, (err, res, body) => {
            assert.ifError(err);
            response = JSON.parse(body);
            metadata_o2r.o2r = response.metadata.o2r;
            done();
          });
        });
      });
    });

    it('should work with just returning the o2r metadata for publishing the candidate', (done) => {
      let updateMetadata = {
        url: global.test_host + '/api/v1/compendium/' + compendium_id + '/metadata',
        method: 'PUT',
        jar: j,
        timeout: metadataRequestTimeout,
        json: metadata_o2r
      };

      request(updateMetadata, (err, res, body) => {
        assert.ifError(err);
        assert.equal(res.statusCode, 200);
        assert.isObject(body);
        assert.doesNotHaveAnyKeys(['error', 'log']);
        assert.notInclude(JSON.stringify(body), '!invalid');
        done();
      });
    }).timeout(metadataRequestTimeout * 2);

    it('should have all the fields from the compendium configuration file', (done) => {
      request({
        url: global.test_host + '/api/v1/compendium/' + compendium_id + '/metadata'
      }, (err, res, body) => {
        assert.ifError(err);
        assert.equal(res.statusCode, 200);
        response = JSON.parse(body);
        assert.isObject(response);
        assert.property(response.metadata.o2r, 'license');
        assert.propertyVal(response.metadata.o2r.license, 'code', 'Apache-2.0');
        assert.propertyVal(response.metadata.o2r.license, 'data', 'ODbL-1.0');
        assert.propertyVal(response.metadata.o2r.license, 'text', 'CC0-1.0');
        assert.propertyVal(response.metadata.o2r.license, 'metadata', 'license-md.txt');
        done();
      });
    });
  });

  describe('with licenses in the Rmd header', () => {
    let compendium_id = '';
    let metadata_o2r = {};

    before(function (done) {
      this.timeout(90000);
      createCompendiumPostRequest('./test/workspace/with-metadata', cookie_o2r, 'workspace', (req) => {
        request(req, (err, res, body) => {
          compendium_id = JSON.parse(body).id;

          request({
            method: 'GET',
            uri: global.test_host + '/api/v1/compendium/' + compendium_id + '/metadata',
            jar: j
          }, (err, res, body) => {
            assert.ifError(err);
            response = JSON.parse(body);
            metadata_o2r.o2r = response.metadata.o2r;
            done();
          });
        });
      });
    });

    it('should work with just returning the o2r metadata for publishing the candidate', (done) => {
      let updateMetadata = {
        url: global.test_host + '/api/v1/compendium/' + compendium_id + '/metadata',
        method: 'PUT',
        jar: j,
        timeout: metadataRequestTimeout,
        json: metadata_o2r
      };

      request(updateMetadata, (err, res, body) => {
        assert.ifError(err);
        assert.equal(res.statusCode, 200);
        assert.isObject(body);
        assert.doesNotHaveAnyKeys(['error', 'log']);
        assert.notInclude(JSON.stringify(body), '!invalid');
        done();
      });
    }).timeout(metadataRequestTimeout * 2);

    it('should have all the fields from the Rmd header', (done) => {
      request({
        url: global.test_host + '/api/v1/compendium/' + compendium_id + '/metadata'
      }, (err, res, body) => {
        assert.ifError(err);
        assert.equal(res.statusCode, 200);
        response = JSON.parse(body);
        assert.isObject(response);
        assert.property(response.metadata.o2r, 'license');
        assert.propertyVal(response.metadata.o2r.license, 'code', 'codelicense');
        assert.propertyVal(response.metadata.o2r.license, 'data', 'datalicense');
        assert.propertyVal(response.metadata.o2r.license, 'text', 'textlicense');
        assert.propertyVal(response.metadata.o2r.license, 'metadata', 'metadatalicense');
        
        assert.propertyVal(response.metadata.o2r, 'title', 'Test with metadata in Rmd header');
        assert.propertyVal(response.metadata.o2r, 'description', 'just a test with Rmd header');
        done();
      });
    });
  });

});
