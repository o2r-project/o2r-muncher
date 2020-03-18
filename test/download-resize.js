/*
 * (C) Copyright 2017 o2r-project.
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
const fs = require('fs');
const readline = require('readline');
const path = require('path');
const assert = require('chai').assert;
const request = require('request');
const config = require('../config/config');
const tmp = require('tmp');
const fse = require('fs-extra');

const resize = require('../lib/resize');

describe('sub-setting of payload files', () => {

  describe('internal library function hashName', () => {
    it('should compute matching hash', () => {
      let compareHash = '1f6f8417f0fafc43815e166a7cb041af13ba1ca3982c55cd56de1aa685cd84b5';
      let computeHash = resize.hashName('filepath', '42');
      assert.equal(compareHash, computeHash, 'hashes not equal');
    });
  });

  describe('internal library function truncateText', () => {
    function countFileLines(filePath) {
      return new Promise((resolve, reject) => {
        let lineCount = 0;
        let i = 0;
        fs.createReadStream(filePath)
          .on("data", (buffer) => {
            for (i = 0; i < buffer.length; ++i) {
              if (buffer[i] == 10) lineCount++;
            }
          }).on("end", () => {
            resolve(lineCount);
          }).on("error", reject);
      });
    };

    let fs_tmp = config.fs.tmp;

    before(done => {
      let tmpdir = tmp.dirSync();
      config.fs.tmp = tmpdir.name + '/';
      fse.mkdirsSync(config.fs.tmp);
      done();
    });

    after(done => {
      config.fs.tmp = fs_tmp;
      done();
    });

    it('should reject non-integer sizes', () => {
      resize.truncateText(null, 'non-integer', null, (file, err, code) => {
        assert.deepEqual(null, file, 'should not return filename');
        assert.equal(err, 'invalid size parameter', 'should return meaningful error');
        assert.deepEqual(code, 400, 'should return HTTP code 400');
      });
    });

    it('should reject extensions starting with .', () => {
      resize.truncateText(null, 100, '.test', (file, err, code) => {
        assert.deepEqual(null, file, 'should not return filename');
        assert.include(err, 'invalid extension parameter', 'should return meaningful error');
        assert.deepEqual(code, 400, 'should return HTTP code 400');
      });
    });

    it('should resize to n lines', (done) => {
      let n = '5';
      let m = 0;
      let testfile = path.resolve(__dirname, 'dummy.txt');
      resize.truncateText(testfile, n, 'txt', (result) => {
        let rl = readline.createInterface({
          input: fs.createReadStream(result)
        });

        rl.on('line', (line) => {
          m++;
        });

        rl.on('close', () => {
          assert.equal(n, m, 'result is n lines long');
          done();
        });
      });
    });

    it('should give full file if n is larger than file lines', (done) => {
      let n = '999';
      let m = 0;
      let testfile = path.resolve(__dirname, 'dummy.txt');
      let actual = countFileLines(testfile);

      actual.then((actual_length) => {
        resize.truncateText(testfile, n, 'txt', (result) => {
          let rl = readline.createInterface({
            input: fs.createReadStream(result)
          });

          rl.on('line', (line) => {
            m++;
          });

          rl.on('close', () => {
            assert.equal(actual_length, m, 'result is as long as the file');
            done();
          });
        });
      }
      );
    });
  });


  describe('internal library function resizeImage', () => {
    it('should reject non-integer sizes', () => {
      resize.resizeImage(null, 'non-integer', null, (file, err, code) => {
        assert.deepEqual(null, file, 'should not return filename');
        assert.equal(err, 'invalid size parameter', 'should return meaningful error');
        assert.deepEqual(code, 400, 'should return HTTP code 400');
      });
    });
  });

  describe('sub-setting of payload files via API', () => {
    // TODO implement
  });

});
