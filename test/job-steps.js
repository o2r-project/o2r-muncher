/* eslint-env mocha */
const assert = require('chai').assert;
const request = require('request');
const config = require('../config/config');
const host = 'http://localhost:' + config.net.port;
const AdmZip = require('adm-zip');
const fs = require('fs');
const tmp = require('tmp');
const sleep = require('sleep');

require("./setup")
const cookie_o2r = 's:C0LIrsxGtHOGHld8Nv2jedjL4evGgEHo.GMsWD5Vveq0vBt7/4rGeoH5Xx7Dd2pgZR9DvhKCyDTY';
const cookie_plain = 's:yleQfdYnkh-sbj9Ez--_TWHVhXeXNEgq.qRmINNdkRuJ+iHGg5woRa9ydziuJ+DzFG9GnAZRvaaM';
const sleepSecs = 1;

function createCompendiumPostRequest(path, cookie) {
  var zip = new AdmZip();
  zip.addLocalFolder(path);
  var tmpfile = tmp.tmpNameSync() + '.zip';
  //var zipBuffer = zip.toBuffer(); could not make buffer work with multipart/form
  zip.writeZip(tmpfile);

  let formData = {
    'content_type': 'compendium_v1',
    'compendium': {
      value: fs.createReadStream(tmpfile),
      options: {
        filename: 'another.zip',
        contentType: 'application/zip'
      }
    }
  };
  let j = request.jar();
  let ck = request.cookie('connect.sid=' + cookie);
  j.setCookie(ck, host);

  let reqParams = {
    uri: host + '/api/v1/compendium',
    method: 'POST',
    jar: j,
    formData: formData,
    timeout: 1000
  };

  return (reqParams);
}

describe('API Job', () => {
  describe('GET /api/v1/job (with no job started)', () => {
    it('should respond with HTTP 404 Not Found', (done) => {
      request(host + '/api/v1/job', (err, res) => {
        assert.ifError(err);
        assert.equal(res.statusCode, 404);
        done();
      });
    });
    it('should respond with a JSON object', (done) => {
      request(host + '/api/v1/job', (err, res, body) => {
        assert.ifError(err);
        assert.isObject(JSON.parse(body), 'returned JSON');
        done();
      });
    });
    it('should not yet contain array of job ids, but an error', (done) => {
      request(host + '/api/v1/job', (err, res, body) => {
        assert.ifError(err);
        assert.notProperty(JSON.parse(body), 'results');
        assert.propertyVal(JSON.parse(body), 'error', 'no jobs found');
        done();
      });
    });
  });

  describe('EXECUTION step_zero', () => {
    let compendium_id = '';
    let job_id = '';

    it('upload compendium should succeed and return an ID', (done) => {
      let req = createCompendiumPostRequest('./test/bagtainers/step_zero', cookie_o2r);

      request(req, (err, res, body) => {
        assert.ifError(err);
        assert.equal(res.statusCode, 200);
        assert.property(JSON.parse(body), 'id');
        compendium_id = JSON.parse(body).id;
        done();
      });
    });

    it('should return job ID when starting job execution', (done) => {
      let j = request.jar();
      let ck = request.cookie('connect.sid=' + cookie_plain);
      j.setCookie(ck, host);

      request({
        uri: host + '/api/v1/job',
        method: 'POST',
        jar: j,
        formData: {
          compendium_id: compendium_id
        },
        timeout: 1000
      }, (err, res, body) => {
        assert.ifError(err);
        assert.equal(res.statusCode, 200);
        let response = JSON.parse(body);
        assert.property(response, 'job_id');
        job_id = response.job_id;
        done();
      });
    });

    it('should return document with required fields (including steps)', (done) => {
      request(host + '/api/v1/job/' + job_id, (err, res, body) => {
        assert.ifError(err);
        assert.equal(res.statusCode, 200);
        let response = JSON.parse(body);
        assert.propertyVal(response, 'id', job_id);
        assert.propertyVal(response, 'compendium_id', compendium_id);
        assert.property(response, 'steps');
        assert.property(response, 'files');
        assert.property(response.steps, 'validate_bag');
        assert.property(response.steps, 'validate_compendium');
        assert.property(response.steps, 'image_prepare');
        assert.property(response.steps, 'image_build');
        assert.property(response.steps, 'image_execute');
        assert.property(response.steps, 'cleanup');
        done();
      });
    });

    it('should fail step "validate_bag" __after some waiting__', (done) => {
      sleep.sleep(sleepSecs);

      request(host + '/api/v1/job/' + job_id, (err, res, body) => {
        assert.ifError(err);
        let response = JSON.parse(body);
        assert.propertyVal(response.steps.validate_bag, 'status', 'failure');
        done();
      });
    }).timeout(sleepSecs * 1000 * 3);

    it('should list remaining steps as queued', (done) => {
      request(host + '/api/v1/job/' + job_id, (err, res, body) => {
        assert.ifError(err);
        let response = JSON.parse(body);
        assert.propertyVal(response.steps.validate_compendium, 'status', 'queued');
        assert.propertyVal(response.steps.image_prepare, 'status', 'queued');
        assert.propertyVal(response.steps.image_build, 'status', 'queued');
        assert.propertyVal(response.steps.image_execute, 'status', 'queued');
        done();
      });
    });

    it('should complete step "cleanup"', (done) => {
      request(host + '/api/v1/job/' + job_id, (err, res, body) => {
        assert.ifError(err);
        let response = JSON.parse(body);
        assert.propertyVal(response.steps.cleanup, 'status', 'success');
        done();
      });
    });
  });

  describe('GET /api/v1/job with one job', () => {
    it('should respond with HTTP 200 OK', (done) => {
      request(host + '/api/v1/job', (err, res) => {
        assert.ifError(err);
        assert.equal(res.statusCode, 200);
        done();
      });
    });
    it('should respond with a JSON object', (done) => {
      request(host + '/api/v1/job', (err, res, body) => {
        assert.ifError(err);
        assert.isObject(JSON.parse(body), 'returned JSON');
        done();
      });
    });
    it('should contain array of job ids', (done) => {
      request(host + '/api/v1/job', (err, res, body) => {
        assert.ifError(err);
        let response = JSON.parse(body);
        assert.property(response, 'results');
        assert.isArray(response.results);
        done();
      });
    });
  });

  describe('EXECUTION step_validate_bag', () => {
    let compendium_id = '';
    let job_id = '';

    it('upload compendium should succeed and return an ID', (done) => {
      let req = createCompendiumPostRequest('./test/bagtainers/step_validate_bag', cookie_o2r);
      // useful command: unzip -l /tmp/tmp-5697QCBn11BrFvTl.zip 

      request(req, (err, res, body) => {
        assert.ifError(err);
        assert.equal(res.statusCode, 200);
        assert.property(JSON.parse(body), 'id');
        compendium_id = JSON.parse(body).id;
        done();
      });
    });

    it('should return job ID when starting job execution', (done) => {
      let j = request.jar();
      let ck = request.cookie('connect.sid=' + cookie_plain);
      j.setCookie(ck, host);

      request({
        uri: host + '/api/v1/job',
        method: 'POST',
        jar: j,
        formData: {
          compendium_id: compendium_id
        },
        timeout: 1000
      }, (err, res, body) => {
        assert.ifError(err);
        assert.equal(res.statusCode, 200);
        let response = JSON.parse(body);
        assert.property(response, 'job_id');
        job_id = response.job_id;
        done();
      });
    });

    it('should have step "validate_bag" running rightaway', (done) => {
      request(host + '/api/v1/job/' + job_id, (err, res, body) => {
        assert.ifError(err);
        let response = JSON.parse(body);
        assert.propertyVal(response.steps.validate_bag, 'status', 'running');
        done();
      });
    });

    it('should have step "validate_compendium" queued', (done) => {
      request(host + '/api/v1/job/' + job_id, (err, res, body) => {
        assert.ifError(err);
        let response = JSON.parse(body);
        assert.propertyVal(response.steps.validate_compendium, 'status', 'queued');
        done();
      });
    });

    it('should complete step "validate_bag" __after some waiting__', (done) => {
      sleep.sleep(sleepSecs);

      request(host + '/api/v1/job/' + job_id, (err, res, body) => {
        assert.ifError(err);
        let response = JSON.parse(body);
        assert.propertyVal(response.steps.validate_bag, 'status', 'success');
        done();
      });
    }).timeout(sleepSecs * 1000 * 3);

    it('should fail step "validate_compendium"', (done) => {
      request(host + '/api/v1/job/' + job_id, (err, res, body) => {
        assert.ifError(err);
        let response = JSON.parse(body);
        assert.propertyVal(response.steps.validate_compendium, 'status', 'failure');
        done();
      });
    });

    it('should list image steps as queued', (done) => {
      request(host + '/api/v1/job/' + job_id, (err, res, body) => {
        assert.ifError(err);
        let response = JSON.parse(body);
        assert.propertyVal(response.steps.image_prepare, 'status', 'queued');
        assert.propertyVal(response.steps.image_build, 'status', 'queued');
        assert.propertyVal(response.steps.image_execute, 'status', 'queued');
        done();
      });
    });

    it('should complete step "cleanup"', (done) => {
      request(host + '/api/v1/job/' + job_id, (err, res, body) => {
        assert.ifError(err);
        let response = JSON.parse(body);
        assert.propertyVal(response.steps.cleanup, 'status', 'success');
        done();
      });
    });
  });

  describe('EXECUTION step_validate_compendium', () => {
    let compendium_id = '';
    let job_id = '';

    it('upload compendium should succeed and return an ID', (done) => {
      let req = createCompendiumPostRequest('./test/bagtainers/step_validate_compendium', cookie_o2r);
      // useful command: unzip -l /tmp/tmp-5697QCBn11BrFvTl.zip 

      request(req, (err, res, body) => {
        assert.ifError(err);
        assert.equal(res.statusCode, 200);
        assert.property(JSON.parse(body), 'id');
        compendium_id = JSON.parse(body).id;
        done();
      });
    });

    it('should return job ID when starting job execution', (done) => {
      let j = request.jar();
      let ck = request.cookie('connect.sid=' + cookie_plain);
      j.setCookie(ck, host);

      request({
        uri: host + '/api/v1/job',
        method: 'POST',
        jar: j,
        formData: {
          compendium_id: compendium_id
        },
        timeout: 1000
      }, (err, res, body) => {
        assert.ifError(err);
        assert.equal(res.statusCode, 200);
        let response = JSON.parse(body);
        assert.property(response, 'job_id');
        job_id = response.job_id;
        done();
      });
    });


    it('should return job ID when starting _another_ job execution (different from the previous id)', (done) => {
      let j = request.jar();
      let ck = request.cookie('connect.sid=' + cookie_plain);
      j.setCookie(ck, host);

      request({
        uri: host + '/api/v1/job',
        method: 'POST',
        jar: j,
        formData: {
          compendium_id: compendium_id
        },
        timeout: 1000
      }, (err, res, body) => {
        assert.ifError(err);
        assert.equal(res.statusCode, 200);
        let response = JSON.parse(body);
        assert.property(response, 'job_id');
        assert.notEqual(response.job_id, job_id);
        job_id = response.job_id;
        done();
      });
    });

    it('should complete step "validate_compendium" __after some waiting__', (done) => {
      sleep.sleep(sleepSecs);

      request(host + '/api/v1/job/' + job_id, (err, res, body) => {
        assert.ifError(err);
        let response = JSON.parse(body);
        assert.propertyVal(response.steps.validate_compendium, 'status', 'success');
        done();
      });
    }).timeout(sleepSecs * 1000 * 2);

    it('should fail step "image_prepare"', (done) => {
      request(host + '/api/v1/job/' + job_id, (err, res, body) => {
        assert.ifError(err);
        let response = JSON.parse(body);
        assert.propertyVal(response.steps.image_prepare, 'status', 'failure');
        done();
      });
    });

    it('should list other image steps as queued', (done) => {
      request(host + '/api/v1/job/' + job_id, (err, res, body) => {
        assert.ifError(err);
        let response = JSON.parse(body);
        assert.propertyVal(response.steps.image_build, 'status', 'queued');
        assert.propertyVal(response.steps.image_execute, 'status', 'queued');
        done();
      });
    });

    it('should complete step "cleanup"', (done) => {
      request(host + '/api/v1/job/' + job_id, (err, res, body) => {
        assert.ifError(err);
        let response = JSON.parse(body);
        assert.propertyVal(response.steps.cleanup, 'status', 'success');
        done();
      });
    });
  });

  describe('GET /api/v1/job with multiple jobs', () => {
    it('should contain next link if limit provided', (done) => {
      request(host + '/api/v1/job?limit=3', (err, res, body) => {
        assert.ifError(err);
        let response = JSON.parse(body);
        assert.property(response, 'next');
        done();
      });
    });

    it('should contain next and previous link if limit and start provided', (done) => {
      request(host + '/api/v1/job?limit=1&start=2', (err, res, body) => {
        assert.ifError(err);
        let response = JSON.parse(body);
        assert.property(response, 'next');
        assert.property(response, 'previous');
        done();
      });
    });

    it('should use pagination settings from request for pagination links', (done) => {
      request(host + '/api/v1/job?limit=2&start=2', (err, res, body) => {
        assert.ifError(err);
        let response = JSON.parse(body);
        assert.property(response, 'next');
        assert.property(response, 'previous');
        assert.propertyVal(response, 'previous', '/api/v1/job?limit=2&start=1');
        assert.propertyVal(response, 'next', '/api/v1/job?limit=2&start=3');
        done();
      });
    });
    it('should only list the number of jobs requested', (done) => {
      request(host + '/api/v1/job?limit=2', (err, res, body) => {
        assert.ifError(err);
        let response = JSON.parse(body);
        assert.isArray(response.results);
        assert.equal(response.results.length, 2);
        done();
      });
    });
  });

  describe('EXECUTION step_image_prepare', () => {
    let compendium_id = '';
    let job_id = '';

    it('upload compendium should succeed and return an ID', (done) => {
      let req = createCompendiumPostRequest('./test/bagtainers/step_image_prepare', cookie_o2r);
      // useful command: unzip -l /tmp/tmp-5697QCBn11BrFvTl.zip 

      request(req, (err, res, body) => {
        assert.ifError(err);
        assert.equal(res.statusCode, 200);
        assert.property(JSON.parse(body), 'id');
        compendium_id = JSON.parse(body).id;
        done();
      });
    });

    it('should return job ID when starting job execution', (done) => {
      let j = request.jar();
      let ck = request.cookie('connect.sid=' + cookie_plain);
      j.setCookie(ck, host);

      request({
        uri: host + '/api/v1/job',
        method: 'POST',
        jar: j,
        formData: {
          compendium_id: compendium_id
        },
        timeout: 1000
      }, (err, res, body) => {
        assert.ifError(err);
        assert.equal(res.statusCode, 200);
        let response = JSON.parse(body);
        assert.property(response, 'job_id');
        job_id = response.job_id;
        done();
      });
    });

    it('should complete step "image_prepare" __after some waiting__', (done) => {
      sleep.sleep(sleepSecs);

      request(host + '/api/v1/job/' + job_id, (err, res, body) => {
        assert.ifError(err);
        let response = JSON.parse(body);
        assert.propertyVal(response.steps.image_prepare, 'status', 'success');
        done();
      });
    }).timeout(sleepSecs * 1000 * 2);

    it('should fail step "image_build"', (done) => {
      request(host + '/api/v1/job/' + job_id, (err, res, body) => {
        assert.ifError(err);
        let response = JSON.parse(body);
        assert.propertyVal(response.steps.image_build, 'status', 'failure');
        done();
      });
    });

    it('should list other image_execute as queued', (done) => {
      request(host + '/api/v1/job/' + job_id, (err, res, body) => {
        assert.ifError(err);
        let response = JSON.parse(body);
        assert.propertyVal(response.steps.image_execute, 'status', 'queued');
        done();
      });
    });

    it('should complete step "cleanup"', (done) => {
      request(host + '/api/v1/job/' + job_id, (err, res, body) => {
        assert.ifError(err);
        let response = JSON.parse(body);
        assert.propertyVal(response.steps.cleanup, 'status', 'success');
        done();
      });
    });
  });

});
