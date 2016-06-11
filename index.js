// General modules
var debug = require('debug')('muncher');
var c = require('./config/config');
debug(c);

var Promise = require('bluebird');
var exec = require('child_process').exec;
var randomstring = require('randomstring');
var fse = require('fs-extra');
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
