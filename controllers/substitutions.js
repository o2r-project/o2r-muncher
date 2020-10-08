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

const config = require('../config/config');
const debug = require('debug')('substituter-compendium');
const randomstring = require('randomstring');

var Compendium = require('../lib/model/compendium');

const substitute = require('./substitute');

exports.view = (req, res) => {
  var answer = {};
  var filter = {
    substituted: true
  };
  var limit = parseInt(req.query.limit || config.list_limit, 10);
  var start = parseInt(req.query.start || 1, 10) - 1;

  if (req.query.base != null) {
    filter[config.substitution.meta.base] = req.query.base;
  }
  if (req.query.overlay != null) {
    filter[config.substitution.meta.overlay] = req.query.overlay;
  }

  Compendium.find(filter).select('id').skip(start).limit(limit).exec((err, comps) => {
    if (err) {
      res.status(500).send({ error: 'query failed' });
    } else {
      var count = comps.length;
      if (count <= 0) {
        debug('No substitution found.');
      } else {
        debug('Found %s results', count);
      }

      answer.results = comps.map(comp => {
        return comp.id;
      });
      res.status(200).send(answer);
    }
  });
};

exports.create = (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  if (!req.isAuthenticated()) {
    res.status(401).send({ "error": "not authenticated" });
    return;
  }
  if (req.user.level < config.user.level.substitute) {
    res.status(401).send({ "error": "not allowed" });
    return;
  }

  // new random id
  let newID = randomstring.generate(config.id_length);

  let passon = {
    user: req.user.orcid,
    id: newID,
    metadata: {
      substituted: true,
      substitution: req.body
    }
  };

  debug('[%s] Starting substitution of new compendium [base: "%s" - overlay: "%s"] ...', passon.id, passon.metadata.substitution.base, passon.metadata.substitution.overlay);
  return substitute.checkBase(passon)               // check base and get metadata
    .then(substitute.checkOverlay)                  // check overlay
    .then(substitute.checkSubstitutionFiles)        // check the provided substitution data
    .then(substitute.createFolder)                  // create folder with id
    .then(substitute.copyBaseFiles)                 // copy base files into folder
    .then(substitute.copyOverlayFiles)              // copy overlay files into folder
    .then(substitute.createVolumeBinds)             // create metadata for writing to yaml
    .then(substitute.updateCompendiumConfiguration) // write docker run cmd and new id to compendium configuration file
    .then(substitute.updateMetadata)                // update metadata of substituted compendium (paths, identifier)
    .then(substitute.saveToDB)                      // save to DB
    .then((passon) => {
      debug('[%s] Finished substitution of new compendium.', passon.id);
      res.status(200).send({ 'id': passon.id });
    })
    .catch(err => {
      debug('[%s] Error during substitution: %s', passon.id, err);

      let status = 500;
      if (err.status) {
        status = err.status;
      }
      let msg = 'Internal error';
      if (err.msg) {
        msg = err.msg;
      }
      res.status(status).send({ error: msg });
    });
}
