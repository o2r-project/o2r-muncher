// General modules
var debug = require('debug')('muncher');
var Promise = require('bluebird');
var exec = require('child_process').exec;
var randomstring = require('randomstring');
// Express modules and tools
var express = require('express');
var compression = require('compression');
var bodyParser = require('body-parser');
var app = express();
app.use(compression());
app.use(bodyParser.json());

// file upload
var multer = require('multer');
var storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'incoming/');
  },
  filename: (req, file, cb) => {
    cb(null, randomstring.generate(5)); //TODO: Magic number. should be a gobal id length.
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
app.get('/api/v1/compendium/:id', controllers.compendium.viewSingle);
app.post('/api/v1/compendium', upload.single('compendium'), controllers.compendium.create);
app.get('/api/v1/compendium/:id/jobs', controllers.compendium.viewSingleJobs)

app.listen(8080, () => {
  debug('muncher waiting for requests on port 8080');
});
