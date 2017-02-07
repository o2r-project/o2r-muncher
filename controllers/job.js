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
var randomstring = require('randomstring');
var fs = require('fs');
var fse = require('fs-extra');

var dirTree = require('directory-tree');
var rewriteTree = require('../lib/rewrite-tree');

var Executor = require('../lib/executor').Executor;

var Job = require('../lib/model/job');

exports.view = (req, res) => {
  var answer = {};
  var filter_query = '';
  var filter = {};
  var limit = parseInt(req.query.limit || c.list_limit, 10);
  var start = parseInt(req.query.start || 1, 10) - 1;

  // eslint-disable-next-line no-eq-null, eqeqeq
  if (req.query.compendium_id != null) {
    filter.compendium_id = req.query.compendium_id;
    filter_query = '&compendium_id=' + req.query.compendium_id;
  }
  // eslint-disable-next-line no-eq-null, eqeqeq
  if (req.query.user != null) {
    filter.user = req.query.user;
    filter_query = filter_query + '&user=' + req.query.user;
  }

  //filtering for status
  if (req.query.status != null) {
    filter.status = req.query.status;
    filter_query = filter_query + '&status=' + req.query.status;
  }

  if (start >= 1) {
    answer.previous = req.route.path + '?limit=' + limit + '&start=' + start + filter_query;
  }

  Job.find(filter).select('id').skip(start * limit).limit(limit).exec((err, jobs) => {
    if (err) {
      res.status(500).send(JSON.stringify({ error: 'query failed' }));
    } else {
      var count = jobs.length;
      if (count <= 0) {
        res.status(404).send(JSON.stringify({ error: 'no jobs found' }));
      } else {
        if (count >= limit) {
          answer.next = req.route.path + '?limit=' + limit + '&start=' +
            (start + 2) + filter_query;
        }

        answer.results = jobs.map((job) => { return job.id; });
        res.status(200).send(JSON.stringify(answer));
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
      res.status(404).send(JSON.stringify({ error: 'no job with this id' }));
    } else {
      debug(job);
      answer.compendium_id = job.compendium_id;
      answer.steps = job.steps;
      answer.status = job.status;
      try {
        fs.accessSync(c.fs.job + id); // throws if directory does not exist

        answer.files = rewriteTree(dirTree(c.fs.job + id),
          c.fs.job.length + c.id_length, // remove local fs path and id
          '/api/v1/job/' + id + '/data' // prepend proper location
        );
      } catch (e) {
        res.status(500).send(JSON.stringify({ error: 'internal error', e }));
        return;
      }
      res.status(200).send(JSON.stringify(answer));
    }
  });
};

exports.create = (req, res) => {
  var compendium_id = '';
  var job_id = randomstring.generate(c.id_length);

  // check user level
  if (!req.isAuthenticated()) {
    res.status(401).send('{"error":"user is not authenticated"}');
    return;
  }
  if (req.user.level < c.user.level.create_job) {
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
        var job_path = c.fs.job + job_id;
        var compendium_path = c.fs.compendium + compendium_id;
        fse.copySync(compendium_path, job_path); // throws error if it does not exist

        var execution = new Executor(job_id, c.fs.job);
        execution.execute();
        res.status(200).send(JSON.stringify({job_id}));
        debug("[%s] Reqeuest complete and response sent; job executes compendium %s and is saved to database; job files are at %s", 
          job_id, compendium_id, job_path);
        //  throw new Error('compendium path does not exist for compendium id ' + compendium_id);
      }
    });
  } catch (error) {
    res.status(500).send(JSON.stringify({ error }));
  }
};
