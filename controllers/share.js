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
const config = require('../config/config');
const debug = require('debug')('muncher:load:share');
const fs = require('fs');
const path = require('path');

const Compendium = require('../lib/model/compendium');
const Loader = require('../lib/loader').Loader;

const url = require('url');
const validator = require('validator');
const slackBot = require('../lib/slack');

exports.create = (req, res) => {
  req.params = {};

  // validate content_type
  if (!config.bagtainer.supportedContentTypes.includes(req.body.content_type)) {
    res.status(400).send('Provided content_type not implemented, only ' + JSON.stringify(config.bagtainer.supportedContentTypes) + ' supported.');
    debug('content_type "%s" not supported', req.body.content_type);
    return;
  }

  // if the DOI parameter exists, extract the zenodo record ID from it
  if (typeof req.body.doi !== 'undefined') {
    //regex for a DOI (e.g. "10.5281/zenodo.268443")
    let doiRegex = new RegExp(/^\d+\.\d+\/zenodo\.\d+$/);

    if (doiRegex.test(req.body.doi)) { //return the zenodoID from the DOI
      req.params.zenodoID = req.body.doi.split('zenodo.')[1];
    } else {
      debug('Invalid doi:', req.body.doi);
      res.status(422).send('{"error":"DOI is invalid"}');
      return;
    }

    req.params.zenodoHost = config.zenodo.default_host;
    prepareZenodoLoad(req, res);
    return;
  }

  // if the zenodo_record_id parameter exists, start the zenodo loader with it
  if (typeof req.body.zenodo_record_id !== 'undefined') {
    if (isNaN(req.body.zenodo_record_id)) {
      debug('Invalid zenodo_record_id:', req.body.zenodo_record_id);
      res.status(422).send('{"error":"zenodo_record_id is invalid"}');
      return;
    }
    req.params.zenodoID = req.body.zenodo_record_id;
    req.params.zenodoHost = config.zenodo.default_host;
    prepareZenodoLoad(req, res);
    return;
  }

  // validate share_url
  if (!validator.isURL(req.body.share_url)) {
    debug('Invalid share_url:', req.body.share_url);
    res.status(422).send('{"error":"public share URL is invalid"}');
    return;
  }

  // get top-level hostname from share_url
  let parsedURL = url.parse(req.body.share_url);
  let hostname = parsedURL.hostname.split('.');
  hostname = hostname[hostname.length - 2];

  //depending on the host, start zenodo loader or sciebo/owncloud loader
  switch (hostname) {
    case 'sciebo':
      prepareScieboLoad(req, res);
      break;
    case 'zenodo':
      // get zenodo record ID from Zenodo URL, e.g. https://sandbox.zenodo.org/record/59917
      let zenodoPaths = parsedURL.path.split('/');
      let zenodoID = zenodoPaths[zenodoPaths.length - 1];
      req.params.zenodoID = zenodoID;
      req.params.zenodoHost = parsedURL.hostname;
      prepareZenodoLoad(req, res);
      break;
    case 'doi':
      // get zenodoID from DOI URL, e.g. https://doi.org/10.5281/zenodo.268443
      req.params.zenodoID = parsedURL.path.split('zenodo.')[1];
      req.params.zenodoHost = config.zenodo.default_host; //Use default host from config
      prepareZenodoLoad(req, res);
      break;
    default:
      debug('Public share host "%s" is not allowed.', hostname);
      res.status(403).send('{"error":"host is not allowed"}');
      debug('public share host is not allowed, supported is: %s', config.webdav.allowedHosts.toString());
      return;
  }
};

function prepareScieboLoad(req, res) {
  if (!req.body.path) { // set default value for path ('/')
    req.body.path = '/';
  } else if (!req.body.path.startsWith('/')) { // add '/' to beginning of path
      req.body.path = '/' + req.body.path;
  }

  //handle directly submitted zip file
  if (req.body.path.endsWith('.zip')){
      req.zipFile = path.basename(req.body.path);
      req.body.path = path.dirname(req.body.path);
  }

  // only allow sciebo shares, see https://www.sciebo.de/de/login/index.html
  let validURL = url.parse(req.body.share_url);
  let hostname = validURL.hostname.split('.');
  hostname = hostname[hostname.length - 2];

  if (config.webdav.allowedHosts.indexOf(hostname) === -1) { //if hostname is not in allowedHosts
    debug('Public share host "%s" is not allowed.', hostname);
    res.status(403).send('{"error":"public share host is not allowed"}');
    debug('public share host is not allowed, supported is: %s', config.webdav.allowedHosts.toString());
    return;
  }

  var loader = new Loader(req, res);
  loader.loadOwncloud((data, err) => {
    if (err) {
      debug('Error during public share load from owncloud: %o', err);
    } else {
      debug('New compendium successfully loaded: %o', data);

      if (config.slack.enable) {
        let compendium_url = req.protocol + '://' + req.get('host') + '/api/v1/compendium/' + data.id;
        slackBot.newShareUpload(compendium_url, req.user.orcid, data.share_url);
      }
    }
  });
}

function prepareZenodoLoad(req, res) {
  //validate host (must be zenodo or sandbox.zenodo)
  switch (req.params.zenodoHost) {
    case 'sandbox.zenodo.org':
      req.params.baseURL = config.zenodo.zenodo_sandbox_url;
      break;
    case 'zenodo.org':
      req.params.baseURL = config.zenodo.zenodo_url;
      break;
    default:
      debug('Invalid hostname:', req.params.zenodoHost);
      res.status(403).send('{"error":"host is not allowed"}');
      return;
  }

  // validate zenodoID
  if (!validator.isNumeric(String(req.params.zenodoID))) {
    debug('Invalid zenodoID:', req.params.zenodoID);
    res.status(422).send('{"error":"zenodo ID is not a number"}');
    return;
  }

  var loader = new Loader(req, res);
  loader.loadZenodo((data, err) => {
    if (err) {
      debug('Error during public share load from Zenodo: %o', err);
    } else {
      debug('New compendium successfully loaded: %o', data);

      if (config.slack.enable) {
        let compendium_url = req.protocol + '://' + req.get('host') + '/api/v1/compendium/' + data.id;
        slackBot.newShareUpload(compendium_url, req.user.orcid, data.share_url);
      }
    }
  });
}