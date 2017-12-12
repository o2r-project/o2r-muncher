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
        if(config.fs.volume) {
            debug('[%s] volume is configured, overwriting binds configuration (was %s)', id, JSON.stringify(binds));
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

        debug('[%s] Starting Docker container now with options and command:\n\tcreate_options: %s\n\tstart_options: %s\n\tcmd: %s',
            id, JSON.stringify(create_options), JSON.stringify(start_options), cmd.join(' '));

        const containerLogStream = Stream.Writable();
        containerLogStream._write = function (chunk, enc, next) {
            debug('[%s] [broker container] %s', id, Buffer.from(chunk).toString().trim());
            next();
        };

        docker.run(config.meta.container.image, cmd, containerLogStream, create_options, start_options, (err, data, container) => {
            debug('[%s] container running: %s', id, JSON.stringify(container));
            if (err) {
                debug('[%s] error during metadata brokering:', err);
                reject(err);
            } else {
                debug('[%s] broker container status code: %s', this.jobId, data.StatusCode);
                if (data.StatusCode === 0) {
                    debug('[%s] Completed metadata brokering for %s: %s', id, current_mapping, JSON.stringify(data));

                    // check if metadata was found, if so return it
                    try {
                        // check if metadata was brokered, then read the file and return metadata
                        fs.readdir(metadata_dir, (err, files) => {
                            if (err) {
                                debug('[%s] Error reading brokered metadata directory %s:\n\t%s', id, metadata_dir, err);
                                reject(err);
                            } else {
                                debug('[%s] Completed metadata brokering and now have %s metadata files: %s', id,
                                    files.length, JSON.stringify(files));

                                let mapped_file = path.join(metadata_dir, config.meta.broker.mappings[current_mapping].file);
                                debug('[%s] Loading brokering output from file %s', id, mapped_file);
                                fs.readFile(mapped_file, (err, data) => {
                                    if (err) {
                                        debug('[%s] Error reading mapped file "%s": %s', id, mapped_file, err.message);
                                        reject(err);
                                    } else {
                                        let mapping_output = JSON.parse(data);
                                        debug('[%s] Finished metadata brokering for %s', id, current_mapping);
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
                        debug('[%s] error reading metadata directory: %s', id, err.message);
                        reject(err);
                    }
                } else {
                    debug('[%s] Error during meta container run brokering %s: %s', id, current_mapping, JSON.stringify(data));
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
    }).catch(err => {
        debug('[%s] Error brokering metadata %s: %s', id, current_mapping, err);
        return {
            name: current_mapping,
            error: err
        };
    });
}