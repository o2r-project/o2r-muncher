var debug = require('debug')('tester');
var Promise = require('bluebird');
var Executor = require('../lib/executor').Executor;

var execution = new Executor('test', '../workspace/').execute();

execution.catch(e => {
  debug('failure: ' + e);
});
execution.then(() => {
  debug('success!');
});

process.on('unhandledRejection', function(reason, p){
    console.log("Possibly Unhandled Rejection at: Promise ", p, " reason: ", reason);
    // application specific logging here
});
