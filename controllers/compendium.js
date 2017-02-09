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

// General modules
var c = require('../config/config');
var debug = require('debug')('compendium');
var fs = require('fs');

var dirTree = require('directory-tree');
var rewriteTree = require('../lib/rewrite-tree');

var Compendium = require('../lib/model/compendium');
var Job = require('../lib/model/job');
var Uploader = require('../lib/uploader').Uploader;

exports.create = (req, res) => {
  // check user level
  if (!req.isAuthenticated()) {
    res.status(401).send('{"error":"user is not authenticated"}');
    return;
  }
  if (req.user.level < c.user.level.create_compendium) {
    res.status(401).send('{"error":"user level does not allow compendium creation"}');
    return;
  }

  if (req.body.content_type === 'compendium_v1') {
    debug('Creating new %s for user %s (original file name: %s)',
      req.body.content_type, req.user.id, req.file.originalname);

    var uploader = new Uploader(req, res);
    uploader.upload((id, err) => {
      if (err) {
        debug('Error during upload: %s', JSON.stringify(err));
      }
      else {
        debug('New compendium %s successfully uploaded', id);
      }
    });
  } else {
    res.status(500).send('Provided content_type not yet implemented, only "compendium_v1" is supported.');
    debug('Provided content_type "%s" not implemented', req.body.content_type);
  }
};

exports.viewSingle = (req, res) => {
  var id = req.params.id;
  var answer = { id };

  Compendium.findOne({ id }).select('id user metadata created').exec((err, compendium) => {
    // eslint-disable-next-line no-eq-null, eqeqeq
    if (err || compendium == null) {
      res.status(404).send(JSON.stringify({ error: 'no compendium with this id' }));
    } else {
      answer.metadata = compendium.metadata;
      answer.created = compendium.created;
      answer.user = compendium.user;
      try {
        fs.accessSync(c.fs.compendium + id); // throws if does not exist
        /*
         *  Rewrite file URLs with api path. directory-tree creates path like
         *  c.fs.compendium + id + filepath
         *
         *  We are only interested in the filepath itself and want to create a
         *  url like
         *  host/api/v1/compendium/id/data/filepath
         *
         */
        answer.files = rewriteTree(dirTree(c.fs.compendium + id),
          c.fs.compendium.length + c.id_length, // remove local fs path and id
          '/api/v1/compendium/' + id + '/data' // prepend proper location
        );
      } catch (e) {
        res.status(500).send({ error: 'internal error: could not read compendium contents from storage', e });
        return;
      }
      res.status(200).send(answer);
    }
  });
};

exports.viewSingleJobs = (req, res) => {
  var id = req.params.id;
  var answer = {};
  var filter_query = '';
  var filter = { compendium_id: id };
  var limit = parseInt(req.query.limit || c.list_limit, 10);
  var start = parseInt(req.query.start || 1, 10) - 1;
  if (start > 1) {
    answer.previous = req.route.path + '?limit=' + limit + '&start=' + start + filter_query;
  }

  Job.find(filter).select('id').skip(start * limit).limit(limit).exec((err, jobs) => {
    if (err) {
      res.status(500).send(JSON.stringify({ error: 'query failed' }));
    } else {
      var count = jobs.length;
      if (count <= 0) {
        Compendium.find({ id }).limit(1).exec((err, compendium) => { // https://blog.serverdensity.com/checking-if-a-document-exists-mongodb-slow-findone-vs-find/
          if (err) {
            res.status(404).send(JSON.stringify({ error: 'no compendium found: ' + err.message }));
          }
          else {
            if (compendium.length <= 0) {
              res.status(404).send(JSON.stringify({ error: 'no compendium with this id' }));
            } else {
              res.status(404).send(JSON.stringify({ error: 'no job found for compendium ' + id }));
            }
          }
        });
      } else {
        if (count >= limit) {
          answer.next = req.route.path + '?limit=' + limit + '&start=' +
            (start + 2) + filter_query;
        }

        answer.results = jobs.map(job => {
          return job.id;
        });
        res.status(200).send(JSON.stringify(answer));
      }
    }
  });
};

exports.view = (req, res) => {
  var answer = {};
  var filter_query = '';
  var filter = {};
  var limit = parseInt(req.query.limit || c.list_limit, 10);
  var start = parseInt(req.query.start || 1, 10) - 1;

  // add query element to filter (used in database search) and to the query (used for previous/next links)
  // eslint-disable-next-line no-eq-null, eqeqeq
  if (req.query.job_id != null) {
    filter.job_id = req.query.job_id;
    filter_query = '&job_id=' + req.query.job_id;
  }
  // eslint-disable-next-line no-eq-null, eqeqeq
  if (req.query.user != null) {
    filter.user = req.query.user;
    filter_query = filter_query + '&user=' + req.query.user;
  }

  if (start > 1) {
    answer.previous = req.route.path + '?limit=' + limit + '&start=' + start + filter_query;
  }

  Compendium.find(filter).select('id').skip(start * limit).limit(limit).exec((err, comps) => {
    if (err) {
      res.status(500).send(JSON.stringify({ error: 'query failed' }));
    } else {
      var count = comps.length;
      if (count <= 0) {
        res.status(404).send(JSON.stringify({ error: 'no compendium found' }));
      } else {
        if (count >= limit) {
          answer.next = req.route.path + '?limit=' + limit + '&start=' +
            (start + 2) + filter_query;
        }

        answer.results = comps.map(comp => {
          return comp.id;
        });
        res.status(200).send(JSON.stringify(answer));
      }
    }
  });
};

exports.viewSingleMetadata = (req, res) => {
  let id = req.params.id;
  let answer = { id: id };

  Compendium.findOne({ id }).select('id metadata').exec((err, compendium) => {
    // eslint-disable-next-line no-eq-null, eqeqeq
    if (err || compendium == null) {
      res.status(404).send(JSON.stringify({ error: 'no compendium with this id' }));
    } else {
      answer.metadata = {};
      answer.metadata.o2r = compendium.metadata.o2r;
      res.status(200).send(answer);
    }
  });
};

exports.updateMetadata = (req, res) => {
  let id = req.params.id;
  let answer = { id: id };

  // check user
  if (!req.isAuthenticated()) {
    res.status(401).send('{"error":"user is not authenticated"}');
    return;
  }
  let user_id = req.user.orcid;

  Compendium.findOne({ id }).select('id metadata user').exec((err, compendium) => {
    // eslint-disable-next-line no-eq-null, eqeqeq
    if (err || compendium == null) {
      res.status(404).send(JSON.stringify({ error: 'no compendium with this id' }));
    } else {
      if (user_id != compendium.user) {
        debug('User %s trying to edit metadata of compendium %s by user %s', user_id, id, compendium.user.id);
        res.status(401).send(JSON.stringify({ error: 'not authorized' }));
      }
      else {
        if (!req.body.hasOwnProperty('o2r')) {
          debug('[%s] invalid metadata provided: no o2r root element', id);
          res.status(422).send(JSON.stringify({ error: "JSON with root element 'o2r' required" }));
          return;
        }

        compendium.metadata.o2r = req.body.o2r;
        answer.metadata = {};
        answer.metadata.o2r = compendium.metadata.o2r;

        compendium.markModified('metadata');
        compendium.save((err, doc) => {
          if (err) {
            debug('[%s] ERROR saving new compendium: %s', id, err);
            res.status(500).send(JSON.stringify({ error: 'internal error' }));
          } else {
            debug('[%s] Updated compendium, now is:\n%s', id, JSON.stringify(doc));
            res.status(200).send(answer);
          }
        });
      }
    }
  });
};
