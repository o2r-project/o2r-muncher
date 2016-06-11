var mongoose = require('mongoose');

var models;
models.job = require('model/job');
models.compendium = require('model/compendium');

//TODO: make configuration parameter for this
mongoose.connect('mongodb://localhost/mucher');

db.on('error', console.error.bind(console, 'connection error:'));

