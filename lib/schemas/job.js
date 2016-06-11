var mongoose = require('mongoose');
var Schema = mongoose.Schema;

module.exports = new Schema({
    id :        String,
    metadata :  Object,
    compendium : String
});
