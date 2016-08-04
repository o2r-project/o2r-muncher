const assert    = require('chai').assert;
const request   = require('request');
const config    = require('../config/config');

const host      = 'http://localhost:' + config.net.port;

describe('API', () => {
  describe('GET /', () => {
    it('should respond with 404 Not Found', (done) => {
      request(host, (err, res, body) => {
        assert.ifError(err);
        assert.equal(res.statusCode, 404);
        done();
      });
    });
  });
});
