/*
 * (C) Copyright 2016 Jan Koppe.
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
var exec = require('child_process').exec;
var randomstring = require('randomstring');
var fs = require('fs');
var fse = require('fs-extra');

var dirTree = require('directory-tree');

var Executor = require('../lib/executor').Executor;

var Job = require('../lib/model/job');

exports.view = (req, res) => {
  var answer = {};
  var filter_query = '';
  var filter = {};
  var limit  = parseInt(req.query.limit || c.list_limit);
  var start  = parseInt(req.query.start || 1) - 1;
  if(req.query.compendium_id != null) {
    filter.compendium_id = req.query.compendium_id;
    filter_query = '&compendium_id=' + req.query.compendium_id;
  }
  if(start > 1) {
    answer.previous = req.route.path + '?limit=' + limit + '&start=' + start + filter_query;
  }
  var that = this;
  Job.find(filter).select('id').skip(start * limit).limit(limit).exec((err, jobs) => {
    if(err) {
      res.status(500).send(JSON.stringify({ error: 'query failed'}));
    } else {
      var count = jobs.length;
      if (count <= 0) {
        res.status(404).send(JSON.stringify({ error: 'no jobs found' }));
      } else {
        if (count >= limit) {
          answer.next = req.route.path + '?limit=' + limit + '&start' +
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
  var answer = {id};
  var tree;
    /* TODO:
     *
     * directory-tree has no support for a alternative basename. this is needed
     * so that we can substitute the on-disk basepath (which is returned by
     * default) with a api-relative basepath, e.g. /api/v1/job/:id/files
     *
     * Options:
     * - add functionality to directory-tree, make pull request
     * - wrapper around directory-tree
     * - fork directory-tree
     *
     * We also need additional features, like MIME type recognition, etc.
     */
  Job.findOne({id}).exec((err, job) => {
    if (err || job == null) {
      res.status(404).send(JSON.stringify({ error: 'no job with this id' }));
    } else {
      debug(job);
      answer.compendium_id = job.compendium_id;
      answer.steps = job.steps;
      try {
        fs.accessSync(c.fs.job + id); //throws if does not exist
        answer.files = dirTree(c.fs.job + id);
      } catch (e) {
        res.status(500).send(JSON.stringify({ error: 'internal error', e}));
        return;
      }
      res.status(200).send(JSON.stringify(answer));
    }
  });
};
exports.create = (req, res) => {
  var compendium_id = '';
  var job_id = randomstring.generate(c.id_length);
  try {
    if(!(req.body.compendium_id)) {
      throw 'need compendium_id';
    } else {
      compendium_id = req.body.compendium_id;
    }
    var executionJob = new Job({
      id : job_id,
      compendium_id : compendium_id,
    });
    executionJob.save((err) => {
      if (err) {
        throw 'error creating job';
      } else {
        fse.copySync(c.fs.compendium + compendium_id, c.fs.job + job_id);
        var execution = new Executor(job_id, c.fs.job).execute();
        res.status(200).send(JSON.stringify({job_id}));
      }
    });
  }
  catch (error) {
    res.status(500).send(JSON.stringify({error}));
  }
};
