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

debug('Configuring muncher with environment variables %o', Object
  .keys(env)
  .filter(k => k.startsWith("MUNCHER"))
  .map(k => { return k + "=" + env[k]; })
);

// Information about muncher
c.api_version = 1;
c.version = require('../package.json').version;

// network & database
c.net.port = env.MUNCHER_PORT || 8080;
c.mongo.location = env.MUNCHER_MONGODB || 'mongodb://localhost:27017/';
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
c.fs.deleted = path.join(c.fs.base, 'deleted');
c.fs.job = path.join(c.fs.base, 'job');
c.fs.cache = path.join(c.fs.base, 'cache');
c.fs.dns = path.join(c.fs.base, 'dns');
c.fs.delete_inc = true;
c.fs.fail_on_no_files = yn(env.MUNCHER_FAIL_ON_NO_FILES || 'false');

c.fs.volume = env.MUNCHER_VOLUME || null;

// muncher behaviour & defaults
c.list_limit = 100; // amount of results per page
c.id_length = 5;    // length of job & compendium ids [0-9,a-z,A-Z]
c.link_length = 32; // length of link ids [0-9,a-z,A-Z]

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
c.user.level.substitute = 50;
c.user.level.edit_others = 500;
c.user.level.view_candidates = 500;
c.user.level.view_status = 1000;
c.user.level.delete_compendium = 1000;
c.user.level.manage_links = 500;
c.user.level.manage_publisher = 1000;
c.user.level.validate_journal = 1000;
c.user.level.manage_journal = 500;

// bagtainer configuration
c.bagtainer = {};
c.bagtainer.spec_version = {};
c.bagtainer.supportedContentTypes = ["compendium", "workspace"];
c.bagtainer.spec_version.supported = ['0.1', '1'];
c.bagtainer.spec_version.default = '1';
c.bagtainer.id_regex = /^[^-_.\n\r][a-zA-Z0-9\._-]*[^-_.\n\r]$/;
c.bagtainer.id_is_valid = (id) => {
  return c.bagtainer.id_regex.test(id);
}
c.bagtainer.configFile = {
  name: 'erc.yml',
  main_node: 'main',
  display_node: 'display',
  licenses_node: 'licenses'
};
c.bagtainer.mountLocationInContainer = '/erc';
c.bagtainer.keepContainers = false; // set this to true for debugging runtime options
c.bagtainer.keepImages = true;
c.bagtainer.saveImageTarball = yn(env.MUNCHER_SAVE_IMAGE_TARBALL || 'true');
c.bagtainer.imageTarballFile = 'image.tar';
c.bagtainer.validateBagBeforeExecute = true; // bag validation will fail, but useful to highlight the changes in compendium
c.bagtainer.validateCompendiumBeforeExecute = true;
c.bagtainer.failOnValidationError = true;
c.bagtainer.manifestFile = 'Dockerfile';
c.bagtainer.mainFilePath = 'metadata.o2r.mainfile';
c.bagtainer.displayFilePath = 'metadata.o2r.displayfile';
c.bagtainer.licensesPath = 'metadata.o2r.license';
c.bagtainer.sessionFiles = ['sessioninfo.rdata', 'session_info.rdata', 'sessioninfo.rda', 'session_info.rda'];

// TODO integrate options
c.bagit = {};
c.bagit.detectionFileName = 'bagit.txt';
c.bagit.payloadDirectory = 'data';
c.bagit.validateFast = false;
c.bagit.failOnValidationError = {};
c.bagit.failOnValidationError.execute = false; // muncher never updates the bag
c.bagit.stepResultAfterValidationError = 'skipped'; // it's not really a failure!
c.bagit.validation = {};
c.bagit.validation.fast = false;
c.bagit.validation.failUpload = true;

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
  Memory: 4294967296, // 4G
  MemorySwap: 8589934592, // double of 4G
  User: env.MUNCHER_CONTAINER_USER || '1000' // user name depends on image, use id to be save
};
c.bagtainer.rm = yn(env.EXECUTE_CONTAINER_RM || 'true');

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
c.meta.container.rm = yn(env.MUNCHER_META_TOOL_CONTAINER_RM || 'true');

c.meta.extract = {};
c.meta.extract.module = 'extract';
c.meta.extract.outputDir = '.erc';
c.meta.extract.targetElement = 'o2r';
c.meta.extract.bestCandidateFile = 'metadata_raw.json';
c.meta.extract.failOnNoMetadata = true;
c.meta.extract.stayOffline = yn(env.MUNCHER_META_TOOL_OFFLINE) || false;

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
  o2r: {
    targetElement: 'o2r',
    file: 'metadata_o2r_1.json',
    mappingFile: 'broker/mappings/o2r-map.json'
  }
};
c.meta.doiPath = 'metadata.o2r.identifier.doi';
c.meta.validate = {};
c.meta.validate.allowInvalid = yn(env.MUNCHER_ALLOW_INVALID_METADATA || 'false');
c.meta.validate.module = 'validate';
c.meta.validate.schemas = [
  {
    file: c.meta.normativeFile,
    schema: 'schema/json/o2r-meta-schema.json'
  }
];

// Encoding check settings
// A list of analyzed files can be found here: https://github.com/o2r-project/o2r-meta#supported-files-and-formats-for-the-metadata-extraction-process
c.encoding = {};
c.encoding.supportedEncodings = ['ISO-8859-1', 'ISO-8859-2', 'UTF-8', 'UTF-16BE', 'UTF-16LE', 'UTF-32BE', 'UTF-32LE', 'windows-1252'];
c.encoding.textFileRegex = '\.(txt|rmd|r|json|yml|yaml)$';
c.encoding.confidenceThreshold = 60;

c.webdav = {};
c.webdav.allowedHosts = ['sciebo'];
c.webdav.sciebo = {};
c.webdav.sciebo.webdav_path = '/public.php/webdav/'; //end of webdav public webdav url
//c.webdav.urlString = 'nextcloud/public.php/dav'; //nextcloud public webdav url

// Zenodo configuration
c.zenodo = {};
// default URL and host that is used to download files if the URL itself is not specified in the request (e.g. via DOI or zenodo_record_id parameter)
c.zenodo.default_url = 'https://sandbox.zenodo.org/';
c.zenodo.default_host = 'sandbox.zenodo.org';

// base urls for Zenodo and Zenodo sandbox
c.zenodo.zenodo_sandbox_url = 'https://sandbox.zenodo.org/';
c.zenodo.zenodo_url = 'https://zenodo.org/';

// Slack
c.slack = {};
c.slack.enable = true;
c.slack.bot_token = process.env.SLACK_BOT_TOKEN;
c.slack.verification_token = process.env.SLACK_VERIFICATION_TOKEN;
c.slack.channel = {};
c.slack.channel.status = process.env.SLACK_CHANNEL_STATUS || '#monitoring';
c.slack.channel.loadEvents = process.env.SLACK_CHANNEL_LOAD || '#monitoring';

// sustitution options: metadata extraction and brokering options
c.substitution = {};
c.substitution.meta = {};
c.substitution.meta.base = 'metadata.substitution.base';
c.substitution.meta.overlay = 'metadata.substitution.overlay';
// sustitution options: for updating path in metadata
c.substitution.meta.updatePath = [
  'mainfile_candidates', //    xjiYy/data/main.Rmd
  'mainfile', //   xjiYy/data/main.Rmd
  'inputfiles', //       xjiYy/data/BerlinMit.csv
  'displayfile', //      /api/v1/compendium/xjiYy/data/data/erc.yml
  'codefiles'  //        xjiYy/data/main.Rmd
  ]
// sustitution options: metadata schema for saving
c.substitution.meta.bag = false;
c.substitution.meta.candidate = false;
c.substitution.meta.compendium = true;
c.substitution.docker = {};
c.substitution.docker.volume = {};
c.substitution.docker.volume.flag = "--volume ";
c.substitution.docker.volume.basePath = '$(pwd)';
c.substitution.docker.volume.mode = ":ro";
c.substitution.docker.cmd = 'docker run -it --rm';
c.substitution.docker.imageNamePrefix = 'erc:';

c.dns = {};
c.dns.dnsmasq = {};
c.dns.priority = {};
c.dns.dockerfile = "" +
    "FROM alpine:edge\n" +
    "RUN apk --no-cache add dnsmasq\n" +
    "EXPOSE 53/tcp 53/udp\n" +
    "COPY dnsmasq.conf /etc/dnsmasq.conf\n" +
    "CMD [\"dnsmasq\", \"--no-daemon\"]";
c.dns.dnsmasq.default = "" +
    "log-queries\n" +
    "no-hosts\n" +
    "no-resolv\n" +
    "cache-size=100000\n";
c.dns.dnsmasq.filterDummy = "server=/";
c.dns.priority.publisher = 100;
c.dns.priority.journal = 50;

c.checker = {};
c.checker.diffFileName = 'check.html';

c.containerit = {};
c.containerit.image = env.MUNCHER_CONTAINERIT_IMAGE || 'o2rproject/containerit:geospatial-0.6.0.9003';
c.containerit.default_create_options = {
  CpuShares: 256,
  Env: ['O2R_MUNCHER=true', 'O2R_MUNCHER_VERSION=' + c.version],
  Memory: 1073741824 * 2, // 2G
  MemorySwap: 1073741824 * 4,
  User: env.MUNCHER_CONTAINERIT_USER || 'rstudio' // this must fit the used image, so that files outside the container for local testing can be deleted
                                                  // and must be 'root' (or a user who can run Docḱer) for package filtering > extra setting below!
};
c.containerit.baseImage = env.MUNCHER_CONTAINERIT_BASE_IMAGE || 'rocker/geospatial:3.6.2'; // when changing this, also update the "test warming" Dockerfile at ./test/Dockerfile
c.containerit.filterBaseImagePkgs = {
  // defaults to FALSE because to do the filtering, muncher must run as root!
  r_parameter_value:  (yn(env.MUNCHER_CONTAINERIT_FILTER_BASE_IMAGE_PKGS) || 'false').toString().toUpperCase(),
  enabled: yn(env.MUNCHER_CONTAINERIT_FILTER_BASE_IMAGE_PKGS || 'false'),
  user: 'root' // needs access to Docker!
};
c.containerit.dInDBind = '/var/run/docker.sock:/var/run/docker.sock';
c.containerit.maintainer = 'o2r';
c.containerit.rm = yn(env.MUNCHER_CONTAINERIT_CONTAINER_RM || 'true');
c.containerit.labelNamespace = 'info.o2r.';

c.payload = {};
c.payload.tarball = {};
c.payload.tarball.tmpdir = path.join(c.fs.base, 'payloads');
c.payload.tarball.statConcurrency = 4; // concurrency when creating payload tarballs
c.payload.tarball.gzip = false;
c.payload.tarball.gzipOptions = {};
c.payload.tarball.globPattern = '**/*';
c.payload.tarball.ignore = [c.bagtainer.imageTarballFile, c.meta.dir + '/**'];

c.body_parser_config = {
  limit: '1gb'
};
c.upload = {};
c.upload.timeout_seconds = 60 * 30; // 30 minutes


c.download = {};
c.download.defaults = {};
c.download.defaults.statConcurrency = 4; // archiver.js default is '4'
c.download.defaults.tar = {};
c.download.defaults.tar.gzipOptions = {}; // https://nodejs.org/api/zlib.html#zlib_class_options
c.download.defaults.includeImage = true;

// filename prepend of substitution file
c.substitutionFilePrepend = 'overlay_';

debug('CONFIGURATION:\n%s', util.inspect(c, { depth: null, colors: true }));

module.exports = c;
