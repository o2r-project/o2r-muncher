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

/* eslint-env mocha */
const mongojs = require('mongojs');
const Docker = require('dockerode');
const Stream = require('stream');
const exec = require('child_process').exec;
const yn = require('yn');
const async = require('async');
const tar = require('tar');
const path = require('path');
const fs = require('fs');
const debug = require('debug')('test:setup');

// test parameters for local session authentication directly via fixed database entries
var orcid_o2r = '0000-0001-6021-1617';
var orcid_plain = '0000-0000-0000-0001';
var orcid_uploader = '2000-0000-0000-0002';
var orcid_admin = '4242-0000-0000-4242';
var orcid_editor = '1717-0000-0000-1717';
var sessionId_o2r = 'C0LIrsxGtHOGHld8Nv2jedjL4evGgEHo';
var sessionId_plain = 'yleQfdYnkh-sbj9Ez--_TWHVhXeXNEgq';
var sessionId_uploader = 'lTKjca4OEmnahaQIuIdV6tfHq4mVf7mO';
var sessionId_admin = 'hJRjapOTVCEvlMYCb8BXovAOi2PEOC4i';
var sessionId_editor = 'xWHihqZq6jEAObwbfowO5IwdnBxohM7z';

var env = process.env;
const config = require('../config/config');
global.test_host = env.TEST_HOST || 'http://localhost:' + config.net.port;
global.test_host_loader = env.TEST_HOST_UPLOAD || 'http://localhost:8088';
global.test_host_transporter = env.TEST_HOST_DOWNLOAD || 'http://localhost:8081';
global.test_job_poll_interval = parseInt(env.TEST_JOB_POLL_INTERVAL) || 3000;
debug('Testing endpoint at %s using %s for upload, poll interval for jobs: %s', global.test_host, global.test_host_loader, global.test_job_poll_interval);

docker = new Docker();

before(function (done) {
    this.timeout(60000 * 15); // 15 minutes, to pre-build a Docker base image

    var db = mongojs('localhost/muncher', ['sessions', 'users']);

    loadUserO2r = (cb) => {
        var session_o2r = {
            '_id': sessionId_o2r,
            'session': {
                'cookie': {
                    'originalMaxAge': null,
                    'expires': null,
                    'secure': null,
                    'httpOnly': true,
                    'domain': null,
                    'path': '/'
                },
                'passport': {
                    'user': orcid_o2r
                }
            }
        }
        db.sessions.save(session_o2r, function (err, doc) {
            if (err) cb(err);
            else {
                db.users.save({
                    '_id': '57dc171b8760d15dc1864044',
                    'orcid': orcid_o2r,
                    'level': 100,
                    'name': 'o2r-testuser'
                }, function (err, doc) {
                    if (err) cb(err);
                    else {
                        debug('Added session and user o2r');
                        cb(null, doc);
                    }
                });
            }
        });
    };

    loadUserPlain = (cb) => {
        var session_plain = {
            '_id': sessionId_plain,
            'session': {
                'cookie': {
                    'originalMaxAge': null,
                    'expires': null,
                    'secure': null,
                    'httpOnly': true,
                    'domain': null,
                    'path': '/'
                },
                'passport': {
                    'user': orcid_plain
                }
            }
        }
        db.sessions.save(session_plain, function (err, doc) {
            if (err) cb(err);
            else {
                db.users.save({
                    '_id': '57b55ee700aee212007ac27f',
                    'orcid': orcid_plain,
                    'level': 0,
                    'name': 'plain-testuser'
                }, function (err, doc) {
                    if (err) cb(err);
                    else {
                        debug('Added session and user plain');
                        cb(null, doc);
                    }
                });
            }
        });
    };

    loadUserUploader = (cb) => {
        var session_uploader = {
            '_id': sessionId_uploader,
            'session': {
                'cookie': {
                    'originalMaxAge': null,
                    'expires': null,
                    'secure': null,
                    'httpOnly': true,
                    'domain': null,
                    'path': '/'
                },
                'passport': {
                    'user': orcid_uploader
                }
            }
        }
        db.sessions.save(session_uploader, function (err, doc) {
            if (err) cb(err);
            else {
                db.users.save({
                    '_id': '58a2e0ea1d68491233b925e8',
                    'orcid': orcid_uploader,
                    'level': 100,
                    'name': 'plain-testuser'
                }, function (err, doc) {
                    if (err) cb(err);
                    else {
                        debug('Added session and user uploader');
                        cb(null, doc);
                    }
                });
            }
        });

    };

    loadUserAdmin = (cb) => {
        var session_admin = {
            '_id': sessionId_admin,
            'session': {
                'cookie': {
                    'originalMaxAge': null,
                    'expires': null,
                    'secure': null,
                    'httpOnly': true,
                    'domain': null,
                    'path': '/'
                },
                'passport': {
                    'user': orcid_admin
                }
            }
        }
        db.sessions.save(session_admin, function (err, doc) {
            if (err) cb(err);
            else {
                db.users.save({
                    '_id': '5887181ebd95ff5ae8febb88',
                    'orcid': orcid_admin,
                    'level': 1000,
                    'name': 'admin'
                }, function (err, doc) {
                    if (err) cb(err);
                    else {
                        debug('Added session and user admin');
                        cb(null, doc);
                    }
                });
            }
        });
    };

    loadUserEditor = (cb) => {
        var session_editor = {
            '_id': sessionId_editor,
            'session': {
                'cookie': {
                    'originalMaxAge': null,
                    'expires': null,
                    'secure': null,
                    'httpOnly': true,
                    'domain': null,
                    'path': '/'
                },
                'passport': {
                    'user': orcid_editor
                }
            }
        }
        db.sessions.save(session_editor, function (err, doc) {
            if (err) cb(err);
            else {
                db.users.save({
                    '_id': '598438375a2a970bbd4bf4fe',
                    'orcid': orcid_editor,
                    'level': 500,
                    'name': 'editor'
                }, function (err, doc) {
                    if (err) cb(err);
                    else {
                        debug('Added session and user editor');
                        cb(null, doc);
                    }
                });
            }
        });
    };

    close = (cb) => {
        db.close();
        debug('Closed DB connection, completed loading of test data.');
        cb(null, {});
    };

    pullBaseImageForManifestGeneration = (cb) => {
        docker.pull(config.containerit.baseImage, function (err, stream) {
            if (err) {
                cb(err);
            } else {
                function onFinished(err, output) {
                    if (err) cb(err);
                    else {
                        debug('Pulled image %s', config.containerit.baseImage);
                        cb(null, output);
                    }
                }

                docker.modem.followProgress(stream, onFinished);
            }
        });
    }

    // otherwise tests time out
    buildDockerfileSimilarToTestDockerfile = (cb) => {
        dockerFile = 'Dockerfile';
        debug('Pre-building image for tests using file "%s" (logs cut off after 100 characters)', dockerFile);

        docker.buildImage({
            context: __dirname,
            src: [dockerFile]
        }, { t: 'muncher_testing_base_image' }, function (err, stream) {
            if (err) {
                debug(err);
                cb(err);
                return;
            }
            stream.on('data', function (data) {
                s = JSON.parse(data.toString('utf8'));
                if (s.stream) debug(s.stream.substring(0, 100).trim());
            });

            stream.on('end', function () {
                cb(null, 'built image using ' + tar);
            });
        });
    }

    async.series([
        loadUserO2r,
        loadUserUploader,
        loadUserPlain,
        loadUserAdmin,
        loadUserEditor,
        pullBaseImageForManifestGeneration,
        buildDockerfileSimilarToTestDockerfile,
        close
    ],
        function (err, results) {
            if (err) {
                debug('Error during test setup: %o', err);
                process.exit(1);
            } else {
                debug('Test setup result: %o', results);
                done();
            }
        });

});

after(function (done) {
    this.timeout(90000);
    delete docker;
    done();
});

after(function (done) {
    //global.asyncDump();
    done();
});
