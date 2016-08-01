const assert    = require('chai').assert;
const request   = require('request');
const config    = require('../config/config');
const fs        = require('fs');
const host      = 'http://localhost:' + config.net.port;

describe('API Compendium', () => {
  /*
   *  After starting a fresh Muncher instance, no compendia should be available
   *  The listing thus should return a 404 error.
   */
  describe('GET /api/v1/compendium (no compendium loaded)', () => {
    it('should respond with HTTP 404 OK', (done) => {
      request(host + '/api/v1/compendium', (err, res, body) => {
        assert.ifError(err);
        assert.equal(res.statusCode, 404);
        done();
      });
    });
    it('should respond with a JSON object', (done) => {
      request(host + '/api/v1/compendium', (err, res, body) => {
        assert.ifError(err);
        assert.isObject(JSON.parse(body), 'returned JSON');
        done();
      });
    });
    it('should not yet contain array of compendium ids', (done) => {
      request(host + '/api/v1/compendium', (err, res, body) => {
        assert.ifError(err);
        assert.isUndefined(JSON.parse(body).result, 'returned no results');
        done();
      });
    });
  });

  /*
   *  POST a valid trivial BagIt archive to create a new compendium.
   */
  let compendium_id = '';

  describe('POST /api/v1/compendium success-load.zip', () => {
    it('should respond with HTTP 200 OK and new ID', (done) => {
      let formData = {
        'content_type': 'compendium_v1',
        'compendium': {
          value: fs.createReadStream('./test/bagtainers/success-load.zip'),
          options: {
            contentType: 'application/zip'
          }
        }
      };
      let headers = {
        'X-API-Key' : 'CHANGE_ME'
      };
      request.post({url: host + '/api/v1/compendium', formData: formData, headers: headers},
       (err, res, body) => {
        assert.ifError(err);
        assert.equal(res.statusCode, 200);
        assert.isObject(JSON.parse(body), 'returned JSON');
        assert.isDefined(JSON.parse(body).id, 'returned id');
        compendium_id = JSON.parse(body).id;
        done();
      });
    });
  });

  /*
   *  should now return a 'results' array with the previously generated id.
   */

  describe('GET /api/v1/compendium (compendium loaded)', () => {
    it('should respond with HTTP 200 OK and \'results\' array', (done) => {
      request(host + '/api/v1/compendium', (err, res, body) => {
        assert.ifError(err);
        assert.equal(res.statusCode, 200);
        assert.isDefined(JSON.parse(body).results, 'results returned');
        assert.include(JSON.parse(body).results, compendium_id, 'id is in results');
        done();
      });
    });
  });


  /*
   *  POST a invalid trivial BagIt archive, should fail
   */
  describe('POST /api/v1/compendium fail-load.zip', () => {
    it('should respond with HTTP 500 error', (done) => {
      let formData = {
        'content_type': 'compendium_v1',
        'compendium': {
          value: fs.createReadStream('./test/bagtainers/invalid-zip'),
          options: {
            contentType: 'application/zip'
          }
        }
      };
      let headers = {
        'X-API-Key' : 'CHANGE_ME'
      };
      request.post({url: host + '/api/v1/compendium', formData: formData, headers: headers},
       (err, res, body) => {
        assert.ifError(err);
        assert.equal(res.statusCode, 500);
        assert.isObject(JSON.parse(body), 'returned JSON');
        assert.isDefined(JSON.parse(body).error, 'returned error');
        assert.equal(JSON.parse(body).error, 'extracting failed');
        done();
      });
    });
  });
});
