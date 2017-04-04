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

const request = require('request');
const tmp = require('tmp');
const AdmZip = require('adm-zip');
const fs = require('fs');

const host_loader = 'http://localhost:8088'; // see also setup.js

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
  j.setCookie(ck, host_loader);

  let reqParams = {
    uri: host_loader + '/api/v1/compendium',
    method: 'POST',
    jar: j,
    formData: formData,
    timeout: 10000
  };

  return (reqParams);
}


module.exports.createCompendiumPostRequest = createCompendiumPostRequest;