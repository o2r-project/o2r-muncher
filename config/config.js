/*
 * (C) Copyright 2017 o2r project
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 */
const yn = require('yn');

var c = {};
c.net = {};
c.mongo = {};
c.fs = {};
c.oauth = {};
var env = process.env;

// Information about muncher
c.api_version = 1;
c.version = require('../package.json').version;

// network & database
c.net.port = env.MUNCHER_PORT || 8080;
c.mongo.location = env.MUNCHER_MONGODB || 'mongodb://localhost/';
c.mongo.database = env.MUNCHER_MONGODB_DATABASE || 'muncher';
c.mongo.initial_connection_attempts = 30;
c.mongo.initial_connection_max_delay = 5000;
c.mongo.initial_connection_initial_delay = 1000;

// fix mongo location if trailing slash was omitted
if (c.mongo.location[c.mongo.location.length - 1] !== '/') {
  c.mongo.location += '/';
}

// fs paths
c.fs.base = env.MUNCHER_BASEPATH || '/tmp/o2r/';
c.fs.incoming = c.fs.base + 'incoming/';
c.fs.compendium = c.fs.base + 'compendium/';
c.fs.job = c.fs.base + 'job/';
c.fs.delete_inc = true;
c.fs.fail_on_no_files = yn(env.MUNCHER_FAIL_ON_NO_FILES) || false;

// muncher behaviour & defaults
c.list_limit = 100; // amount of results per page
c.id_length = 5;   // length of job & compendium ids [0-9,a-z,A-Z]

// session secret
c.sessionsecret = env.SESSION_SECRET || 'o2r';

// user levels
c.user = {};
c.user.level = {};
c.user.level.create_compendium = 100;
c.user.level.create_job = 0;
c.user.level.view_status = 1000;
c.user.level.edit_metadata = 500;
c.user.level.view_candidates = 500;

// bagtainer configuration
c.bagtainer = {};
c.bagtainer.supportedVersions = ['0.1', '1'];
c.bagtainer.payloadDirectory = '/data';
c.bagtainer.configFile = 'erc.yml';
c.bagtainer.keepContainers = false; // set this to true for debugging runtime options
c.bagtainer.keepImages = true; // required for image download!
c.bagtainer.validateBagBeforeExecute = true; // bag validation will fail, gut useful to highlight the changes in compendium
c.bagtainer.validateCompendiumBeforeExecute = true;
c.bagtainer.failOnValidationError = false; // muncher never updates the bag

c.bagit = {};
c.bagit.detectionFileName = 'bagit.txt';
c.bagit.validateFast = false;
c.bagit.failOnValidationError = {};
c.bagit.failOnValidationError.execute = false;

c.bagtainer.imageNamePrefix = 'erc:';
c.bagtainer.forceImageRemoval = true;
c.bagtainer.docker = {};
// See https://docs.docker.com/engine/reference/commandline/create/ and https://docs.docker.com/engine/reference/api/docker_remote_api_v1.24/#create-a-container
c.bagtainer.docker.create_options = {
  //AttachStderr: true,
  //AttachStdin: false,
  //AttachStdout: true,
  //Cmd: ['bash', '-c', 'cat /etc/resolv.conf'],
  CpuShares: 256,
  //Cpuset: '',
  //Domainname: '',
  //Entrypoint: null,
  Env: ['O2RPLATFORM=true'],
  //Hostname: 'b9ea983254ef',
  Memory: 1073741824, // 1G
  MemorySwap: 2147483648, // double of 1G
  NetworkMode: 'none',
  Rm: true
};
// https://docs.docker.com/engine/reference/api/docker_remote_api_v1.24/#start-a-container
c.bagtainer.docker.start_options = {
};

// admin email options
c.email = {};
c.email.enable = false;
c.email.transport = env.MUNCHER_EMAIL_TRANSPORT; // https://www.npmjs.com/package/nodemailer
c.email.receivers = env.MUNCHER_EMAIL_RECEIVERS;
c.email.sender = env.MUNCHER_EMAIL_SENDER;

// template for sending emails
//if (emailTransporter) {
//  let mail = {
//    from: config.email.sender, // sender address 
//    to: config.email.receivers,
//    subject: '[o2r platform] something happened',
//    text: '...'
//  };
//
//  emailTransporter.sendMail(mail, function (error, info) {
//    if (error) {
//      debug('Problem sending notification email: %s', error.message);
//    }
//    debug('Email sent: %s\n%s', info.response, JSON.stringify(mail));
//  });
//}

// metadata extraction and brokering options
c.meta = {};
c.meta.cliPath = env.MUNCHER_META_TOOL_EXE || 'python3 ../o2r-meta/o2rmeta.py';
c.meta.versionFile = 'version';
c.meta.normativeFile = 'metadata_o2r.json';
c.meta.dir = '.erc';

c.meta.extract = {};
c.meta.extract.targetElement = 'o2r';

c.meta.broker = {};
c.meta.broker.module = 'broker';
c.meta.broker.mappings = {
  zenodo: {
    targetElement: 'zenodo.metadata',
    file: 'zenodo-map.json'
  },
  dir: env.MUNCHER_META_EXTRACT_MAPPINGS_DIR || '../o2r-meta/broker/mappings'
};

c.meta.doiPath = 'metadata.o2r.identifier.doi';

c.payload = {};
c.payload.tarball = {};
c.payload.tarball.tmpdir = c.fs.base + 'payloads/';
c.payload.tarball.statConcurrency = 4; // concurrency when creating payload tarballs
c.payload.tarball.gzip = false;
c.payload.tarball.gzipOptions = {};

module.exports = c;
