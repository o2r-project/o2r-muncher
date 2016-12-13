/*
 * (C) Copyright 2016 o2r-project
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
const debug = require('debug')('muncher');
const c = require('./config/config');
const randomstring = require('randomstring');
const fse = require('fs-extra');
const backoff = require('backoff');
const debugPuller = require('debug')('muncher:puller');
const child_process = require('child_process');

// mongo connection
const mongoose = require('mongoose');
const dbURI = c.mongo.location + c.mongo.database;
// see http://blog.mlab.com/2014/04/mongodb-driver-mongoose/#Production-ready_connection_settings and http://mongodb.github.io/node-mongodb-native/2.1/api/Server.html and http://tldp.org/HOWTO/TCP-Keepalive-HOWTO/overview.html
var dbOptions = {
  server: {
    auto_reconnect: true,
    reconnectTries: Number.MAX_VALUE,
    socketOptions: { keepAlive: 30000, connectTimeoutMS: 30000, autoReconnect: true }
  }
};
mongoose.connection.on('error', (err) => {
  debug('Could not connect to MongoDB @ %s: %s', dbURI, err);
});
// If the Node process ends, close the Mongoose connection 
process.on('SIGINT', function () {
  mongoose.connection.close(function () {
    debug('Mongoose default connection disconnected through app termination signal (SIGINT)');
    process.exit(0);
  });
});

// Express modules and tools
const express = require('express');
const compression = require('compression');
const bodyParser = require('body-parser');

const app = express();
app.use(compression());
app.use(bodyParser.json());

// load controllers
var controllers = {};
controllers.compendium = require('./controllers/compendium');
controllers.job = require('./controllers/job');

// passport & session modules for authenticating users.
const User = require('./lib/model/user');
const passport = require('passport');
const session = require('express-session');
const MongoDBStore = require('connect-mongodb-session')(session);

// Less crucial things
const starwars = require('starwars');

/*
 *  File Upload
 */
// check fs & create dirs if necessary
fse.mkdirsSync(c.fs.incoming);
fse.mkdirsSync(c.fs.compendium);
fse.mkdirsSync(c.fs.job);
fse.mkdirsSync(c.payload.tarball.tmpdir);

var multer = require('multer');
var storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, c.fs.incoming);
  },
  filename: (req, file, cb) => {
    cb(null, randomstring.generate(c.id_length));
  }
});
var upload = multer({ storage: storage });

/*
 *  Authentication & Authorization
 *  This is be needed in every service that wants to check if a user is authenticated.
 */
// minimal serialize/deserialize to make authdetails cookie-compatible.
passport.serializeUser((user, cb) => {
  cb(null, user.orcid);
});
passport.deserializeUser((user, cb) => {
  User.findOne({ orcid: user }, (err, user) => {
    if (err) cb(err);
    cb(null, user);
  });
});

function initApp(callback) {
  debug('Initialize application...');

  try {
    // configure express-session, stores reference to authdetails in cookie.
    // authdetails themselves are stored in MongoDBStore
    var mongoStore = new MongoDBStore({
      uri: dbURI,
      collection: 'sessions'
    }, err => {
      if (err) {
        debug('Error starting MongoStore: %s', err);
      }
    });

    mongoStore.on('error', err => {
      debug('Error with MongoStore: %s', err);
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
    app.get('/status', function (req, res) {
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

    app.get('/api', function (req, res) {
      indexResponse.quote = starwars();
      res.send(indexResponse);
    });

    app.get('/api/v1', function (req, res) {
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
        c.version.bug + ' with API version ' + c.version.api +
        ' waiting for requests on port ' + c.net.port);
    });

    // pull the required images for upload steps
    let images = [c.bagtainer.metaextract.image];
    images.forEach(image => {
      debugPuller('pulling %s ...', image);

      let puller = child_process.exec('docker pull ' + image, (error, stdout, stderr) => {
        if (error | stderr) {
          debugPuller(error, stderr, stdout);
          debugPuller('[%s] error pulling image: %s', image, JSON.stringify(error));
        }
        else {
          debugPuller('\n%s', stdout);
          debugPuller('[%s] pull complete', image);
        }
      });
      puller.on('exit', (code) => {
        debugPuller('[%s] finished with code %s', image, code);
      });
    });
  } catch (err) {
    callback(err);
  }

  callback(null);
}

// auto_reconnect is on by default and only for RE(!)connects, not for the initial attempt: http://bites.goodeggs.com/posts/reconnecting-to-mongodb-when-mongoose-connect-fails-at-startup/
var dbBackoff = backoff.fibonacci({
  randomisationFactor: 0,
  initialDelay: c.mongo.inital_connection_initial_delay,
  maxDelay: c.mongo.inital_connection_max_delay
});

dbBackoff.failAfter(c.mongo.inital_connection_attempts);
dbBackoff.on('backoff', function (number, delay) {
  debug('Trying to connect to MongoDB (#%s) in %sms', number, delay);
});
dbBackoff.on('ready', function (number, delay) {
  debug('Connect to MongoDB (#%s)', number, delay);
  mongoose.connect(dbURI, dbOptions, (err) => {
    if (err) {
      debug('Error during connect: %s', err);
      mongoose.disconnect(() => {
        debug('Mongoose: Disconnected all connections.');
      });
      dbBackoff.backoff();
    } else {
      // delay app startup to when MongoDB is available
      debug('Initial connection open to %s: %s', dbURI, mongoose.connection.readyState);
      initApp((err) => {
        if (err) {
          debug('Error during init!\n%s', err);
          mongoose.disconnect(() => {
            debug('Mongoose: Disconnected all connections.');
          });
          dbBackoff.backoff();
        }
        debug('Started application.');
      });
    }
  });
});
dbBackoff.on('fail', function () {
  debug('Eventually giving up to connect to MongoDB');
  process.exit(1);
});

dbBackoff.backoff();
