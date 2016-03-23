var express = require('express');
var jade = require('jade');
var debug = require('debug')('muncher');
var compression = require('compression');

// modules for file upload
var randomstring = require('randomstring');
var multer = require('multer');
var storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'incoming/');
  },
  filename: (req, file, cb) => {
    cb(null, randomstring.generate(7));
  }
});
var upload = multer({storage: storage});

var app = express();
app.set('view engine', 'jade');
app.use(compression());
app.use(express.static('static'));

app.use('/', (req, res, next) => {
  debug('request for ' + req.path);
  next();
});

app.get('/upload', (req, res) => {
  res.render('upload');
});

app.post('/upload', upload.single('package'), (req, res) => {
  res.send(req.file);
});

app.get('/', (req, res) => {
  res.render('index');
});

app.listen(8080, () => {
  debug('webserver is listening on port 8080');
});
