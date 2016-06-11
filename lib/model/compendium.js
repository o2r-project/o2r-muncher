var mongoose = require('mongoose');
var schema = require('../schema/compendium');

module.exports = mongoose.model('Compendium', schema);
