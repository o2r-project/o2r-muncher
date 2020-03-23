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

// General modules
const debug = require('debug')('muncher');
const config = require('./config/config');
const fse = require('fs-extra');
const backoff = require('backoff');
const exec = require('child_process').exec;
const starwars = require('starwars');
const Docker = require('dockerode');
const url = require('url');

// handle unhandled rejections
process.on('unhandledRejection', (reason) => {
  debug('Unhandled rejection: %s\n%s'.red, reason, reason.stack);
});

// mongo connection
const mongoose = require('mongoose');
const dbURI = config.mongo.location + config.mongo.database;
// see http://blog.mlab.com/2014/04/mongodb-driver-mongoose/#Production-ready_connection_settings and http://mongodb.github.io/node-mongodb-native/2.1/api/Server.html and http://tldp.org/HOWTO/TCP-Keepalive-HOWTO/overview.html
var dbOptions = {
  autoReconnect: true,
  reconnectTries: Number.MAX_VALUE,
  keepAlive: 30000,
  socketTimeoutMS: 30000,
  promiseLibrary: mongoose.Promise, // use ES6 promises for mongoose
  useNewUrlParser: true
};
mongoose.connection.on('error', (err) => {
  debug('Could not connect to MongoDB @ %s: %s'.red, dbURI, err);
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
const multer = require('multer');
const upload = multer();
const app = express();
app.use(compression());
app.use(bodyParser.json(config.body_parser_config));

// passport & session modules for authenticating users.
const User = require('./lib/model/user');
const passport = require('passport');
const session = require('express-session');
const MongoDBStore = require('connect-mongodb-session')(session);

var mongoStore = new MongoDBStore({
  uri: dbURI,
  collection: 'sessions'
}, err => {
  if (err) {
    debug('Error connecting MongoStore used for session authentication: %o'.red, err);
  }
});
mongoStore.on('error', (err) => {
  debug('Error with MongoStore used for session authentication: %o'.red, err);
  //process.exit(1);
});

var controllers = {};
controllers.compendium = require('./controllers/compendium');
controllers.job = require('./controllers/job');
controllers.link = require('./controllers/link');
controllers.download = require('./controllers/download');

// check fs & create dirs if necessary
fse.mkdirsSync(config.fs.job);
fse.mkdirsSync(config.fs.deleted);
fse.mkdirsSync(config.payload.tarball.tmpdir);

// minimal serialize/deserialize to make auth details cookie-compatible.
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

  checkDockerAndPullMetaContainer = new Promise((fulfill, reject) => {
    docker = new Docker();
    docker.ping((err, data) => {
      if (err) {
        debug('Error pinging Docker: %s'.yellow, err);
        reject(err);
      } else {
        debug('Docker available? %s', data);
        debug('meta tools version: %s', config.meta.container.image);

        docker.pull(config.meta.container.image, function (err, stream) {
          if (err) {
            debug('error pulling meta image: %o'.yellow, err);

            if(config.meta.container.image.indexOf('/') !== -1) {
              debug('meta image is remote, raising error!'.yellow);
              reject(err);
            } else {
              debug('meta image is not remote, ignoring pull error'.yellow);
              fulfill();
            }
          } else {
            function onFinished(err, output) {
              if (err) {
                debug('Error pulling meta image: %o'.yellow, err);
                reject(err);
              } else {
                debug('pulled meta tools image (%s): %O', config.meta.container.image, output);
                fulfill();
              }
              delete docker;
            }
            function onProgress(event) {
              debug('%o', event);
            }

            docker.modem.followProgress(stream, onFinished, onProgress);
          }
        });
      }
    });
  });

  pullContaineritContainer = new Promise((fulfill, reject) => {
    docker2 = new Docker();
    docker2.pull(config.containerit.image, function (err, stream) {
      if (err) {
        debug('error pulling containerit image: %o'.yellow, err);
        reject(err);
      } else {
        function onFinished(err, output) {
          if (err) {
            debug('error pulling containerit image: %o'.yellow, err);
            reject(err);
          } else {
            debug('pulled containerit tools image (%s): %O', config.containerit.image, output);
            fulfill();
          }

          delete docker2;
        }

        docker2.modem.followProgress(stream, onFinished);
      }
    });
  });

  pullContaineritBaseimage = new Promise((fulfill, reject) => {
    docker3 = new Docker();
    docker3.pull(config.containerit.baseImage, function (err, stream) {
      if (err) {
        debug('error pulling base image used by containerit: %o', err);
        reject(err);
      } else {
        function onFinished(err, output) {
          if (err) {
            debug('error pulling base image used by containerit: %o', err);
            reject(err);
          } else {
            debug('pulled base image used by containerit (%s): %O', config.containerit.baseImage, output);
            fulfill();
          }

          delete docker3;
        }

        docker3.modem.followProgress(stream, onFinished);
      }
    });
  });

  configureExpressApp = new Promise((fulfill, reject) => {
    app.use(session({
      secret: config.sessionSecret,
      resave: true,
      saveUninitialized: true,
      maxAge: 60 * 60 * 24 * 7, // cookies become invalid after one week
      store: mongoStore
    }));

    app.use(passport.initialize());
    app.use(passport.session());

    app.use('/', (req, res, next) => {
      var orcid = '';
      if (req.user && req.user.orcid) {
        orcid = ' | orcid: ' + req.user.orcid;
      }
      debug('REQUEST %s %s authenticated user: %s | session: %s', req.method, req.path, req.isAuthenticated(), req.session.id, orcid);
      next();
    });

    const indexResponse = {};
    indexResponse.about = 'https://o2r.info';
    indexResponse.versions = {};
    indexResponse.versions.current = '/api/v1';
    indexResponse.versions.v1 = '/api/v1';

    const indexResponseV1 = {};
    indexResponseV1.auth = '/api/v1/auth';
    indexResponseV1.compendia = '/api/v1/compendium';
    indexResponseV1.jobs = '/api/v1/job';
    indexResponseV1.users = '/api/v1/user';
    indexResponseV1.search = '/api/v1/search';
    indexResponseV1.shipments = '/api/v1/shipment';
    indexResponseV1.recipients = '/api/v1/recipient';
    indexResponseV1.substitutions = '/api/v1/substitution';
    indexResponseV1.links = '/api/v1/link';

    // set up routes
    app.get('/status', function (req, res) {
      res.setHeader('Content-Type', 'application/json');
      if (!req.isAuthenticated()) {
        res.status(401).send({ error: 'not authenticated' });
        return;
      } else if (req.user.level < config.user.level.view_status) {
        res.status(403).send({ error: 'not allowed' });
        return;
      }

      var response = {
        name: "muncher",
        version: config.version,
        levels: config.user.level,
        mongodb: config.mongo,
        filesystem: config.fs
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

    // transporter routes
    app.get('/api/v1/job/:id/data/:path(*)', controllers.job.viewPath);
    app.get('/api/v1/compendium/:id/data/', controllers.compendium.viewData);
    app.get('/api/v1/compendium/:id/data/:path(*)', controllers.compendium.viewPath);
    app.get('/api/v1/compendium/:id.zip', controllers.download.downloadZip);
    app.get('/api/v1/compendium/:id.tar.gz', function (req, res) {
      let redirectUrl = req.path.replace('.tar.gz', '.tar?gzip');
      if (Object.keys(req.query).length !== 0) {
        redirectUrl += '&' + url.parse(req.url).query;
      }
      debug('Redirecting from %s with query %s  to  %s', req.path, JSON.stringify(req.query), redirectUrl)
      res.redirect(redirectUrl);
    });
    app.get('/api/v1/compendium/:id.tar', controllers.download.downloadTar);

    app.get('/api/v1/compendium', controllers.compendium.listCompendia);
    app.get('/api/v1/compendium/:id', controllers.compendium.viewCompendium);
    app.delete('/api/v1/compendium/:id', controllers.compendium.deleteCompendium);
    app.get('/api/v1/compendium/:id/jobs', controllers.compendium.viewCompendiumJobs);

    app.get('/api/v1/compendium/:id/metadata', controllers.compendium.viewCompendiumMetadata);
    app.put('/api/v1/compendium/:id/metadata', upload.any(), controllers.compendium.updateCompendiumMetadata);

    app.get('/api/v1/job', controllers.job.listJobs);
    app.post('/api/v1/job', upload.any(), controllers.job.createJob);
    app.get('/api/v1/job/:id', controllers.job.viewJob);

    app.get('/api/v1/link', controllers.link.listLinks);
    app.get('/api/v1/compendium/:id/link', controllers.link.viewCompendiumLink);
    app.put('/api/v1/compendium/:id/link', controllers.link.createLink);
    app.delete('/api/v1/compendium/:id/link', controllers.link.deleteLink);

    fulfill();
  });

  configureEmailTransporter = new Promise((fulfill, reject) => {
    if (config.email.enable
      && config.email.transport
      && config.email.sender
      && config.email.receivers) {
      emailTransporter = nodemailer.createTransport(config.email.transport);
      debug('Sending emails on critical events to %s', config.email.receivers);
    } else {
      debug('Email notification for critical events _not_ active: %o', config.email);
    }
    fulfill();
  });

  logVersions = new Promise((fulfill, reject) => {
    // Python version used for bagit.py
    let pythonVersionCmd = 'echo $(python --version)';
    exec(pythonVersionCmd, (error, stdout, stderr) => {
      if (error) {
        debug('Error detecting python version: %o'.yellow, error);
      } else {
        let version = stdout.concat(stderr);
        debug('Using "%s" for bagit.py', version.trim());
      }
    });
  });

  startListening = new Promise((fulfill, reject) => {
    app.listen(config.net.port, () => {
      debug('muncher %s with API version %s waiting for requests on port %s'.green,
        config.version,
        config.api_version,
        config.net.port);
      fulfill();
    });
  });

  checkDockerAndPullMetaContainer
    .then(pullContaineritContainer)
    .then(pullContaineritBaseimage)
    .catch((err) => {
      debug('ERROR pulling secondary images, this may result in problems later: %o'.yellow, err);
    })
    .then(logVersions)
    .then(configureEmailTransporter)
    .then(configureExpressApp)
    .then(startListening)
    .then(() => {
      callback(null);
    })
    .catch((err) => {
      callback(err);
    });
}

// auto_reconnect is on by default and only for RE(!)connects, not for the initial attempt: http://bites.goodeggs.com/posts/reconnecting-to-mongodb-when-mongoose-connect-fails-at-startup/
var dbBackoff = backoff.fibonacci({
  randomisationFactor: 0,
  initialDelay: config.mongo.initial_connection_initial_delay,
  maxDelay: config.mongo.initial_connection_max_delay
});

dbBackoff.failAfter(config.mongo.initial_connection_attempts);
dbBackoff.on('backoff', function (number, delay) {
  debug('Trying to connect to MongoDB (#%s) in %sms', number, delay);
});
dbBackoff.on('ready', function (number, delay) {
  debug('Connect to MongoDB (#%s)', number, delay);
  mongoose.connect(dbURI, dbOptions, (err) => {
    if (err) {
      debug('Error during connect: %o'.red, err);
      mongoose.disconnect(() => {
        debug('Mongoose: Disconnected all connections.');
      });
      dbBackoff.backoff();
    } else {
      // delay app startup to when MongoDB is available
      debug('Initial connection open to %s: %s', dbURI, mongoose.connection.readyState);
      initApp((err) => {
        if (err) {
          debug('Error during init!\n%o'.red, err);
          mongoose.disconnect(() => {
            debug('Mongoose: Disconnected all connections.');
          });
          dbBackoff.backoff();
        }
        debug('Started application.'.green);
      });
    }
  });
});
dbBackoff.on('fail', function () {
  debug('Eventually giving up to connect to MongoDB');
  process.exit(1);
});

dbBackoff.backoff();
