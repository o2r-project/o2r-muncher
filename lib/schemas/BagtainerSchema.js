var mongoose = require('mongoose');
var Schema = mongoose.Schema;

module.exports.Schema = (updateCallback) => {
  var BagtainerSchema = new Schema({
    id:                   String,
    version:              String,
    bag_mount:            String,
    run_mount:            String,
    data: {
      working_directory:  String,
      run_file:           String,
      config_file:        String,
      container:          String,
    },
    packages: [{
      name:               String,
    }],
    environment: [{
      envvar:             String,
      envvarvalue:        String,
    }],
    command:              String,
    execution: {
      active:             {type: Boolean, default: false},
      steps: {
        bagvalidation:    {type: Number, default: 0},
        datapackage:      {type: Number, default: 0},
        buildimage:       {type: Number, default: 0},
        runimage:         {type: Number, default: 0}
      }
    }
  });

  BagtainerSchema.post('update', function(doc, next) {
    this.updateCallback(doc);
    next();
  });

  return BagtainerSchema;
};
