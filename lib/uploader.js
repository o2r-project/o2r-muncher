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

const config = require('../config/config');
const debug = require('debug')('muncher:uploader');
const exec = require('child_process').exec;
const errorMessageHelper = require('../lib/error-message');
const clone = require('clone');

const Compendium = require('../lib/model/compendium');
const Docker = require('dockerode');
const Stream = require('stream');
const path = require('path');
const fs = require('fs');
var validateBag = require('../lib/bagit').validateBag;

/**
 * Create Uploader to handle given request and response
 * @constructor
 * @param {object} request - The upload request
 * @param {object} response - The response
 */
function Uploader(req, res) {
    this.req = req;
    this.res = res;

    this.upload = (done) => {
        debug('Handling upload of %s for user %s', this.req.file.filename, this.req.user.orcid);

        let passon = {
            id: req.file.filename,
            user: this.req.user.orcid,
            req: this.req,
            res: this.res
        };
        return this.unzip(passon)
            .then(validateBag)
            .then(this.extractMetadata)
            .then(this.loadMetadata)
            //.then(this.updateMetadataWithCleverBrokerAndSchema)
            .then(this.save)
            .then(this.respond)
            .then((passon) => {
                done(passon.id);
            })
            .catch(err => {
                debug("[%s] Unhandled failure (or rejection) during execute: \n\t%s", this.jobId, err);
                res.status(500).send(JSON.stringify({ error: 'internal error' }));
            });
    }

    this.unzip = (passon) => {
        return new Promise((fulfill, reject) => {
            debug('Unzipping %s', passon.id);

            var outputPath = path.join(config.fs.compendium, passon.id);
            var cmd = '';
            switch (passon.req.file.mimetype) {
                case 'application/zip':
                    cmd = 'unzip -uq ' + passon.req.file.path + ' -d ' + outputPath;
                    if (config.fs.delete_inc) { // should incoming files be deleted after extraction?
                        cmd += ' && rm ' + passon.req.file.path;
                    }
                    break;
                default:
                    cmd = 'false';
            }

            debug('Unzipping command "%s"', cmd);
            exec(cmd, (error, stdout, stderr) => {
                if (error || stderr) {
                    debug(error, stderr, stdout);
                    let errors = error.message.split(':');
                    let message = errorMessageHelper(errors[errors.length - 1]);
                    passon.res.status(500).send(JSON.stringify({ error: 'extraction failed: ' + message }));
                    reject(error);
                } else {
                    passon.bagpath = outputPath;
                    debug('Unzip of %s complete! Stored in %s', passon.id, passon.bagpath);
                    fulfill(passon);
                }
            });
        });
    };

    this.extractMetadata = (passon) => {
        return new Promise((fulfill, reject) => {
            debug('Extracting metadata from %s', passon.id);
            // setup Docker client with default options
            var docker = new Docker();
            debug('[%s] Docker client set up: %s', passon.id, JSON.stringify(docker));

            // create stream for logging
            let logStream = Stream.Writable();
            logStream.compendium_id = passon.id;
            logStream._write = function (chunk, enc, next) {
                debug('[o2r-meta-extract] [%s] %s', passon.id, chunk);
                next();
            }

            let mountpoint = path.join('/', passon.id, config.bagtainer.payloadDirectory);
            let create_options = clone(config.bagtainer.metaextract.create_options);
            create_options.HostConfig = {};
            create_options.HostConfig.Binds = [
                path.join(passon.bagpath, config.bagtainer.payloadDirectory) + ':'
                + mountpoint + ':rw'
            ];
            let cmd = ['-i', mountpoint,
                '-o', path.join(mountpoint, config.bagtainer.metaextract.outputDir)];

            debug('[%s] Running container with command "%s" and options: %s', passon.id, cmd, JSON.stringify(create_options));
            docker.run(config.bagtainer.metaextract.image,
                cmd,
                logStream,
                create_options,
                {},
                (err, data, container) => {
                    if (err) {
                        debug('[o2r-meta-extract] [%s] Problem during container run: %s',
                            this.compendium_id, err.message);
                        reject(err);
                        return;
                    }
                    debug('[%s] Container exit code: %s', data.StatusCode);
                    if (data.StatusCode === 0) {

                        // put the raw metadata files into passon
                        let metadataDirectory = path.join(passon.bagpath,
                            config.bagtainer.payloadDirectory,
                            config.bagtainer.metaextract.outputDir);
                        fs.readdir(metadataDirectory, (err, files) => {
                            if (err) {
                                debug('Error reading metadata directory: %s', err);
                                reject(passon);
                            } else {
                                passon.rawMetadata = [];
                                files
                                    .filter((file) => {
                                        return path.extname(file) === '.json';
                                    })
                                    .forEach(file => {
                                        passon.rawMetadata.push(path.join(metadataDirectory, file));
                                    });
                                debug('Extration created %s raw metadata files: %s',
                                    passon.rawMetadata.length, JSON.stringify(passon.rawMetadata));
                                fulfill(passon);
                            }
                        });
                    } else {
                        debug('[%s] ERROR: metadata extraction container exited with %s', data.StatusCode);
                        reject(passon);
                    }
                });
        });
    }

    this.loadMetadata = (passon) => {
        return new Promise((fulfill, reject) => {
            debug('Loading metadata for %s using %s', passon.id, JSON.stringify(passon.rawMetadata));

            if (passon.rawMetadata.length > 1) {
                debug('WARNING: More than one raw metadata file given, using only the first one.');
            }

            if (passon.rawMetadata.length < 1) {
                debug('WARNING: No raw metadata file given, no metadata for %s', passon.id);
            } else {
                fs.readFile(passon.rawMetadata[0], (err, data) => {
                    if (err) {
                        debug('Error reading metadata file: %s', err);
                        reject(err);
                    } else {
                        passon.metadata = JSON.parse(data);
                        fulfill(passon);
                    }
                });
            }
        });
    }

    this.save = (passon) => {
        return new Promise((fulfill, reject) => {
            debug('Saving %s', passon.id);
            var compendium = new Compendium({
                id: passon.id,
                user: passon.user,
                metadata: passon.metadata
            });

            compendium.save(err => {
                if (err) {
                    debug('ERROR saving new compendium %s', passon.id);
                    passon.res.status(500).send(JSON.stringify({ error: 'internal error' }));
                    reject(err);
                } else {
                    debug('Saved new compendium %s', passon.id);
                    fulfill(passon);
                }
            });
        });
    }

    this.respond = (passon) => {
        return new Promise((fulfill) => {
            passon.res.status(200).send({ id: passon.id });
            debug('New compendium %s', passon.id);
            fulfill(passon);
        });
    }
}

module.exports.Uploader = Uploader;
