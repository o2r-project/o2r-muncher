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
const debug = require('debug')('job');
const randomstring = require('randomstring');
const fs = require('fs');
const path = require('path');
const urlJoin = require('url-join');
const pick = require('lodash.pick');

const dirTree = require('directory-tree');
const rewriteTree = require('../lib/rewrite-tree');

const Executor = require('../lib/executor').Executor;

const Compendium = require('../lib/model/compendium');
const Job = require('../lib/model/job');

const alwaysStepFields = ["start", "end", "status"];
const allStepsValue = "all";

exports.listJobs = (req, res) => {
  var answer = {};
  var filter = {};
  var limit = parseInt(req.query.limit || config.list_limit, 10);
  var start = parseInt(req.query.start || 1, 10) - 1;
  var fields = 'id';

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
        debug('Search for jobs has empty result.');
      }

      if (requestedFields.length < 1) {
        answer.results = jobs.map((job) => {
          return job.id;
        });
      } else {
        answer.results = jobs.map((job) => {
          jobItem = { id: job.id };
          requestedFields.forEach((elem) => {
            jobItem[elem] = job[elem];
          });

          return jobItem;
        });
      }

      res.status(200).send(answer);
    }
  });
};

exports.viewJob = (req, res) => {
  let id = req.params.id;
  let steps = [];
  if (req.query.steps) {
    steps = req.query.steps.split(',').map(f => { return f.trim(); });
  }
  let answer = { id };

  Job.findOne({ id }).select("compendium_id status steps").lean().exec((err, job) => {
    // eslint-disable-next-line no-eq-null, eqeqeq
    if (err || job == null) {
      debug('[%s] error retrieving job %s: %s', id, err);
      res.status(404).send({ error: 'no job with this id' });
    } else {
      debug('[%s] Found job, returning it with steps %s', id, JSON.stringify(steps));
      answer.compendium_id = job.compendium_id;
      answer.status = job.status;

      answer.steps = {};
      if (steps.length === 1 && steps[0] === allStepsValue) {
        answer.steps = job.steps;
      } else {
        for (var step in job.steps) {
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
        fullPath = path.join(config.fs.job, id)
        fs.accessSync(fullPath); // throws if directory does not exist

        answer.files = rewriteTree(dirTree(fullPath),
          fullPath.length, // remove local fs path and id
          urlJoin(config.api.resource.job, id, config.api.sub_resource.data)
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
};

exports.createJob = (req, res) => {
  let compendium_id = '';
  let job_id = randomstring.generate(config.id_length);

  // check user level
  if (!req.isAuthenticated()) {
    res.status(401).send({ error: 'user is not authenticated' });
    return;
  }
  if (req.user.level < config.user.level.create_job) {
    res.status(401).send({ error: 'user level does not allow job creation' });
    return;
  }

  // check parameters
  if (req.body.compendium_id) {
    compendium_id = req.body.compendium_id;
  } else {
    debug('[%s] compendium_id parameter not provided', job_id);
    res.status(400).send({ error: 'compendium_id required' });
  }

  // check compendium existence and load its metadata
  Compendium.findOne({ id: compendium_id }).select('id candidate metadata bag compendium').exec((err, compendium) => {
    // eslint-disable-next-line no-eq-null, eqeqeq
    if (err || compendium == null) {
      debug('[%s] compendium "%s" not found, cannot create job', job_id, compendium_id);
      res.status(400).send({ error: 'compendium is a candidate, cannot start job' });
    } else {
      if (compendium.candidate) {
        debug('[%s] compendium "%s" is a candidate, not starting job', job_id, compendium_id);
        res.status(400).send({ error: 'compendium is a candidate, cannot start job' });
      } else {
        debug('[%s] found compendium "%s" and it is not a candidate, can create job!', job_id, compendium.id);

        var executionJob = new Job({
          id: job_id,
          user: req.user.orcid,
          compendium_id: compendium.id
        });

        executionJob.save(err => {
          if (err) {
            debug('[%s] error starting job for compendium %s and user %s', job_id, compendium.id, req.user.orcid);
            throw new Error('error creating job');
          } else {
            var execution = new Executor(job_id, compendium);
            execution.execute();
            res.status(200).send({ job_id });
            debug("[%s] Request complete and response sent; job for compendium %s started.", job_id, compendium_id);
          }
        });
      }
    }
  });
};
