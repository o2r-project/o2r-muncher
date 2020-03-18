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
const debug = require('debug')('muncher:job');
const randomstring = require('randomstring');
const fs = require('fs');
const path = require('path');
const urlJoin = require('url-join');
const pick = require('lodash.pick');

const dirTree = require('directory-tree');
const rewriteTree = require('../lib/rewrite-tree');
const resize = require('../lib/resize.js').resize;
const override = require('../config/custom-mime.json');
const Mimos = require('@hapi/mimos');
const mime = new Mimos({ override });
const resolve_public_link = require('./link').resolve_public_link;

const Executor = require('../lib/executor').Executor;
const Compendium = require('../lib/model/compendium');
const Job = require('../lib/model/job');
const PublicLink = require('../lib/model/link');

const alwaysStepFields = ["start", "end", "status"];
const allStepsValue = "all";

exports.listJobs = (req, res) => {
  var answer = {};
  var filter = {};
  var limit = parseInt(req.query.limit || config.list_limit, 10);
  var start = parseInt(req.query.start || 1, 10) - 1;
  var fields = ['id', 'compendium_id'];

  // eslint-disable-next-line no-eq-null, eqeqeq
  if (req.query.compendium_id != null) {
    filter.compendium_id = req.query.compendium_id;
  }
  // eslint-disable-next-line no-eq-null, eqeqeq
  if (req.query.user != null) {
    filter.user = req.query.user;
  }

  //filtering for status
  if (req.query.status != null) {
    filter.status = req.query.status;
  }

  let requestedFields = [];
  if (req.query.fields != null) {
    requestedFields = req.query.fields.split(',').map(f => { return f.trim(); });

    try {
      requestedFields.forEach((elem) => {
        switch (elem) { // add requested fields (status, ...) to db query
          case null:
            break;
          case 'status': // select id and status in query
            fields += ' status';
            break;
          case 'user':
            fields += ' user';
            break;
          case '':
            break;
          default:
            e = new Error('unsupported field');
            e.field = elem;
            throw e;
        }
      });
    } catch (e) {
      res.status(400).send({ error: 'unsupported field requested: ' + e.field });
      return;
    }

    fields = fields.trim();
  }

  Job.find(filter).select(fields).skip(start).limit(limit).lean().exec((err, jobs) => {
    if (err) {
      res.status(500).send({ error: 'job query failed' });
    } else {
      if (jobs.length < 1) {
        debug('Search for jobs has empty result: %o', req.query);
      }

      PublicLink.find({}).select('id').lean().exec((err, links) => {
        if (err) {
          res.status(500).send({ error: 'link query failed' });
        } else {
          let link_ids = links.map((link) => {
            return link.id;
          });
    
          if (requestedFields.length < 1) {
            answer.results = jobs.map((job) => {
              if (link_ids.indexOf(job.compendium_id) < 0)
                return job.id;
            }).filter(elem => {
              return elem != null;
            });
          } else {
            answer.results = jobs.map((job) => {
              if (link_ids.indexOf(job.compendium_id) < 0) 
                jobItem = { id: job.id };
                requestedFields.forEach((elem) => {
                  jobItem[elem] = job[elem];
                });
      
                return jobItem;
            }).filter(elem => {
              return elem != null;
            });
          }
    
          res.status(200).send(answer); 
        }
      });
    }
  });
};

exports.viewJob = (req, res) => {
  let job_id = req.params.id;
  debug('View job %s', job_id);

  resolve_public_link(req.body.compendium_id, (ident) => {
    let id = null;
    if (ident.is_link) {
      id = ident.link;
    } else {
      id = ident.compendium;
    }

    let steps = [];
    if (req.query.steps) {
      steps = req.query.steps.split(',').map(f => { return f.trim(); });
    }
    let answer = { id: job_id };

    Job.findOne({ id: job_id }).select("compendium_id status steps").lean().exec((err, job) => {
      // eslint-disable-next-line no-eq-null, eqeqeq
      if (err || job == null) {
        debug('[%s] error retrieving job %s: %s', job_id, err);
        res.status(404).send({ error: 'no job with this id' });
      } else {
        debug('[%s] Found job, returning it with steps %o', job_id, steps);
        answer.compendium_id = job.compendium_id;
        answer.status = job.status;

        answer.steps = {};
        if (steps.length === 1 && steps[0] === allStepsValue) {
          answer.steps = job.steps;
        } else {
          for (let step in job.steps) {
            if (steps.includes(step)) {
              // add with all details
              answer.steps[step] = job.steps[step];
            } else {
              // add defaults
              if (job.steps.hasOwnProperty(step)) {
                answer.steps[step] = pick(job.steps[step], alwaysStepFields);
              }
            }
          }
        }

        try {
          fullPath = path.join(config.fs.job, job_id)
          fs.accessSync(fullPath); // throws if directory does not exist

          answer.files = rewriteTree(dirTree(fullPath),
            fullPath.length, // remove local fs path and id
            urlJoin(config.api.resource.job, job_id, config.api.sub_resource.data)
          );
        } catch (e) {
          debug('ERROR: No data files found for job %s. Fail? %s', id, config.fs.fail_on_no_files);
          if (config.fs.fail_on_no_files) {
            res.status(500).send({ error: 'internal error: could not read job files from storage', e });
            return;
          } else {
            answer.filesMissing = true;
          }
        }
        res.status(200).send(answer);
      }
    });
  });
};

exports.createJob = (req, res) => {
  let job_id = randomstring.generate(config.id_length);
  debug('[%s] Create job for %s', job_id, req.body.compendium_id);

  // check parameters
  if (!req.body.compendium_id) {
    debug('[%s] compendium_id parameter not provided', job_id);
    res.status(400).send({ error: 'compendium_id required' });
  }

  resolve_public_link(req.body.compendium_id, (ident) => {
    let id = null;
    if (ident.is_link) {
      id = ident.link;
      req.user = { orcid: 'link.' + ident.link };
    } else {
      id = ident.compendium;
    
      // check user level
      if (!req.isAuthenticated()) {
        res.status(401).send({ error: 'user is not authenticated' });
        return;
      }
      if (req.user.level < config.user.level.create_job) {
        res.status(403).send({ error: 'user level does not allow job creation' });
        return;
      }
    }

    // check compendium existence and load its metadata
    Compendium.findOne({ id: ident.compendium }).select('id candidate metadata bag compendium').exec((err, compendium) => {
      // eslint-disable-next-line no-eq-null, eqeqeq
      if (err || compendium == null) {
        debug('[%s] compendium not found, cannot create job: %o', job_id, ident);
        res.status(400).send({ error: 'compendium is a candidate, cannot start job' });
      } else {
        debug('[%s] found compendium "%s" (candidate? %s) - create job!', job_id, id, compendium.candidate);

        var executionJob = new Job({
          id: job_id,
          user: req.user.orcid,
          compendium_id: id
        });

        executionJob.save(err => {
          if (err) {
            debug('[%s] error starting job for compendium %s and user %s', job_id, compendium.id, req.user.orcid);
            throw new Error('error creating job');
          } else {
            var execution = new Executor(job_id, compendium );
            execution.execute();
            res.status(200).send({ job_id });
            debug("[%s] Request complete and response sent; job for compendium %s started.", job_id, id);
          }
        });
      }
    });
  });
};

exports.viewPath = (req, res) => {
  debug('View job path %s', req.params.path);
  let size = req.query.size || null;
  let id = req.params.id;
  Job.findOne({id}).select('id').exec((err, job) => {
    if (err || job == null) {
      res.status(404).send({error: 'no job with this id'});
    } else {
      let localPath = path.join(config.fs.job, id, req.params.path);
      try {
        innerSend = function(response, filePath) {
          mimetype = mime.path(filePath).type;              
          response.type(mimetype).sendFile(filePath, {}, (err) => {
            if (err) {
              debug("Error viewing path: %o", err)
            } else {
              debug('Returned %s for %s as %s', filePath, req.params.path, mimetype);
            }
          });
        }

        debug('Accessing %s', localPath);
        fs.accessSync(localPath); //throws if does not exist
        if(size) {
          resize(localPath, size, (finalPath, err) => {
            if (err) {
              let status = code || 500;
              res.status(status).send({ error: err});
              return;
            }

            innerSend(res, finalPath);
          });
        } else {
          innerSend(res, localPath);
        }
      } catch (e) {
        debug(e);
        res.setHeader('Content-Type', 'application/json');
        res.status(500).send({ error: e.message });
        return;
      }
    }
  });
};
