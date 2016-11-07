/*
 * (C) Copyright 2016 o2r project
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
var c = {};
c.version = {};
c.net = {};
c.mongo = {};
c.fs = {};
c.oauth = {};
var env = process.env;

// Information about muncher
c.version.major = 0;
c.version.minor = 3;
c.version.bug = 0;
c.version.api = 1;

// network & database
c.net.port = env.MUNCHER_PORT || 8080;
c.mongo.location = env.MUNCHER_MONGODB || 'mongodb://localhost/';
c.mongo.database = env.MUNCHER_MONGODB_DATABASE || 'muncher';
c.mongo.inital_connection_attempts = 30;
c.mongo.inital_connection_max_delay = 5000;
c.mongo.inital_connection_initial_delay = 10;

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
c.user.level.view_status = 500;

// bagtainer configuration
c.bagtainer = {};
c.bagtainer.supportedVersions = ['0.1'];
c.bagtainer.configFile = '/data/bagtainer.yml';
c.bagtainer.validateFast = false;
c.bagtainer.keepContainers = false;
c.bagtainer.keepImages = false;
c.bagtainer.imageNamePrefix = 'bagtainer:';
c.bagtainer.forceImageRemoval = true;

c.payload = {};
c.payload.tarball = {};
c.payload.tarball.tmpdir = c.fs.base + 'payloads/';
c.payload.tarball.statConcurrency = 4; // concurrency when creating payload tarballs
c.payload.tarball.gzip = false;
c.payload.tarball.gzipOptions = {};

module.exports = c;
