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

const config = require('../config/config');
const debug = require('debug')('compendium');
const fs = require('fs');
const path = require('path');
const exec = require('child_process').exec;

var dirTree = require('directory-tree');
var rewriteTree = require('../lib/rewrite-tree');
const errorMessageHelper = require('../lib/error-message');

var Compendium = require('../lib/model/compendium');
var Job = require('../lib/model/job');

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
        fs.accessSync(config.fs.compendium + id); // throws if does not exist
        /*
         *  Rewrite file URLs with api path. directory-tree creates path like
         *  config.fs.compendium + id + filepath
         *
         *  We are only interested in the filepath itself and want to create a
         *  url like
         *  host/api/v1/compendium/id/data/filepath
         *
         */
        answer.files = rewriteTree(dirTree(config.fs.compendium + id),
          config.fs.compendium.length + config.id_length, // remove local fs path and id
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
  var filter = { compendium_id: id };
  var limit = parseInt(req.query.limit || config.list_limit, 10);
  var start = parseInt(req.query.start || 1, 10) - 1;

  Job.find(filter).select('id').skip(start).limit(limit).exec((err, jobs) => {
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
  var filter = {};
  var limit = parseInt(req.query.limit || config.list_limit, 10);
  var start = parseInt(req.query.start || 1, 10) - 1;

  // add query element to filter (used in database search) and to the query (used for previous/next links)
  // eslint-disable-next-line no-eq-null, eqeqeq
  if (req.query.job_id != null) {
    filter.job_id = req.query.job_id;
  }
  // eslint-disable-next-line no-eq-null, eqeqeq
  if (req.query.user != null) {
    filter.user = req.query.user;
  }

  Compendium.find(filter).select('id').skip(start).limit(limit).exec((err, comps) => {
    if (err) {
      res.status(500).send(JSON.stringify({ error: 'query failed' }));
    } else {
      var count = comps.length;
      if (count <= 0) {
        res.status(404).send(JSON.stringify({ error: 'no compendium found' }));
      } else {

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

        // TODO restructure following code, remove nested callbacks!

        // overwrite metadata file in compendium directory (needed for brokering)
        let compendium_path = path.join(config.fs.compendium, id);
        let metadata_file = path.join(compendium_path, config.bagtainer.payloadDirectory, config.meta.dir, config.meta.normativeFile);
        debug('Overwriting file %s for compendium %s', metadata_file, id);
        fs.truncate(metadata_file, 0, function () {
          fs.writeFile(metadata_file, JSON.stringify(compendium.metadata.o2r), function (err) {
            if (err) {
              debug('[%s] Error updating normative metadata file: %s', id, err);
              res.status(500).send(JSON.stringify({ error: 'Error updating normative metadata file' }));
            } else {
              // re-broker
              let current_mapping = 'zenodo';
              let mapping_file = path.join(config.meta.broker.mappings.dir, config.meta.broker.mappings[current_mapping].file);
              let metabroker_dir = path.join(compendium_path, config.bagtainer.payloadDirectory, config.meta.dir);
              let cmd = [
                config.meta.cliPath,
                '-debug',
                config.meta.broker.module,
                '--inputfile', metadata_file,
                '--map', mapping_file,
                '--outputdir', metabroker_dir
              ].join(' ');

              debug('Running metadata brokering with command "%s"', cmd);
              exec(cmd, (error, stdout, stderr) => {
                if (error || stderr) {
                  debug('Problem during metadata brokering of %s:\n\t%s\n\t%s',
                    id, error.message, stderr.message);
                  debug(error, stderr, stdout);
                  let errors = error.message.split(':');
                  let message = errorMessageHelper(errors[errors.length - 1]);
                  res.status(500).send(JSON.stringify({ error: 'metadata brokering failed: ' + message }));
                } else {
                  debug('Completed metadata brokering for compendium %s:\n\n%s\n', id, stdout);

                  fs.readdir(metabroker_dir, (err, files) => {
                    if (err) {
                      debug('Error reading brokered metadata directory %s:\n\t%s', metabroker_dir, err);
                      res.status(500).send(JSON.stringify({ error: 'error reading brokered metadata directory' }));
                    } else {
                      debug('Completed metadata brokering and now have %s metadata files for compendium %: %s',
                        files.length, id, JSON.stringify(files));

                      // get filename from mapping definition
                      fs.readFile(mapping_file, (err, data) => {
                        if (err) {
                          debug('Error reading mapping file: %s', err.message);
                          res.status(500).send(JSON.stringify({ error: 'Error reading mapping file' }));
                        } else {
                          let mapping = JSON.parse(data);
                          let mapping_output_file = path.join(metabroker_dir, mapping.Settings.outputfile);
                          debug('Loading brokering output from file %s', mapping_output_file);

                          // read mapped metadata for saving to DB
                          fs.readFile(mapping_output_file, (err, data) => {
                            if (err) {
                              debug('Error reading brokering output file for %s: %s', id, err.message);
                              res.status(500).send(JSON.stringify({ error: 'Error reading brokering output from file' }));
                            } else {
                              let mapping_output = JSON.parse(data);
                              // read mapped metadata for saving to DB
                              compendium.metadata[config.meta.broker.mappings[current_mapping].targetElement] = mapping_output;
                              debug('Finished metadata brokering for %s !', id);

                              // FINALLY persist the metadata update to the database
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
                          });
                        }
                      });
                    }
                  });
                }
              });
            }
          });
        });
      }
    }
  });
};
