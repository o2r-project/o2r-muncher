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
var debug = require('debug')('muncher');
var c = require('./config/config');
var Promise = require('bluebird');
var exec = require('child_process').exec;
var randomstring = require('randomstring');
var fse = require('fs-extra');
// mongo connection
var mongoose = require('mongoose');
mongoose.connect(c.mongo.location + c.mongo.collection);
mongoose.connection.on('error', () => {
  debug('could not connect to mongodb on ' + c.mongo.location + c.mongo.collection +', ABORT');
  process.exit(1);
});
// Express modules and tools
var express = require('express');
var compression = require('compression');
var bodyParser = require('body-parser');
var app = express();
app.use(compression());
app.use(bodyParser.json());

// file upload

// check fs & create dirs if necessary
fse.mkdirsSync(c.fs.incoming);
fse.mkdirsSync(c.fs.compendium);
fse.mkdirsSync(c.fs.job);

var multer = require('multer');
var storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, c.fs.incoming);
  },
  filename: (req, file, cb) => {
    cb(null, randomstring.generate(c.id_length));
  }
});
var upload = multer({storage: storage});

// Simple Express Middlewares
app.use('/', (req, res, next) => {
  debug(req.method + ' ' + req.path);
  next();
});

app.use('/api/', (req, res, next) => {
  res.setHeader('Content-Type', 'application/json');
  next();
});

app.use('/', (req, res, next) => {
  // prevent directory traversal via ids
  if(req.params != null && req.params.id != null) {
    req.params.id = req.params.id.replace('/', '');
  }
  next();
});

// load controllers
var controllers = {};
controllers.compendium = require('./controllers/compendium');
controllers.job        = require('./controllers/job');

app.get('/api/v1/compendium', controllers.compendium.view);
app.post('/api/v1/compendium', upload.single('compendium'), controllers.compendium.create);
app.get('/api/v1/compendium/:id', controllers.compendium.viewSingle);
app.get('/api/v1/compendium/:id/jobs', controllers.compendium.viewSingleJobs);

app.get('/api/v1/job', controllers.job.view);
app.post('/api/v1/job', upload.any(), controllers.job.create);
app.get('/api/v1/job/:id', controllers.job.viewSingle);

app.listen(c.net.port, () => {
  debug('muncher '+  c.version.major + '.' + c.version.minor + '.' +
      c.version.bug + ' with api version ' + c.version.api +
      ' waiting for requests on port ' + c.net.port);
});
