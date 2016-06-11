var c = {};
c.version = {};
c.net = {};
c.mongo = {};
c.fs = {};
var env = process.env;

// Information about muncher
c.version.major  = 0;
c.version.minor  = 1;
c.version.bug    = 0;
c.version.api    = 1;

// network & database
c.net.port         = env.MUNCHER_PORT || 8080;
c.mongo.location   = 'mongodb://localhost/';
c.mongo.collection = 'muncher';
c.mongo.creds      = {};

// fs paths
c.fs.base       = env.MUNCHER_BASEPATH || '/tmp/muncher/';
c.fs.incoming   = c.fs.base + 'incoming/';
c.fs.compendium = c.fs.base + 'compendium/';
c.fs.job        = c.fs.base + 'job/';
c.fs.delete_inc = true;

// muncher behaviour & defaults
c.list_limit           = 100; // amount of results per page
c.id_length            = 5;   // length of job & compendium ids [0-9,a-z,A-Z]

module.exports = c;
