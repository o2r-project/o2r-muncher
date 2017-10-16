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

const request = require('request');
const tmp = require('tmp');
const AdmZip = require('adm-zip');
const fs = require('fs');
const tags = require('mocha-tags');
console.log('Test filter: ', tags.filter);

require("./setup");
console.log('Using loader at ' + global.test_host_loader);

const cookie_plain = 's:yleQfdYnkh-sbj9Ez--_TWHVhXeXNEgq.qRmINNdkRuJ+iHGg5woRa9ydziuJ+DzFG9GnAZRvaaM';

module.exports.createCompendiumPostRequest = function (path, cookie, type = 'compendium') {
  var zip = new AdmZip();
  zip.addLocalFolder(path);
  var tmpfile = tmp.tmpNameSync() + '.zip';
  zip.writeZip(tmpfile);

  let formData = {
    'content_type': type,
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
  j.setCookie(ck, global.test_host_loader);

  let reqParams = {
    uri: global.test_host_loader + '/api/v1/compendium',
    method: 'POST',
    jar: j,
    formData: formData,
    timeout: 10000
  };

  return (reqParams);
}

// publish a candidate with a direct copy of the metadata
module.exports.publishCandidate = function (compendium_id, cookie, done) {
  let j = request.jar();
  let ck = request.cookie('connect.sid=' + cookie);
  j.setCookie(ck, global.test_host);

  let getMetadata = {
    uri: global.test_host + '/api/v1/compendium/' + compendium_id,
    method: 'GET',
    jar: j,
    timeout: 10000
  };

  let updateMetadata = {
    uri: global.test_host + '/api/v1/compendium/' + compendium_id + '/metadata',
    method: 'PUT',
    jar: j,
    timeout: 10000
  };

  request(getMetadata, (err, res, body) => {
    if (err) {
      console.error('error publishing candidate: %s', err);
    } else {
      let response = JSON.parse(body);
      updateMetadata.json = { o2r: response.metadata.o2r };

      request(updateMetadata, (err, res, body) => {
        done();
      });
    }
  });
}

module.exports.startJob = function (compendium_id, done) {
  let j = request.jar();
  let ck = request.cookie('connect.sid=' + cookie_plain);
  j.setCookie(ck, global.test_host);

  request({
    uri: global.test_host + '/api/v1/job',
    method: 'POST',
    jar: j,
    formData: {
      compendium_id: compendium_id
    },
    timeout: 1000
  }, (err, res, body) => {
    let response = JSON.parse(body);
    done(response.job_id);
  });
}
