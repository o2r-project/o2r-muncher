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
const objectPath = require('object-path');

var dirTree = require('directory-tree');
var rewriteTree = require('../lib/rewrite-tree');
const errorMessageHelper = require('../lib/error-message');

var Compendium = require('../lib/model/compendium');
var User = require('../lib/model/user');
var Job = require('../lib/model/job');

detect_rights = function (user_id, compendium, level) {
  debug('[%s] Checking rights for user %s against level %s', compendium.id, user_id, level);

  return new Promise(function (resolve, reject) {
    if (user_id === compendium.user) {
      debug('[%s] User %s is owner!', compendium.id, user_id);
      resolve({ user_has_rights: true });
    } else {
      // user is not author but could have required level
      debug('[%s] User %s trying to edit/view compendium by user %s', compendium.id, user_id, compendium.user);

      User.findOne({ orcid: user_id }, (err, user) => {
        if (err) {
          reject({ error: 'problem retrieving user information: ' + err });
        } else {
          if (user.level >= level) {
            debug('[%] User %s has level (%s), continuing ...', compendium.id, user_id, user.level);
            resolve({ user_has_rights: true });
          } else {
            reject({ error: 'not authorized to edit/view ' + compendium.id });
          }
        }
      });
    }
  });
}

exports.viewSingle = (req, res) => {
  let id = req.params.id;
  debug('[%s] view single compendium', id);

  Compendium.findOne({ id }).select('id user metadata created candidate').exec((err, compendium) => {
    // eslint-disable-next-line no-eq-null, eqeqeq
    if (err || compendium == null) {
      debug('[%s] compendium does not exist!', id);
      res.status(404).send({ error: 'no compendium with this id' });
    } else {
      debug('[%s] single compendium found!', id);

      let answer = {
        id: id,
        metadata: compendium.metadata,
        created: compendium.created,
        user: compendium.user
      }

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
      } catch (err) {
        debug('ERROR: No data files found for compendium %s. Fail? %s\n%s', id, config.fs.fail_on_no_files, err);
        if (config.fs.fail_on_no_files) {
          res.status(500).send({ error: 'internal error: could not read compendium contents from storage' });
          return;
        } else {
          answer.filesMissing = true;
        }
      }

      // check if user is allowed to view the candidate (easier to check async if done after answer creation)
      if (compendium.candidate) {
        debug('[%s] Compendium is a candidate, need to make some checks.', id);

        if (!req.isAuthenticated()) {
          debug('[%s] User is not authenticated, cannot view candidate.', id);
          res.status(401).send({ error: 'user is not authenticated' });
          return;
        }
        detect_rights(req.user.orcid, compendium, config.user.level.view_candidates)
          .then((passon) => {
            if (passon.user_has_rights) {
              debug('[%s] User %s may see candidate.', id, req.user.orcid);
              answer.candidate = compendium.candidate;

              res.status(200).send(answer);
            } else {
              debug('[%s] Error: user does not have rights but promise fulfilled', id);
            }
          }, function (passon) {
            debug('[%s] User %s may NOT see candidate.', id, req.user.orcid);
            res.status(401).send(passon);
          });
      } else {
        res.status(200).send(answer);
      }
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
      res.status(500).send({ error: 'query failed' });
    } else {
      var count = jobs.length;
      if (count <= 0) {
        Compendium.find({ id }).limit(1).exec((err, compendium) => { // https://blog.serverdensity.com/checking-if-a-document-exists-mongodb-slow-findone-vs-find/
          if (err) {
            res.status(404).send({ error: 'no compendium found: ' + err.message });
          }
          else {
            if (compendium.length <= 0) {
              res.status(404).send({ error: 'no compendium with this id' });
            } else {
              res.status(404).send({ error: 'no job found for compendium ' + id });
            }
          }
        });
      } else {

        answer.results = jobs.map(job => {
          return job.id;
        });
        res.status(200).send(answer);
      }
    }
  });
};

exports.view = (req, res) => {
  let filter = {};

  // add query element to filter (used in database search)
  // eslint-disable-next-line no-eq-null, eqeqeq
  if (req.query.job_id != null) {
    filter.job_id = req.query.job_id;
  }
  // eslint-disable-next-line no-eq-null, eqeqeq
  if (req.query.user != null) {
    filter.user = req.query.user;
  }
  // eslint-disable-next-line no-eq-null, eqeqeq
  if (req.query.doi != null) {
    //only look at the o2r.identifier.doi field
    filter[config.meta.doiPath] = req.query.doi;
  }

  let search = {
    limit: parseInt(req.query.limit || config.list_limit, 10),
    start: parseInt(req.query.start || 1, 10) - 1,
    filter: filter
  };

  let findCompendia = (passon) => {
    // do not show candidates by default
    passon.filter.candidate = false;

    return new Promise(function (resolve, reject) {
      Compendium.find(passon.filter).select('id').skip(passon.start).limit(passon.limit).exec((err, comps) => {
        if (err) {
          debug('Error querying candidates for user %s: %s', req.user.orcid, err);
          let error = new Error('query failed');
          error.status = 500;
          reject(error);
        } else {
          var count = comps.length;
          if (count <= 0) {
            let error = new Error('no compendium found');
            error.status = 404;
            reject(error);
          } else {

            passon.results = comps.map(comp => {
              return comp.id;
            });

            resolve(passon);
          }
        }
      })
    });
  };

  // additionally, add the user's candidates if he requests compendia for himself as the first results
  let findCandidates = (passon) => {
    return new Promise(function (resolve, reject) {
      if (req.query.user != null && req.isAuthenticated() && req.user.orcid === req.query.user) {
        debug('User %s requests compendia for %s, so pre-pending candidates to the response.');
        passon.filter.candidate = true;

        Compendium.find(passon.filter).select('id').skip(passon.start).limit(passon.limit).exec((err, comps) => {
          if (err) {
            debug('Error querying candidates for user %s: %s', req.user.orcid, err);
            let error = new Error('query failed');
            error.status = 500;
            reject(error);
          } else {
            var count = comps.length;
            if (count <= 0) {
              let error = new Error('no compendium found');
              error.status = 404;
              reject(error);
            } else {

              passon.candidates = comps.map(comp => {
                return comp.id;
              });

              resolve(passon);
            }
          }
        });
      } else {
        resolve(passon);
      }
    });
  };

  findCompendia(search)
    .then(findCandidates)
    .then(passon => {
      debug('Completed search, returning %s compendia plus %s candidates.', passon.results.length, ((passon.candidates) ? passon.candidates.length : '0'));

      let answer = {};
      if (passon.candidates) {
        answer.results = passon.candidates.concat(passon.results);
      } else {
        answer.results = passon.results;
      }
      res.status(200).send(answer);
    })
    .catch(err => {
      debug('Rejection during search: \n\t%s', err);
      let status = 500;
      if (err.status) {
        status = err.status;
      }
      res.status(status).send({ error: err.message });
    });

};

exports.viewSingleMetadata = (req, res) => {
  let id = req.params.id;
  let answer = { id: id };

  Compendium.findOne({ id }).select('id metadata candidate user').exec((err, compendium) => {
    // eslint-disable-next-line no-eq-null, eqeqeq
    if (err || compendium == null) {
      res.status(404).send({ error: 'no compendium with this id' });
    } else {
      answer.metadata = {};
      answer.metadata.o2r = compendium.metadata.o2r;

      // check if user is allowed to view the candidate (easier to check async if done after answer creation)
      if (compendium.candidate) {
        debug('[%s] Compendium is a candidate, need to make some checks.', id);

        if (!req.isAuthenticated()) {
          debug('[%s] User is not authenticated, cannot view candidate.', id);
          res.status(401).send({ error: 'user is not authenticated' });
          return;
        }
        detect_rights(req.user.orcid, compendium, config.user.level.view_candidates)
          .then((passon) => {
            if (passon.user_has_rights) {
              debug('[%s] User %s may see candidate metadata.', id, req.user.orcid);
              res.status(200).send(answer);
            } else {
              debug('[%s] Error: user does not have rights but promise fulfilled', id);
            }
          }, function (passon) {
            debug('[%s] User %s may NOT see candidate metadata.', id, req.user.orcid);
            res.status(403).send(passon);
          });
      } else {
        res.status(200).send(answer);
      }
    }
  });
};

exports.updateMetadata = (req, res) => {
  let id = req.params.id;
  let answer = { id: id };

  // check user
  if (!req.isAuthenticated()) {
    res.status(401).send({ error: 'user is not authenticated' });
    return;
  }
  let user_id = req.user.orcid;

  Compendium.findOne({ id }).select('id metadata user').exec((err, compendium) => {
    // eslint-disable-next-line no-eq-null, eqeqeq
    if (err || compendium == null) {
      res.status(404).send({ error: 'no compendium with this id' });
    } else {
      detect_rights(user_id, compendium, config.user.level.edit_metadata)
        .then(function (passon) {
          if (!req.body.hasOwnProperty('o2r')) {
            debug('[%s] invalid metadata provided: no o2r root element', id);
            res.status(422).send({ error: "JSON with root element 'o2r' required" });
            return;
          }

          // TODO check metadata conformance with profile
          if (passon.user_has_rights) {
            compendium.candidate = false;
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
                res.status(500).send({ error: 'Error updating normative metadata file' });
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
                    res.status(500).send({ error: 'metadata brokering failed: ' + message });
                  } else {
                    debug('Completed metadata brokering for compendium %s:\n\n%s\n', id, stdout);

                    fs.readdir(metabroker_dir, (err, files) => {
                      if (err) {
                        debug('Error reading brokered metadata directory %s:\n\t%s', metabroker_dir, err);
                        res.status(500).send({ error: 'error reading brokered metadata directory' });
                      } else {
                        debug('Completed metadata brokering and now have %s metadata files for compendium %: %s',
                          files.length, id, JSON.stringify(files));

                        // get filename from mapping definition
                        fs.readFile(mapping_file, (err, data) => {
                          if (err) {
                            debug('Error reading mapping file: %s', err.message);
                            res.status(500).send({ error: 'Error reading mapping file' });
                          } else {
                            let mapping = JSON.parse(data);
                            let mapping_output_file = path.join(metabroker_dir, mapping.Settings.outputfile);
                            debug('Loading brokering output from file %s', mapping_output_file);

                            // read mapped metadata for saving to DB
                            fs.readFile(mapping_output_file, (err, data) => {
                              if (err) {
                                debug('Error reading brokering output file for %s: %s', id, err.message);
                                res.status(500).send({ error: 'Error reading brokering output from file' });
                              } else {
                                let mapping_output = JSON.parse(data);
                                // read mapped metadata and save it also to DB
                                objectPath.set(compendium.metadata,
                                  config.meta.broker.mappings[current_mapping].targetElement,
                                  mapping_output);
                                debug('Finished metadata brokering for %s !', id);

                                // FINALLY persist the metadata update to the database
                                compendium.markModified('metadata');
                                compendium.save((err, doc) => {
                                  if (err) {
                                    debug('[%s] ERROR saving new compendium: %s', id, err);
                                    res.status(500).send({ error: 'internal error' });
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
        }, function (passon) {
          res.status(401).send(passon);
        });
    }
  });
};
