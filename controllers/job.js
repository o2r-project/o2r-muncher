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

var config = require('../config/config');
var debug = require('debug')('job');
var randomstring = require('randomstring');
var fs = require('fs');
var fse = require('fs-extra');

var dirTree = require('directory-tree');
var rewriteTree = require('../lib/rewrite-tree');

var Executor = require('../lib/executor').Executor;

var Job = require('../lib/model/job');

exports.view = (req, res) => {
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

  switch (req.query.fields) { //add requested fields (status, ...) to db query
    case null:
      break;
    case 'status': // select id and status in query
      fields += ' status';
  }

  Job.find(filter).select(fields).skip(start).limit(limit).exec((err, jobs) => {
    if (err) {
      res.status(500).send({ error: 'query failed' });
    } else {
      var count = jobs.length;
      if (count <= 0) {
        res.status(404).send({ error: 'no jobs found' });
      } else {
        
        switch (req.query.fields) { //return requested fields
          case 'status':
            answer.results = jobs.map((job) => { return {id: job.id, status: job.status}; });
            break;
          default:
            answer.results = jobs.map((job) => { return job.id; });            
        }
        res.status(200).send(answer);
      }
    }
  });
};

exports.viewSingle = (req, res) => {
  var id = req.params.id;
  var answer = { id };

  Job.findOne({ id }).exec((err, job) => {
    // eslint-disable-next-line no-eq-null, eqeqeq
    if (err || job == null) { // intentially loose comparison
      res.status(404).send({ error: 'no job with this id' });
    } else {
      debug(job);
      answer.compendium_id = job.compendium_id;
      answer.steps = job.steps;
      answer.status = job.status;
      try {
        fs.accessSync(config.fs.job + id); // throws if directory does not exist

        answer.files = rewriteTree(dirTree(config.fs.job + id),
          config.fs.job.length + config.id_length, // remove local fs path and id
          '/api/v1/job/' + id + '/data' // prepend proper location
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

exports.create = (req, res) => {
  let compendium_id = '';
  let job_id = randomstring.generate(config.id_length);

  // check user level
  if (!req.isAuthenticated()) {
    res.status(401).send('{"error":"user is not authenticated"}');
    return;
  }
  if (req.user.level < config.user.level.create_job) {
    res.status(401).send('{"error":"user level does not allow job creation"}');
    return;
  }

  var user_id = req.user.orcid;

  try {
    if (req.body.compendium_id) {
      compendium_id = req.body.compendium_id;
    } else {
      throw new Error('compendium_id required');
    }

    var executionJob = new Job({
      id: job_id,
      user: user_id,
      compendium_id: compendium_id
    });
    executionJob.save(err => {
      if (err) {
        debug("ERROR starting job %s for compendium %s and user %s", job_id, compendium_id, user_id);
        throw new Error('error creating job');
      } else {
        var job_path = config.fs.job + job_id;
        var compendium_path = config.fs.compendium + compendium_id;
        fse.copySync(compendium_path, job_path); // throws error if it does not exist

        var execution = new Executor(job_id, config.fs.job);
        execution.execute();
        res.status(200).send({job_id});
        debug("[%s] Request complete and response sent; job executes compendium %s and is saved to database; job files are at %s", 
          job_id, compendium_id, job_path);
      }
    });
  } catch (error) {
    res.status(500).send({ error: error.message });
  }
};
