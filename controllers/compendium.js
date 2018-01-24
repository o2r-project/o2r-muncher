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
const debug = require('debug')('compendium');
const fs = require('fs');
const fse = require('fs-extra');
const path = require('path');
const exec = require('child_process').exec;
const objectPath = require('object-path');
const urlJoin = require('url-join');

const dirTree = require('directory-tree');
const rewriteTree = require('../lib/rewrite-tree');
const errorMessageHelper = require('../lib/error-message');
const bagit = require('../lib/bagit');
const meta = require('../lib/meta');

var Compendium = require('../lib/model/compendium');
var User = require('../lib/model/user');
var Job = require('../lib/model/job');

detect_rights = function (user_id, compendium, level) {
  debug('[%s] Checking rights for user %s against level %s', compendium.id, user_id, level);

  return new Promise(function (resolve, reject) {
    if (user_id === compendium.user) {
      debug('[%s] User %s is owner!', compendium.id, user_id);
      resolve({ user_has_rights: true, user_id: user_id });
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

exports.viewCompendium = (req, res) => {
  let id = req.params.id;
  debug('[%s] view single compendium', id);

  Compendium
    .findOne({ id })
    .select('id user metadata created candidate bag compendium substituted')
    .lean()
    .exec((err, compendium) => {
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
          user: compendium.user,
          bag: compendium.bag,
          compendium: compendium.compendium,
          substituted: compendium.substituted
        }

        try {
          fullPath = path.join(config.fs.compendium, id);
          fs.accessSync(fullPath); // throws if does not exist
          answer.files = rewriteTree(dirTree(fullPath),
            fullPath.length, // remove local fs path and id
            urlJoin(config.api.resource.compendium, id, config.api.sub_resource.data) // prepend proper location
          );
        } catch (err) {
          debug('[%s] Error: No data files found (Fail? %s): %s', id, config.fs.fail_on_no_files, err);
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

exports.deleteCompendium = (req, res) => {
  let id = req.params.id;
  debug('[%s] DELETE compendium', id);

  Compendium.findOne({ id: id }).select('id user candidate').exec((err, compendium) => {
    // eslint-disable-next-line no-eq-null, eqeqeq
    if (err || compendium == null) {
      debug('[%s] compendium does not exist!', id);
      res.status(404).send({ error: 'no compendium with this id' });
    } else {
      let compendium_path = path.join(config.fs.compendium, id);
      // check if user is allowed to delete the candidate
      if (!compendium.candidate) {
        debug('[%s] Compendium is NOT a candidate, can NOT be deleted.', id);
        res.status(400).send({ error: 'compendium is not a candidate, cannot be deleted' });
        return;
      } else if (!req.isAuthenticated()) {
        debug('[%s] User is not authenticated, cannot view candidate.', id);
        res.status(401).send({ error: 'user is not authenticated' });
        return;
      }

      detect_rights(req.user.orcid, compendium, config.user.level.view_candidates)
        .then((passon) => {
          if (passon.user_has_rights) {
            debug('[%s] single compendium found, going to remove it and its files at %s on behalf of user %s (has rights: %s)',
              compendium.id, compendium_path, passon.user_id, passon.user_has_rights);
            Compendium.findOneAndRemove({ id: compendium.id }).exec((err) => {
              if (err) {
                debug('[%s] error deleting compendium: %s', compendium.id, err);
                res.status(500).send({ error: err.message });
              } else {
                fse.remove(compendium_path, (err) => {
                  if (err) {
                    debug('[%s] Error deleting data files: %s', compendium.id, err);
                    res.status(500).send({ error: err.message });
                  } else {
                    res.status(204).send();
                  }
                });
              };
            });
          } else {
            debug('[%s] Error: user does not have rights but promise fulfilled', id);
          }
        }, function (passon) {
          debug('[%s] User %s may NOT delete candidate.', id, req.user.orcid);
          res.status(403).send(passon);
        });
    };
  });
};

exports.viewCompendiumJobs = (req, res) => {
  var id = req.params.id;
  var answer = {};
  var filter = { compendium_id: id };
  var limit = parseInt(req.query.limit || config.list_limit, 10);
  var start = parseInt(req.query.start || 1, 10) - 1;

  Job
    .find(filter)
    .select('id')
    .skip(start)
    .limit(limit)
    .lean()
    .exec((err, jobs) => {
      if (err) {
        res.status(500).send({ error: 'query failed' });
      } else {

        answer.results = jobs.map(job => {
          return job.id;
        });

        if (jobs.length <= 0) {
          Compendium.find({ id }).limit(1).exec((err, compendium) => {
            if (err) {
              res.status(404).send({ error: 'error finding compendium: ' + err.message });
            } else {
              if (compendium.length <= 0) {
                res.status(404).send({ error: 'no compendium with id ' + id });
              } else {
                res.status(200).send(answer);
              }
            }
          });
        } else {
          res.status(200).send(answer);
        }
      }
    });
};

exports.listCompendia = (req, res) => {
  let filter = {};

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
      Compendium
        .find(passon.filter)
        .select('id')
        .skip(passon.start)
        .limit(passon.limit)
        .lean()
        .exec((err, comps) => {
          if (err) {
            debug('Error querying candidates for user %s: %s', req.user.orcid, err);
            let error = new Error('query failed');
            error.status = 500;
            reject(error);
          } else {
            var count = comps.length;
            if (count <= 0) {
              debug('Search turned up empty, no compendium found.');
            }

            passon.results = comps.map(comp => {
              return comp.id;
            });

            resolve(passon);
          }
        })
    });
  };

  // additionally, add the user's candidates if he requests compendia for himself as the first results
  let findCandidates = (passon) => {
    return new Promise(function (resolve, reject) {
      if (req.query.user != null && req.isAuthenticated() && req.user.orcid === req.query.user) {
        debug('User %s requests compendia for herself (%s), so pre-pending candidates to the response.', req.user.orcid, req.query.user);
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
              debug('User %s has no candidates', req.user.orcid);
              resolve(passon);
            } else {
              debug('Adding %s candidates to the response for user.', req.user.orcid);

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

exports.viewCompendiumMetadata = (req, res) => {
  let id = req.params.id;
  let answer = { id: id };

  Compendium
    .findOne({ id })
    .select('id metadata candidate user')
    .lean()
    .exec((err, compendium) => {
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

// overwrite metadata file in compendium directory (which is then used for brokering)
updateMetadataFile = function (id, file, metadata) {
  return new Promise((fulfill, reject) => {
    debug('[%s] Overwriting file %s', id, file);
    fs.truncate(file, 0, function () {
      fs.writeFile(file, JSON.stringify(metadata, null, config.meta.prettyPrint.indent), function (err) {
        if (err) {
          debug('[%s] Error updating normative metadata file: %s', id, err);
          err.message = 'Error updating normative metadata file';
          reject(err);
        } else {
          fulfill({
            id: id,
            file: file
          });
        }
      });
    });
  });
}

reloadMetadataFromFile = function (id, metadata_file, targetElement) {
  return new Promise((fulfill, reject) => {
    // read mapped metadata for saving to DB
    debug('[%s] Reading mapping file: %s', id, metadata_file);
    fs.readFile(metadata_file, (err, data) => {
      if (err) {
        debug('[%s] Error reading mapping file: %s', id, err);
        reject(err);
      } else {
        debug('[%s] Read file %s and stored contents to be saved at', id, metadata_file, targetElement);
        fulfill({
          targetElement: targetElement,
          metadata: JSON.parse(data),
          file: metadata_file
        });
      }
    });
  });
}

brokerMetadata = function (compendium, metadata_dir, metadata_file, mappings) {
  return new Promise((fulfill, reject) => {

    let brokerings = [];
    Object.keys(mappings).forEach(function (name) {
      brokerPromise = meta.broker(compendium.id, metadata_dir, metadata_file, name);
      brokerings.push(brokerPromise);
    });

    Promise.all(brokerings)
      .then((brokerResults) => {
        debug('[%s] Completed brokerings: %s', compendium.id, brokerResults.filter(obj => { return !obj.error }).map(obj => { return obj.name; }).join(', '));
        debug('[%s] FAILED brokerings: %s', compendium.id, brokerResults.filter(obj => { return obj.error }).map(obj => { return obj.name; }).join(', '));

        let reloads = [];
        Object.keys(mappings).forEach((name) => {
          mapping = mappings[name];
          reloadPromise = reloadMetadataFromFile(compendium.id, path.join(metadata_dir, mapping.file), mapping.targetElement);
          reloads.push(reloadPromise);
        });

        Promise.all(reloads)
          .then((reloadResults) => {

            reloadResults.forEach((result) => {
              objectPath.set(compendium.metadata,
                result.targetElement,
                result.metadata);
            });
            debug('[%s] Reloaded metadata from %s files:', compendium.id, reloadResults.length, reloadResults.map(obj => { return obj.file }).join(', '));

            // FINALLY persist the metadata update to the database
            compendium.markModified('metadata');
            compendium.save((err, doc) => {
              if (err) {
                debug('[%s] ERROR saving new compendium: %s', compendium.id, err);
                reject(err);
              } else {
                debug('[%s] Updated compendium, now is:\n%s', compendium.id, JSON.stringify(doc));
                fulfill(doc);
              }
            });
          });
      })
      .catch(err => {
        debug('[%s] Problem during metadata brokering: %s', compendium.id, err);
        let errors = err.message.split(':');
        err.message = errorMessageHelper(errors[errors.length - 1]);
        reject(err);
      });
  });
}

exports.updateCompendiumMetadata = (req, res) => {
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
            compendium.markModified('candidate');
          }

          compendium.metadata.o2r = req.body.o2r;
          answer.metadata = {};
          answer.metadata.o2r = compendium.metadata.o2r;

          let compendium_path = path.join(config.fs.compendium, id);
          let metadata_dir;
          if (bagit.compendiumIsBag(id)) {
            metadata_dir = path.join(compendium_path, config.bagit.payloadDirectory, config.meta.dir);
          } else {
            metadata_dir = path.join(compendium_path, config.meta.dir);
          }

          let normative_metadata_file = path.join(metadata_dir, config.meta.normativeFile);

          if (compendium.metadata && compendium.metadata.o2r) {

            updateMetadataFile(id, normative_metadata_file, compendium.metadata.o2r)
              .then(() => {
                return brokerMetadata(compendium, metadata_dir, normative_metadata_file, config.meta.broker.mappings);
              })
              .catch((err) => {
                debug('[%s] Error during brokering, returning HTTP 500 response: %s', id, err);
                res.status(500).send({ error: 'Error updating normative metadata file' });
              })
              .then(() => {
                debug('[%s] completed metadata update, sending answer.', id);
                res.status(200).send(answer);
              });

          } else {
            debug('[%s] No metadata provided that could be brokered!', id);
            res.status(500).send({ error: 'Error updating metadata: no metadata found.' });
          }
        }, function (passon) {
          res.status(401).send(passon);
        });
    }
  });
};
