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

exports.view = (req, res) => {
  var answer = {};
  var limit = parseInt(req.query.limit || c.list_limit);
  var start = parseInt(req.query.start || 1);
  try {
    // TODO: needs proper database!!!
    fs.readdir(c.fs.job, (err, files) => {
      var firstElem = start - 1; //subtract 1 because 0-indexed array
      var lastElem = firstElem + limit;
      // check length of file listing - if elements are left, generate next link
      if(files.length < lastElem) {
        lastElem = files.length;
      } else {
        answer.next = req.route.path + '?limit=' + limit +
          '&start=' + (start + 1);
      }

      if(start > 1) {
        answer.previous = req.route.path + '?limit=' + limit +
          '&start=' + (start - 1);
      }

      filesSlice = files.slice(firstElem, lastElem);
      answer.results = filesSlice;
      res.status(200).send(JSON.stringify(answer));
    });
  }
  catch (e) {
    res.status(404).send(JSON.stringify({ error: 'no jobs found' }));
  }

};

exports.viewSingle = (req, res) => {
  var id = req.params.id;
  var answer = {};
  // Dirty mockup - no database integration yet, so search on disk!
  try {
    //TODO: Magic Number. ID Length should be equal to global ID length.
    if(id.length !== 5) {
      throw 'id length wrong';
    }
    fs.accessSync(c.fs.job + id); //throws if does not exist
    var tree = dirTree(c.fs.job + id);
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
    answer.id = id;
    answer.metadata = {};
    answer.files = tree;

    res.status(200).send(JSON.stringify(answer));
  }
  catch (e) {
    res.status(404).send(JSON.stringify({ error: 'no job with this id' }));
  }

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
    // TODO: needs proper database check
    // TODO: needs to throw right message. easily solved with database.
    fs.accessSync(c.fs.compendium + compendium_id);
    // make job-copy of compendium TODO: copy async
    fse.copySync(c.fs.compendium + compendium_id, c.fs.job + job_id);
    var execution = new Executor(job_id, c.fs.job).execute();
    res.status(200).send(JSON.stringify(job_id));
  }
  catch (error) {
    res.status(500).send(JSON.stringify(error));
  }
};
