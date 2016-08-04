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
var Promise             = require('bluebird');
var exec                = require('child_process').exec;
var randomstring        = require('randomstring');
var fse                 = require('fs-extra');

// mongo connection
var mongoose            = require('mongoose');
mongoose.connect(c.mongo.location + c.mongo.collection);
mongoose.connection.on('error', () => {
  console.log('could not connect to mongodb on ' + c.mongo.location + c.mongo.collection +', ABORT');
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

// Passport modules for OAuth2
var User                = require('./lib/model/user');
var passport            = require('passport');
var OAuth2Strategy      = require('passport-oauth2').Strategy;
var session             = require('express-session');
var MongoDBStore        = require('connect-mongodb-session')(session);

/*
 *  File Upload
 */

// check fs & create dirs if necessary
fse.mkdirsSync(c.fs.incoming);
fse.mkdirsSync(c.fs.compendium);
fse.mkdirsSync(c.fs.job);

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
 */

// simple check for api key when uploading new compendium
app.use('/api/v1/compendium', (req, res, next) => {
  if ( (req.method === 'POST') && (req.get('X-API-Key') !== c.api_key) ) {
      res.status(401).send('{"error":"missing or wrong api key"}');
  } else {
    next();
  }
});

// OAuth2 Strategy, configured with config.js settings.
var oauth2 = new OAuth2Strategy(
  c.oauth.default,
  (req, accessToken, refreshToken, params, profile, cb) => {
    console.log("params:", params);
    return cb(null, profile);
  }
);

oauth2.userProfile = (accessToken, cb) => {
  console.log('overwritten accesToken', accessToken);
  // At this point, the Request for a access Token has already been made, and the original orcid id can't be accessed anymore in the request. 
  // If it would be possible to gather the orcid id from a API request with this access token, we could retrieve the User Profile and the problem would be solved.
  return cb(null, {});
};


passport.use(oauth2);

// minimal serialize/deserialize to make authdetails cookie-compatible.
passport.serializeUser((user, cb) => {
  debug('serialize');
  debug(user);
  cb(null, user);
});
passport.deserializeUser((user, cb) => {
  debug('deserialize');
  debug(user);
  cb(null, user);
});

// configure express-session, stores reference to authdetails in cookie.
// authdetails themselves are stored in MongoDBStore
var mongoStore = new MongoDBStore({
  uri: c.mongo.location + c.mongo.database,
  collection: 'Sessions'
});

mongoStore.on('error', err => {
  debug(err);
});

app.use(session({
  secret: c.sessionsecret,
  resave: true,
  saveUninitialized: true,
  maxAge: 60*60*24*7, // cookies become invalid after one week
  store: mongoStore
}));

app.use(passport.initialize());
app.use(passport.session());

// This is the authentication route, should be used as a Callback URL in OAuth2 workflow.
app.get('/auth/orcid', passport.authenticate('oauth2'), (req, res) => {
  debug(req.query.code);
  res.send('authenticated!');
});

/*
 *  Routes & general Middleware
 */

app.use('/api/', (req, res, next) => {
  res.setHeader('Content-Type', 'application/json');
  next();
});

app.use('/', (req, res, next) => {
  debug(req.method + ' ' + req.path);
  if(req.isAuthenticated()) {
    debug('authenticated user');
    debug(req.user);
  }
  next();
});

// Set up Routes
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
