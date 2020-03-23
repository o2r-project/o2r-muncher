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
const createCompendiumPostRequest = require('./util').createCompendiumPostRequest;
const publishCandidate = require('./util').publishCandidate;
const publishLink = require('./util').publishLink;
const waitForJob = require('./util').waitForJob;
const mongojs = require('mongojs');

require("./setup");
const cookie_o2r = 's:C0LIrsxGtHOGHld8Nv2jedjL4evGgEHo.GMsWD5Vveq0vBt7/4rGeoH5Xx7Dd2pgZR9DvhKCyDTY';
const cookie_plain = 's:yleQfdYnkh-sbj9Ez--_TWHVhXeXNEgq.qRmINNdkRuJ+iHGg5woRa9ydziuJ+DzFG9GnAZRvaaM';
const cookie_admin = 's:hJRjapOTVCEvlMYCb8BXovAOi2PEOC4i.IEPb0lmtGojn2cVk2edRuomIEanX6Ddz87egE5Pe8UM';
const cookie_editor = 's:xWHihqZq6jEAObwbfowO5IwdnBxohM7z.VxqsRC5A1VqJVspChcxVPuzEKtRE+aKLF8k3nvCcZ8g';

describe('Public links', () => {
  var db = mongojs('localhost/muncher', ['compendia', 'publiclinks', 'jobs']);
  
  after(function (done) {
    db.close();
    done();
  });
  
  before(function (done) {
    this.timeout(30000);
    db.compendia.drop(function (err, doc) {
      db.publiclinks.drop(function (err, doc) {
        db.jobs.drop(function (err, doc) {
          done();
        });
      });
    });
  });

  describe('Author vs. link', () => {
    var compendium_id = '';

    before(function (done) {
      this.timeout(30000);
      createCompendiumPostRequest('./test/workspace/dummy', cookie_o2r, 'workspace', (req) => {
        request(req, (err, res, body) => {
          compendium_id = JSON.parse(body).id;
          done();
        });
      });
    });


    it('should return an error when trying to create', (done) => {
      let j = request.jar();
      j.setCookie(request.cookie('connect.sid=' + cookie_o2r), global.test_host);

      let req = {
        method: 'PUT',
        jar: j,
        uri: global.test_host + '/api/v1/compendium/' + compendium_id + '/link'
      };

      request(req, (err, res, body) => {
        assert.ifError(err);
        assert.equal(res.statusCode, 403);
        assert.propertyVal(JSON.parse(body), 'error', 'not allowed');
        done();
      });
    });

    it('should return an error when trying to view an existing public link as author', (done) => {
      let j = request.jar();
      j.setCookie(request.cookie('connect.sid=' + cookie_admin), global.test_host);
      let req = {
        method: 'PUT',
        jar: j,
        uri: global.test_host + '/api/v1/compendium/' + compendium_id + '/link'
      };

      // create link with admin
      request(req, (err, res, body) => {
        let link_id = JSON.parse(body).id;

        // try to view it with author
        let jAuthor = request.jar();
        jAuthor.setCookie(request.cookie('connect.sid=' + cookie_o2r), global.test_host);
        let jReq = {
          method: 'GET',
          jar: jAuthor,
          uri: global.test_host + '/api/v1/compendium/' + compendium_id + '/link'
        };

        request(jReq, (err, res, body) => {
          assert.ifError(err);
          assert.equal(res.statusCode, 403);
          assert.propertyVal(JSON.parse(body), 'error', 'not allowed');
          done();
        });
      });
    });

    it('should return an error when trying to view an existing public not logged-in', (done) => {
      let j = request.jar();
      j.setCookie(request.cookie('connect.sid=' + cookie_admin), global.test_host);
      let req = {
        method: 'PUT',
        jar: j,
        uri: global.test_host + '/api/v1/compendium/' + compendium_id + '/link'
      };

      request(req, (err, res, body) => {
        request(global.test_host + '/api/v1/compendium/' + compendium_id + '/link', (err, res, body) => {
          assert.ifError(err);
          assert.equal(res.statusCode, 401);
          assert.propertyVal(JSON.parse(body), 'error', 'user is not authenticated');
          done();
        });
      });
    });
  });

  describe('Admin creates link', () => {
    var compendium_id = '';
    let j = request.jar();
    j.setCookie(request.cookie('connect.sid=' + cookie_admin), global.test_host);
    
    before(function (done) {
      this.timeout(30000);
      createCompendiumPostRequest('./test/workspace/dummy', cookie_o2r, 'workspace', (req) => {
        request(req, (err, res, body) => {
          compendium_id = JSON.parse(body).id;
            done();
        });
      });
    });

    it('should respond with HTTP 200 OK and valid JSON document', (done) => {
      request({
        method: 'PUT',
        jar: j,
        uri: global.test_host + '/api/v1/compendium/' + compendium_id + '/link'
      }, (err, res) => {
        assert.ifError(err);
        assert.equal(res.statusCode, 200);
        assert.isObject(JSON.parse(res.body));
        done();
      });
    });

    it('should respond with document containing relevant information', (done) => {
      request({
        method: 'PUT',
        jar: j,
        uri: global.test_host + '/api/v1/compendium/' + compendium_id + '/link'
      }, (err, res, body) => {
        assert.ifError(err);
        let response = JSON.parse(body);
        assert.property(response, 'id');
        assert.property(response, 'compendium_id');
        assert.property(response, 'user');
        assert.notPropertyVal(response, 'id', compendium_id);
        assert.propertyVal(response, 'compendium_id', compendium_id);
        assert.propertyVal(response, 'user', '4242-0000-0000-4242');
        done();
      });
    });

    it('id length should match configuration', (done) => {
      request({
        method: 'PUT',
        jar: j,
        uri: global.test_host + '/api/v1/compendium/' + compendium_id + '/link'
      }, (err, res, body) => {
        assert.ifError(err);
        let response = JSON.parse(body);
        assert.equal(config.link_length, response.id.length);
        done();
      });
    });

    it('should return an error when compendium does not exist', (done) => {
      req = {
        method: 'PUT',
        jar: j,
        uri: global.test_host + '/api/v1/compendium/' + 'abcdef' + '/link'
      };

      request(req, (err, res, body) => {
        assert.ifError(err);
        assert.equal(res.statusCode, 404);
        assert.propertyVal(JSON.parse(body), 'error', 'no compendium with this id');
        done();
      });
    });

    it('should return the same link when created twice', (done) => {
      req = {
        method: 'PUT',
        jar: j,
        uri: global.test_host + '/api/v1/compendium/' + compendium_id + '/link'
      };

      request(req, (err, res, body) => {
        request(req, (err2, res2, body2) => {
          assert.equal(JSON.parse(res.body).id, JSON.parse(res2.body).id);
          done();
        });
      });
    });

    it('should not expose the link in the compendium list', (done) => {
      req = {
        method: 'PUT',
        jar: j,
        uri: global.test_host + '/api/v1/compendium/' + 'abcdef' + '/link'
      };

      request(req, (err, res, body) => {
        id = JSON.parse(body).id;
        request(global.test_host + '/api/v1/compendium/', (err, res, body) => {
          response = JSON.parse(body);
          
          assert.notInclude(response.results, id);
          done();
        });
      });
    });

    it('should return an error when compendium is published', (done) => {
      publishCandidate(compendium_id, cookie_o2r, () => {
        req = {
          method: 'PUT',
          jar: j,
          uri: global.test_host + '/api/v1/compendium/' + compendium_id + '/link'
        };
        request(req, (err, res, body) => {
          assert.ifError(err);
          assert.equal(res.statusCode, 400);
          assert.propertyVal(JSON.parse(body), 'error', 'compendium is not a candidate');
          done();
        });
      });
    }).timeout(10000);
  });

  describe('Admin deletes link', () => {
    let link_id = '';
    let compendium_id2 = '';
    let j = request.jar();
    j.setCookie(request.cookie('connect.sid=' + cookie_admin), global.test_host);

    before(function (done) {
      this.timeout(30000);

      createCompendiumPostRequest('./test/workspace/dummy', cookie_o2r, 'workspace', (req) => {
        request(req, (err, res, body) => {
          compendium_id2 = JSON.parse(body).id;
          reqLink = {
            method: 'PUT',
            jar: j,
            uri: global.test_host + '/api/v1/compendium/' + compendium_id2 + '/link'
          };
    
          request(reqLink, (err, res, body) => {
            response = JSON.parse(body);
            link_id = response.id;
            done();
          });
        });
      });
    });
    
    it('should respond with HTTP 204 and empty body', (done) => {
      let reqdelete = {
        method: 'DELETE',
        jar: j,
        uri: global.test_host + '/api/v1/compendium/' + compendium_id2 + '/link'
      };
      request(reqdelete, (err, res) => {
        assert.ifError(err);
        assert.equal(res.statusCode, 204);
        assert.equal(res.body, '');
        done();
      });
    });

    it('should respond with 404 if requesting the link after deletion', (done) => {
      req = {
        method: 'GET',
        jar: j,
        uri: global.test_host + '/api/v1/compendium/' + link_id
      };
      request(req, (err, res, body) => {
        assert.equal(res.statusCode, 404);
        assert.propertyVal(JSON.parse(body), 'error', 'no compendium with this id');
        done();
      });
    });

    it('should respond with 404 if requesting the link for the compendium after deletion', (done) => {
      req = {
        method: 'GET',
        jar: j,
        uri: global.test_host + '/api/v1/compendium/' + compendium_id2 + '/link'
      };
      request(req, (err, res, body) => {
        assert.equal(res.statusCode, 404);
        assert.propertyVal(JSON.parse(body), 'error', 'link not found');
        done();
      });
    });

    it('should not have the link in the links listing', (done) => {
      req = {
        method: 'GET',
        jar: j,
        uri: global.test_host + '/api/v1/link'
      };
      request(req, (err, res, body) => {
        assert.notInclude(body, link_id);
        done();
      });
    });
  });

  describe('Link list', () => {
    let compendium_id, link_id = '';
    let j = request.jar();
    j.setCookie(request.cookie('connect.sid=' + cookie_admin), global.test_host);

    before(function (done) {
      this.timeout(30000);

      createCompendiumPostRequest('./test/workspace/dummy', cookie_o2r, 'workspace', (req) => {
        request(req, (err, res, body) => {
          compendium_id = JSON.parse(body).id;
          req = {
            method: 'PUT',
            jar: j,
            uri: global.test_host + '/api/v1/compendium/' + compendium_id + '/link'
          };
          
          request(req, (err, res, body) => {
              response = JSON.parse(body);
              link_id = response.id;
              done();
            });
        });
      });
    });
    
    it('should respond with HTTP 200 and list of links for admin, and all links should be created by admin', (done) => {
      req = {
        method: 'GET',
        jar: j,
        uri: global.test_host + '/api/v1/link'
      };
      request(req, (err, res, body) => {
        assert.ifError(err);
        assert.equal(res.statusCode, 200);
        response = JSON.parse(body);
        assert.isObject(response);
        assert.property(response, 'results');
        assert.isArray(response.results);

        response.results.forEach(elem => {
          assert.propertyVal(elem, 'user', '4242-0000-0000-4242');
          assert.property(elem, 'id');
          assert.property(elem, 'compendium_id');
        });
        
        done();
      });
    });
    
    it('should including the latest created link and the compendium id in the link list', (done) => {
      req = {
        method: 'GET',
        jar: j,
        uri: global.test_host + '/api/v1/link'
      };
      request(req, (err, res, body) => {
        assert.ifError(err);
        assert.equal(res.statusCode, 200);
        response = JSON.parse(body);
        assert.isObject(response);
        assert.property(response, 'results');
        assert.isArray(response.results);
        
        assert.include(response.results.map(elem => {
          return(elem.compendium_id);
        }), compendium_id);
        assert.include(response.results.map(elem => {
          return(elem.id);
        }), link_id);

        done();
      });
    });

    it('should respond with 403 if requesting the link list as regular user', (done) => {
      j2 = request.jar();
      j2.setCookie(request.cookie('connect.sid=' + cookie_o2r), global.test_host);
      req2 = {
        method: 'GET',
        jar: j2,
        uri: global.test_host + '/api/v1/link'
      };

      request(req2, (err, res, body) => {
        assert.equal(res.statusCode, 403);
        assert.propertyVal(JSON.parse(body), 'error', 'not allowed');
        done();
      });
    });

    it('should respond with 200 if requesting the link list as editor', (done) => {
      j3 = request.jar();
      j3.setCookie(request.cookie('connect.sid=' + cookie_editor), global.test_host);
      req3 = {
        method: 'GET',
        jar: j3,
        uri: global.test_host + '/api/v1/link'
      };

      request(req3, (err, res, body) => {
        assert.equal(res.statusCode, 200);
        assert.notProperty(JSON.parse(body), 'error');
        done();
      });
    });

    it('should respond with 401 if requesting the link list not logged-in', (done) => {
      request(global.test_host + '/api/v1/link', (err, res, body) => {
        j4 = request.jar();
        j4.setCookie(request.cookie('connect.sid=' + cookie_plain), global.test_host);
        req = {
          method: 'GET',
          jar: j4,
          uri: global.test_host + '/api/v1/link'
        };

        assert.equal(res.statusCode, 401);
        assert.propertyVal(JSON.parse(body), 'error', 'user is not authenticated');
        done();
      });
    });
  });

  describe('Examine public link', () => {
    let public_id = '';

    before(function(done) {
      this.timeout(30000);

      createCompendiumPostRequest('./test/workspace/rmd-data', cookie_o2r, 'workspace', (req) => {
        request(req, (err, res, body) => {
          let response = JSON.parse(body);
          compendium_id = response.id;
          publishLink(compendium_id, cookie_admin, (response) => {
            public_id = response.id;
            done();
          });
        });
      });
    });

    it('should respond with compendium when viewed as plain user, exposing _only_ the link id', (done) => {
      request(global.test_host + '/api/v1/compendium/' + public_id, (err, res) => {
        assert.ifError(err);
        assert.equal(res.statusCode, 200);
        response = JSON.parse(res.body);
        assert.isObject(response);
        assert.propertyVal(response, 'id', public_id);
        assert.notInclude(res.body, compendium_id);
        done();
      });
    });

    it('compendium file can be accessed using link id', (done) => {
      request(global.test_host + '/api/v1/compendium/' + public_id + '/data/data.csv', (err, res) => {
        assert.ifError(err);
        assert.equal(res.statusCode, 200);
        assert.include(res.headers, { 'content-type': 'text/csv; charset=utf-8', 'content-length': '122' }, 'returned file has unexpected mime-type or size');
        done();
      });
    });

    it('should only expose link id in file listing', (done) => {
      request(global.test_host + '/api/v1/compendium/' + public_id + '/data', (err, res) => {
        assert.ifError(err);
        assert.equal(res.statusCode, 200);
        response = JSON.parse(res.body);
        assert.isObject(response);
        assert.property(response, 'path');
        assert.propertyVal(response, 'name', public_id);
        assert.notPropertyVal(response, 'name', compendium_id);
        assert.notInclude(res.body, compendium_id);
        done();
      });
    });
  });

  describe('Jobs for public link', () => {
    let public_id, candidate_id, job_id = '';

    before(function(done) {
      this.timeout(30000);

      createCompendiumPostRequest('./test/workspace/dummy', cookie_o2r, 'workspace', (req) => {
        request(req, (err, res, body) => {
          let response = JSON.parse(body);
          publishLink(response.id, cookie_admin, (response) => {
            public_id = response.id;
            candidate_id = response.compendium;
            done();
          });
        });
      });
    });

    it('a job can be started using link id as a non logged-in user', (done) => {
      request({
        uri: global.test_host + '/api/v1/job',
        method: 'POST',
        formData: {
          compendium_id: public_id
        },
        timeout: 10000
      }, (err, res, body) => {
        response = JSON.parse(body);
        waitForJob(response.job_id, (finalStatus) => {
          assert.equal(finalStatus, 'success');

          job_id = response.job_id;
          done();
        });
      });
    }).timeout(30000);

    it('should expose the job id but not expose compendium id', (done) => {
      request(global.test_host + '/api/v1/job/' + job_id + '?steps=all', (err, res) => {
        response = JSON.parse(res.body);
        assert.propertyVal(response, 'id', job_id);
        assert.propertyVal(response, 'compendium_id', public_id);
        assert.notInclude(res.body, candidate_id);
        done();
      });
    });

    it('should not list the job in the "all jobs" list', (done) => {
      request(global.test_host + '/api/v1/job', (err, res) => {
        response = JSON.parse(res.body);
        assert.notInclude(response.results, job_id);
        done();
      });
    });

    it('should return the job when accessed directly knowing the job id', (done) => {
      request(global.test_host + '/api/v1/job/' + job_id, (err, res) => {
        assert.equal(res.statusCode, 200);
        response = JSON.parse(res.body);
        assert.propertyVal(response, 'id', job_id);
        assert.propertyVal(response, 'compendium_id', public_id);
        done();
      });
    });
    
    it('should list the job when accessed via the compendium endpoint with the public link', (done) => {
      request(global.test_host + '/api/v1/compendium/' + public_id + '/jobs', (err, res) => {
        assert.equal(res.statusCode, 200);
        response = JSON.parse(res.body);
        assert.include(response.results, job_id);
        assert.notInclude(res.body, candidate_id);
        done();
      });
    });
    
    it('should not list the job when accessed via the (non-public) candidate compendium id', (done) => {
      request(global.test_host + '/api/v1/compendium/' + candidate_id + '/jobs', (err, res) => {
        assert.equal(res.statusCode, 404);
        response = JSON.parse(res.body);
        assert.property(response, 'error');
        assert.notInclude(res.body, candidate_id);
        assert.notInclude(res.body, job_id);
        done();
      });
    });

    it('should list the job when accessed via the jobs endpoint filtering with the public link', (done) => {
      request(global.test_host + '/api/v1/job?compendium_id=' + public_id, (err, res) => {
        assert.equal(res.statusCode, 200);
        response = JSON.parse(res.body);
        assert.include(response.results, job_id);
        assert.notInclude(res.body, candidate_id);
        done();
      });
    });
    
    it('should not list the job when accessed via the jobs endpoint filtering with the candidate compendium id', (done) => {
      request(global.test_host + '/api/v1/job?compendium_id=' + candidate_id, (err, res) => {
        assert.equal(res.statusCode, 200);
        response = JSON.parse(res.body);
        assert.notInclude(response.results, job_id);
        assert.notInclude(res.body, job_id);
        done();
      });
    });
  });

  describe('Metadata editing with public link', () => {
    it('should respond with error when updating metadata using link id', (done) => {
      let public_id;
      publishLink(compendium_id, cookie_admin, (response) => {
        public_id = response.id;
        j = request.jar();
        j.setCookie(request.cookie('connect.sid=' + cookie_editor), global.test_host);
        
        updateMetadata = {
          uri: global.test_host + '/api/v1/compendium/' + public_id + '/metadata',
          method: 'PUT',
          jar: j,
          timeout: 30000,
          json: {
            o2r: "testdata"
          }
        };

        request(updateMetadata, (err, res, response) => {
          assert.ifError(err);
          assert.equal(res.statusCode, 404);
          assert.property(response, 'error');
          done();
        });
      });
    });
  });

});
