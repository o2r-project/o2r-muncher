/*
 * (C) Copyright 2017 o2r project.
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
const debug = require('debug')('muncher:meta');
const Stream = require('stream');
const fs = require('fs');
const path = require('path');
const Docker = require('dockerode');

var docker = new Docker();

/*
 * conduct a brokering for the given metadata directory and identifier, and the selected mapping
 */
module.exports.broker = function (id, metadata_dir, metadata_file, current_mapping) {
    return new Promise((fulfill, reject) => {
        debug('[%s] Brokering "%s" metadata (using input file %s) to directory %s', id, current_mapping, metadata_file, metadata_dir);

        let binds = [
            metadata_dir + ':' + metadata_dir
        ];
        if (config.fs.volume) {
            debug('[%s][%s] volume is configured, overwriting binds configuration (was %o)', id, current_mapping, binds);
            // metadata_dir always starts with config.fs.base, mounting more than needed but limiting scope with cmd
            binds = [
                config.fs.volume + ':' + config.fs.base
            ];
        }

        let create_options = Object.assign(
            config.meta.container.default_create_options,
            {
                name: 'meta_broker_' + id + '_' + current_mapping,
                HostConfig: {
                    Binds: binds,
                    AutoRemove: config.meta.container.rm
                }
            }
        );
        let start_options = {};
        let cmd = [
            '-debug',
            config.meta.broker.module,
            '--inputfile', metadata_file,
            '--map', config.meta.broker.mappings[current_mapping].mappingFile,
            '--outputdir', metadata_dir
        ];

        debug('[%s][%s] Starting Docker container now with options and command:\n\tcreate_options: %s\n\tstart_options: %s\n\tcmd: %s',
            id, current_mapping, JSON.stringify(create_options), JSON.stringify(start_options), cmd.join(' '));

        const containerLogStream = Stream.Writable();
        containerLogStream._write = function (chunk, enc, next) {
            debug('[%s][%s] [broker container] %s', id, current_mapping, Buffer.from(chunk).toString().trim());
            next();
        };

        docker.run(config.meta.container.image, cmd, containerLogStream, create_options, start_options, (err, data, container) => {
            debug('[%s][%s] container running: %o', id, current_mapping, container);
            if (err) {
                debug('[%s][%s] error during metadata brokering: %o', id, current_mapping, err);
                reject(err);
            } else {
                if (data.StatusCode === 0) {
                    debug('[%s][%s] Completed metadata brokering: %o', id, current_mapping, data);

                    // check if metadata was found, if so return it
                    try {
                        // check if metadata was brokered, then read the file and return metadata
                        fs.readdir(metadata_dir, (err, files) => {
                            if (err) {
                                debug('[%s][%s] Error reading brokered metadata directory %s:\n\t%s', id, current_mapping, metadata_dir, err);
                                reject(err);
                            } else {
                                debug('[%s][%s] Completed metadata brokering and now have %s metadata files: %s',
                                    id, current_mapping, files.length, JSON.stringify(files));

                                let mapped_file = path.join(metadata_dir, config.meta.broker.mappings[current_mapping].file);
                                debug('[%s] Loading brokering output from file %s', id, mapped_file);
                                fs.readFile(mapped_file, (err, data) => {
                                    if (err) {
                                        debug('[%s][%s] Error reading mapped file "%s": %s', id, current_mapping, mapped_file, err.message);
                                        reject(err);
                                    } else {
                                        let mapping_output = JSON.parse(data);
                                        debug('[%s][%s] Finished metadata brokering', id, current_mapping);
                                        fulfill({
                                            name: current_mapping,
                                            target: config.meta.broker.mappings[current_mapping].targetElement,
                                            result: mapping_output
                                        });
                                    }
                                });
                            }
                        });
                    } catch (err) {
                        debug('[%s][%s] error reading metadata directory: %s', id, current_mapping, err.message);
                        reject(err);
                    }
                } else {
                    debug('[%s][%s] Error during meta container run: %o', id, current_mapping, data);
                    container.logs({
                        follow: true,
                        stdout: true,
                        stderr: true,
                        timestamps: true
                    }, function (err, stream) {
                        if (err)
                            debug('[%s][%s] Error getting container logs after non-zero status code', id, current_mapping);
                        else {
                            stream.on('data', function (data) {
                                debug('[%s][%s] container logs      ', id, current_mapping, Buffer.from(data).toString().trim());
                            });
                        }
                    });

                    reject(new Error('Received non-zero statuscode from container brokering metadata for ' + current_mapping));
                }
            }
        });
    });
}

getSchemaPathForFilename = function (filename) {
    schema = config.meta.validate.schemas
        .find(element => { return element.file === filename });
    return (schema.schema);
}

/*
 * conduct a metadata validation for the given metadata file, automatically selecting the right schema
 */
module.exports.validate = function (id, metadata_file) {
    return new Promise((fulfill, reject) => {
        let schema = getSchemaPathForFilename(path.basename(metadata_file))
        debug('[%s] Validating metadata file %s with schema %s', id, metadata_file, schema);

        let binds = [
            metadata_file + ':' + metadata_file
        ];
        if (config.fs.volume) {
            debug('[%s] volume is configured, overwriting binds configuration (was %o)', id, binds);
            // metadata_dir always starts with config.fs.base, mounting more than needed but limiting scope with cmd
            binds = [
                config.fs.volume + ':' + config.fs.base
            ];
        }

        let create_options = Object.assign(
            config.meta.container.default_create_options,
            {
                name: 'meta_validate_' + id + '_' + path.basename(metadata_file),
                HostConfig: {
                    Binds: binds,
                    AutoRemove: config.meta.container.rm
                }
            }
        );
        let start_options = {};
        let cmd = [
            '-debug',
            config.meta.validate.module,
            '-s', schema,
            '-c', metadata_file
        ];

        debug('[%s] Starting Docker container now with options and command:\n\tcreate_options: %s\n\tstart_options: %s\n\tcmd: %s',
            id, JSON.stringify(create_options), JSON.stringify(start_options), cmd.join(' '));

        var containerLogStream = Stream.Writable();
        let log = [];
        containerLogStream._write = function (chunk, enc, next) {
            log.push(chunk);
            debug('[%s] [validate container] %s', id, Buffer.from(chunk).toString().trim());
            next();
        };

        docker.run(config.meta.container.image, cmd, containerLogStream, create_options, start_options, (err, data, container) => {
            debug('[%s] container running: %o', id, container);
            if (err) {
                debug('[%s] error during metadata validation:', err);
                reject(err);
            } else {
                if (data.StatusCode === 0) {
                    debug('[%s] Completed metadata validation, container result: %o', id, data);
                    logString = log.join('\n');

                    resultData = {
                        id: id,
                        file: metadata_file,
                        schema: schema,
                        log: logString
                    };

                    if (logString.indexOf('!invalid') < 0) {
                        debug('[%s] Metadata is VALID', id);
                        fulfill(resultData);
                    } else {
                        debug('[%s] Metadata is INvalid', id);

                        if (config.meta.validate.allowInvalid) {
                            debug('[%s] Metadata is invalid BUT invalid metadata is allowed, not returning an error. Validation output:\n%s', id, logString);
                            fulfill(resultData);
                        } else {
                            reject({
                                id: id,
                                file: metadata_file,
                                schema: schema,
                                log: logString
                            });
                        }
                    }
                } else {
                    debug('[%s] Error during meta container validation %s: %o', id, current_mapping, data);
                    container.logs({
                        follow: true,
                        stdout: true,
                        stderr: true,
                        timestamps: true
                    }, function (err, stream) {
                        if (err)
                            debug('[%s] Error getting container logs after non-zero status code', id);
                        else {
                            stream.on('data', function (data) {
                                debug('[%s] container logs      ', id, Buffer.from(data).toString().trim());
                            });
                        }
                    });

                    reject(new Error('Received non-zero statuscode from container'));
                }
            }
        });
    });
}