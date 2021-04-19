/*
 * (C) Copyright 2017 o2r project.
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

// General modules
var config = require('../config/config');
var debug = require('debug')('muncher:load:dispatch');

// load controllers
var createFromShare = require('./share').create;
var createFromDirectUpload = require('./direct_upload').create;

var Loader = require('../lib/loader').Loader;


exports.dispatch = (req, res) => {
  debug('Dispatching %s', req.originalUrl);

  // check user level
  if (!req.isAuthenticated()) {
    debug('user is not authenticated, returning error');
    res.status(401).send('{"error":"user is not authenticated"}');
    return;
  }
  if (req.user.level < config.user.level.create_compendium) {
    debug('user is authenticated but level is %s, returning error', req.user.level);
    res.status(403).send('{"error":"user level does not allow compendium creation"}');
    return;
  }

  // distinguish between
  // a) direct upload with a file attachment
  // b) no file attachment = get from share via URL parameter
  if(req.file) {
    debug('Detected file in request, dispatching to direct upload: %o', req.file);
    createFromDirectUpload(req, res);
  } else {
    debug('Detected _no_ file in request, dispatching to share upload!\n\tquery: %O\n\tparams: %O\n\tbody: %O\n\theaders:', req.query, req.params, req.body, req.headers);
    createFromShare(req, res);
  }  
};
