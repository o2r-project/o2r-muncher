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
var debug               = require('debug')('muncher');
var c                   = require('./config/config');
var randomstring        = require('randomstring');
var fse                 = require('fs-extra');

// mongo connection
var mongoose            = require('mongoose');
mongoose.connect(c.mongo.location + c.mongo.database);
mongoose.connection.on('error', () => {
  console.log('could not connect to mongodb on ' + c.mongo.location + c.mongo.database + ', ABORT');
  process.exit(2);
});

// Express modules and tools
var express             = require('express');
var compression         = require('compression');
var bodyParser          = require('body-parser');
var app                 = express();
app.use(compression());
app.use(bodyParser.json());

// load controllers
var controllers = {};
controllers.compendium  = require('./controllers/compendium');
controllers.job         = require('./controllers/job');

// Passport & session modules for authenticating users.
var User                = require('./lib/model/user');
var passport            = require('passport');
var session             = require('express-session');
var MongoDBStore        = require('connect-mongodb-session')(session);

// Less crucial things
var starwars            = require('starwars');

/*
 *  File Upload
 */

// check fs & create dirs if necessary
fse.mkdirsSync(c.fs.incoming);
fse.mkdirsSync(c.fs.compendium);
fse.mkdirsSync(c.fs.job);
fse.mkdirsSync(c.payload.tarball.tmpdir);

var multer              = require('multer');
var storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, c.fs.incoming);
  },
  filename: (req, file, cb) => {
    cb(null, randomstring.generate(c.id_length));
  }
});
var upload = multer({storage: storage});

/*
 *  Authentication & Authorization
 *  This is be needed in every service that wants to check if a user is authenticated.
 */

// minimal serialize/deserialize to make authdetails cookie-compatible.
passport.serializeUser((user, cb) => {
  cb(null, user.orcid);
});
passport.deserializeUser((user, cb) => {
  User.findOne({orcid: user}, (err, user) => {
    if (err) cb(err);
    cb(null, user);
  });
});

// configure express-session, stores reference to authdetails in cookie.
// authdetails themselves are stored in MongoDBStore
var mongoStore = new MongoDBStore({
  uri: c.mongo.location + c.mongo.database,
  collection: 'sessions'
});

mongoStore.on('error', err => {
  debug(err);
});

app.use(session({
  secret: c.sessionsecret,
  resave: true,
  saveUninitialized: true,
  maxAge: 60 * 60 * 24 * 7, // cookies become invalid after one week
  store: mongoStore
}));

app.use(passport.initialize());
app.use(passport.session());

/*
 *  Routes & general Middleware
 */

app.use('/', (req, res, next) => {
  var orcid = '';
  if (req.user && req.user.orcid) {
    orcid = ' | orcid: ' + req.user.orcid;
  }
  debug('REQUEST %s %s authenticated user: %s | session: %s',
    req.method, req.path, req.isAuthenticated(), req.session.id, orcid);
  next();
});

const indexResponse = {};
indexResponse.about = 'http://o2r.info';
indexResponse.versions = {};
indexResponse.versions.current = '/api/v1';
indexResponse.versions.v1 = '/api/v1';

const indexResponseV1 = {};
indexResponseV1.auth = '/api/v1/auth';
indexResponseV1.compendia = '/api/v1/compendium';
indexResponseV1.jobs = '/api/v1/job';
indexResponseV1.users = '/api/v1/user';

// set up routes
app.get('/status', function(req, res) {
  res.setHeader('Content-Type', 'application/json');
  if (!req.isAuthenticated() || req.user.level < c.user.level.view_status) {
    res.status(401).send('{"error":"not authenticated or not allowed"}');
    return;
  }

  var response = {
    name: "muncher",
    version: c.version,
    levels: c.user.level,
    mongodb: c.mongo,
    filesystem: c.fs
  };
  res.send(response);
});

// set content type for all responses (muncher never serves content)
app.use('/api/', (req, res, next) => {
  res.setHeader('Content-Type', 'application/json');
  next();
});

app.get('/api', function(req, res) {
  indexResponse.quote = starwars();
  res.send(indexResponse);
});

app.get('/api/v1', function(req, res) {
  res.send(indexResponseV1);
});

app.get('/api/v1/compendium', controllers.compendium.view);
app.post('/api/v1/compendium', upload.single('compendium'), controllers.compendium.create);
app.get('/api/v1/compendium/:id', controllers.compendium.viewSingle);
app.get('/api/v1/compendium/:id/jobs', controllers.compendium.viewSingleJobs);

app.get('/api/v1/job', controllers.job.view);
app.post('/api/v1/job', upload.any(), controllers.job.create);
app.get('/api/v1/job/:id', controllers.job.viewSingle);

app.listen(c.net.port, () => {
  debug('muncher ' + c.version.major + '.' + c.version.minor + '.' +
      c.version.bug + ' with api version ' + c.version.api +
      ' waiting for requests on port ' + c.net.port);
});
