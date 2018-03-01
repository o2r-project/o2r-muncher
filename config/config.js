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
const util = require('util');
const path = require('path');
const debug = require('debug')('muncher:config');

var c = {};
c.net = {};
c.mongo = {};
c.fs = {};
c.oauth = {};
var env = process.env;

debug('Configuring loader with environment variables %s', Object
  .keys(env)
  .filter(k => k.startsWith("MUNCHER"))
  .map(k => { return k + "=" + env[k]; })
);

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
c.fs.incoming = path.join(c.fs.base, 'incoming');
c.fs.compendium = path.join(c.fs.base, 'compendium');
c.fs.job = path.join(c.fs.base, 'job');
c.fs.delete_inc = true;
c.fs.fail_on_no_files = yn(env.MUNCHER_FAIL_ON_NO_FILES) || false;

c.fs.volume = env.MUNCHER_VOLUME || null;

// muncher behaviour & defaults
c.list_limit = 100; // amount of results per page
c.id_length = 5;   // length of job & compendium ids [0-9,a-z,A-Z]

// session secret
c.sessionSecret = env.SESSION_SECRET || 'o2r';

// API paths
c.api = {};
c.api.resource = {};
c.api.resource.compendium = '/api/v1/compendium';
c.api.resource.job = '/api/v1/job';
c.api.sub_resource = {};
c.api.sub_resource.data = 'data';

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
c.bagtainer.spec_version = {};
c.bagtainer.spec_version.supported = ['0.1', '1'];
c.bagtainer.spec_version.default = '1';
c.bagtainer.configFile = {
  name: 'erc.yml',
  main_node: 'main',
  display_node: 'display'
};
c.bagtainer.mountLocationInContainer = '/erc';
c.bagtainer.keepContainers = false; // set this to true for debugging runtime options
c.bagtainer.keepImages = true;
c.bagtainer.saveImageTarball = true;
c.bagtainer.imageTarballFile = 'image.tar';
c.bagtainer.validateBagBeforeExecute = true; // bag validation will fail, gut useful to highlight the changes in compendium
c.bagtainer.validateCompendiumBeforeExecute = true;
c.bagtainer.failOnValidationError = true;
c.bagtainer.manifestFile = 'Dockerfile';
c.bagtainer.mainFilePath = 'metadata.o2r.mainfile';
c.bagtainer.displayFilePath = 'metadata.o2r.displayfile';

c.bagit = {};
c.bagit.detectionFileName = 'bagit.txt';
c.bagit.payloadDirectory = 'data';
c.bagit.validateFast = false;
c.bagit.failOnValidationError = {};
c.bagit.failOnValidationError.execute = false; // muncher never updates the bag
c.bagit.stepResultAfterValidationError = 'skipped'; // it's not really a failure!

c.bagtainer.image = {};
c.bagtainer.image.name = {
  compendium: 'erc',
  job: 'job'
};
c.bagtainer.image.prefix = {
  compendium: c.bagtainer.image.name.compendium + ':',
  job: c.bagtainer.image.name.job + ':'
};
c.bagtainer.forceImageRemoval = true;
c.bagtainer.docker = {};
// See https://docs.docker.com/engine/api/v1.29/#operation/ContainerCreate
c.bagtainer.docker.create_options = {
  CpuShares: 256,
  Env: ['O2R_MUNCHER=true'],
  Memory: 1073741824, // 1G
  MemorySwap: 2147483648, // double of 1G
  NetworkDisabled : true,
  User: env.MUNCHER_CONTAINER_USER || '1000' // user name depends on image, use id to be save
};
c.bagtainer.rm = yn(env.EXECUTE_CONTAINER_RM) || true;

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
//      debug('Problem sending notification email: %o', error);
//    }
//    debug('Email sent: %s\n%O', info.response, mail);
//  });
//}

// metadata extraction and brokering options
c.meta = {};
c.meta.dir = '.erc';
c.meta.prettyPrint = {};
c.meta.prettyPrint.indent = 4;
c.meta.normativeFile = 'metadata_o2r_1.json';
c.meta.container = {};
c.meta.container.image = env.MUNCHER_META_TOOL_CONTAINER || 'o2rproject/o2r-meta:latest';
c.meta.container.default_create_options = {
  CpuShares: 128,
  Env: ['O2R_MUNCHER=true'],
  Memory: 1073741824, // 1G
  MemorySwap: 2147483648, // double of 1G
  User: env.MUNCHER_META_TOOL_CONTAINER_USER || 'o2r' // or '1000', could be left away because of USER o2r command in o2r-meta's Dockerfile, but better safe than sorry.
};
c.meta.container.rm = yn(env.MUNCHER_META_TOOL_CONTAINER_RM) || true;

c.meta.broker = {};
c.meta.broker.module = 'broker';
c.meta.broker.mappings = {
  zenodo: {
    targetElement: 'zenodo.metadata',
    file: 'metadata_zenodo_1.json',
    mappingFile: 'broker/mappings/zenodo-map.json'
  },
  zenodo_sandbox: {
    targetElement: 'zenodo_sandbox.metadata',
    file: 'metadata_zenodo_sandbox_1.json',
    mappingFile: 'broker/mappings/zenodo_sandbox-map.json'
  },
  //o2r: {
  //  targetElement: 'o2r',
  //  file: 'metadata_o2r_1.json',
  //  mappingFile: 'broker/mappings/o2r-map.json'
  //} 
};
c.meta.doiPath = 'metadata.o2r.identifier.doi';

c.checker = {};
c.checker.display_file_name_html = 'diffHTML.html';

c.containerit = {};
c.containerit.image = env.MUNCHER_CONTAINERIT_IMAGE || 'o2rproject/containerit:geospatial';
c.containerit.default_create_options = {
  CpuShares: 256,
  Env: ['O2R_MUNCHER=true', 'O2R_MUNCHER_VERSION=' + c.version],
  Memory: 1073741824 * 2, // 2G
  MemorySwap: 1073741824 * 4,
  User: env.MUNCHER_CONTAINERIT_USER || 'rstudio' // IMPORTANT: this must fit the used image!
};
c.containerit.baseImage = 'rocker/r-ver:3.4.3';
c.containerit.maintainer = 'o2r';
c.containerit.rm = yn(env.MUNCHER_CONTAINERIT_CONTAINER_RM) || true;

c.payload = {};
c.payload.tarball = {};
c.payload.tarball.tmpdir = path.join(c.fs.base, 'payloads');
c.payload.tarball.statConcurrency = 4; // concurrency when creating payload tarballs
c.payload.tarball.gzip = false;
c.payload.tarball.gzipOptions = {};
c.payload.tarball.globPattern = '**/*';
c.payload.tarball.ignore = [c.bagtainer.imageTarballFile, c.meta.dir + '/**'];

c.body_parser_config = {
  // increase limit for metadata uploads, see https://github.com/expressjs/body-parser#limit
  limit: '50mb'
};

debug('CONFIGURATION:\n%s', util.inspect(c, { depth: null, colors: true }));

module.exports = c;
