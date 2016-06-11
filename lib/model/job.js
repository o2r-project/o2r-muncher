var mongoose = require('mongoose');
var schema = require('../schema/job');

module.exports = mongoose.model('Job', schema);
