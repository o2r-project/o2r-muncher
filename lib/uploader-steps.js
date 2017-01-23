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
const nodemailer = require('nodemailer');

const Compendium = require('../lib/model/compendium');
const Stream = require('stream');
const path = require('path');
const fs = require('fs');

if (config.bagtainer.scan.enable) {
    debug('Using clamscan with configuration %s', JSON.stringify(clam.settings));
}

// create reusable transporter object using the default SMTP transport
var emailTransporter = null;
var clam = null;
if (config.bagtainer.scan.enable) {
    clam = require('clamscan')(config.bagtainer.scan.settings);
    debug('Virus scanning enabled: %s', JSON.stringify(config.bagtainer.scan.settings));
} else {
    debug('Virus scanning _disabled_');
}
if (config.bagtainer.scan.email.enable
    && config.bagtainer.scan.email.transport
    && config.bagtainer.scan.email.sender
    && config.bagtainer.scan.email.receivers) {

    emailTransporter = nodemailer.createTransport(config.bagtainer.scan.email.transport);
    debug('Sending emails on critical errors to %s', config.bagtainer.scan.email.receivers);
} else {
    debug('Email notification for virus detection _not_ active: %s', JSON.stringify(config.bagtainer.scan.email));
}


function unzip(passon) {
    return new Promise((fulfill, reject) => {
        debug('Unzipping %s', passon.id);

        var outputPath = path.join(config.fs.compendium, passon.id);
        var cmd = '';
        switch (passon.req.file.mimetype) {
            case 'application/zip':
            case 'application/x-zip':
            case 'application/x-zip-compressed':
            case 'multipart/x-zip':
                cmd = 'unzip -uq ' + passon.req.file.path + ' -d ' + outputPath;
                if (config.fs.delete_inc) { // should incoming files be deleted after extraction?
                    cmd += ' && rm ' + passon.req.file.path;
                }
                break;
            default:
                cmd = 'false';
                debug('Got unsupported mimetype: "%s" in uploaded file:\n%s',
                    passon.req.file.mimetype, JSON.stringify(passon.req.file));
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
                debug('[%s] Unzip finished! Files stored in %s', passon.id, passon.bagpath);
                fulfill(passon);
            }
        });
    });
}

function scan(passon) {
    return new Promise((fulfill, reject) => {
        if (!config.bagtainer.scan.enable) {
            fulfill(passon);
        } else if (!clam) {
            fulfill(passon);
        } else {
            debug('Scanning %s for viruses at path %s', passon.id, passon.bagpath);
            clam.scan_dir(passon.bagpath, (error, good, bad) => {
                if (error) {
                    debug(error);
                    reject(error);
                } else {
                    debug('Virus scan completed and had %s good and >> %s << bad files', good.length, bad.length);
                    if (bad.length > 0) {
                        debug('Virus found, deleting directory  %s', passon.bagpath);

                        let badfiles = bad.join('\n\t');
                        debug('Found bad files in:\n\t%s', badfiles);

                        exec('rm -r ' + passon.bagpath, (error, stdout, stderr) => {
                            if (error || stderr) {
                                debug(error, stderr, stdout);
                                debug('Error deleting compendium with virus. File deleted by virus checker? %s)',
                                    clam.settings.remove_infected);
                            } else {
                                debug('Deleted directory %s', passon.bagpath);
                            }

                            if (emailTransporter) {
                                let mail = {
                                    from: config.bagtainer.scan.email.sender, // sender address 
                                    to: config.bagtainer.scan.email.receivers,
                                    subject: '[o2r platform] a virus was detected during upload',
                                    text: 'A virus was detected in a compendium uploaded by user ' + passon.user +
                                    ' in these files:\n\n' + JSON.stringify(bad)
                                };

                                emailTransporter.sendMail(mail, function (error, info) {
                                    if (error) {
                                        debug('Problem sending notification email: %s', error.message);
                                    }
                                    debug('Email sent: %s\n%s', info.response, JSON.stringify(mail));
                                });
                            }

                            let msg = 'Virus scan found infected file(s) in directory'
                            let err = new Error(msg);
                            err.status = 422;
                            err.msg = msg;
                            reject(err);
                        });
                    } else {
                        debug('No viruses found in %s', passon.id);
                        fulfill(passon);
                    }
                }
            });
        }
    });
}

function extractMetadata(passon) {
    return new Promise((fulfill, reject) => {
        debug('Extracting metadata from %s', passon.id);

        let metaextract_input_dir = path.join(passon.bagpath, config.bagtainer.payloadDirectory)
        let metaextract_output_dir = path.join(metaextract_input_dir, config.bagtainer.metaextract.outputDir);

        let cmd = [
            config.bagtainer.metaextract.cliPath,
            '-debug',
            config.bagtainer.metaextract.module,
            '--inputdir', metaextract_input_dir,
            '--outputdir', metaextract_output_dir,
            '--metafiles', // save all raw files
            '--ercid', passon.id // pass the erc id
            //'-xo' // disable calls to ORCID API
        ].join(' ');

        debug('[%s] Running metadata extraction with command "%s"', passon.id, cmd);
        exec(cmd, (error, stdout, stderr) => {
            if (error || stderr) {
                debug('[%s] Problem during metadata extraction:\n\t%s\n\t%s',
                    passon.id, error.message, stderr.message);
                debug(error, stderr, stdout);
                let errors = error.message.split(':');
                let message = errorMessageHelper(errors[errors.length - 1]);
                passon.res.status(500).send(JSON.stringify({ error: 'metadata extraction failed: ' + message }));
                reject(error);
            } else {
                debug('[%s] Completed metadata extraction:\n\n%s\n', passon.id, stdout);

                // check if metadata was found, if so put the metadata directory into passon
                fs.readdir(metaextract_output_dir, (err, files) => {
                    if (err) {
                        debug('[%s] Error reading metadata directory %s [fail the upload? %s]:\n\t%s', passon.id,
                            metaextract_output_dir,
                            config.bagtainer.metaextract.failOnNoMetadata, err);
                        if (config.bagtainer.metaextract.failOnNoMetadata) {
                            reject(err);
                        } else {
                            debug('[%s] Continuing with empty metadata...', passon.id);
                            fulfill(passon);
                        }
                    } else if (files.length < 1) {
                        debug('[%s] Metadata extraction directory %s is empty [fail the upload? %s]:\n\t%s', passon.id,
                            metaextract_output_dir,
                            config.bagtainer.metaextract.failOnNoMetadata, err);
                        if (config.bagtainer.metaextract.failOnNoMetadata) {
                            reject(new Error('No files in the metadata directory'));
                        } else {
                            debug('[%s] Continuing with empty metadata...', passon.id);
                            fulfill(passon);
                        }
                    } else {
                        debug('[%s] Finished metadata extration and created %s metadata files: %s', passon.id,
                            files.length, JSON.stringify(files));
                        passon.metadata_dir = metaextract_output_dir;
                        fulfill(passon);
                    }
                });
            }
        });
    });
}

function loadMetadata(passon) {
    return new Promise((fulfill, reject) => {
        let mainMetadataFile = path.join(passon.metadata_dir, config.bagtainer.metaextract.bestCandidateFile);
        debug('[%s] Loading metadata from %s', passon.id, mainMetadataFile);

        fs.readFile(mainMetadataFile, (err, data) => {
            if (err) {
                debug('[%s] Error reading metadata file: %s [fail? %s]', passon.id, err.message,
                    config.bagtainer.metaextract.failOnNoMetadata);
                if (config.bagtainer.metaextract.failOnNoMetadata) {
                    reject(new Error('no metadata.json found in the metadata extraction directory'));
                } else {
                    debug('[%s] Continuing with empty metadata...', passon.id);
                    fulfill(passon);
                }
            } else {
                passon.metadata = {};
                passon.metadata.raw = JSON.parse(data);
                debug('[%s] Finished metadata loading!', passon.id);
                fulfill(passon);
            }
        });
    });
}

function brokerMetadata(passon) {
    return new Promise((fulfill, reject) => {
        debug('[%s] Brokering metadata', passon.id);

        if (passon.metadata) {
            if (passon.metadata.raw) {
                passon.metadata[config.bagtainer.metaextract.targetElement] = passon.metadata.raw;

                // add some placeholders to show brokering happened
                passon.metadata.zenodo = { title: passon.metadata.o2r.title };
                passon.metadata.cris = { title: passon.metadata.o2r.title };
                passon.metadata.orcid = { title: passon.metadata.o2r.title };
                passon.metadata.datacite = { title: passon.metadata.o2r.title };
            } else {
                debug('[%s] No _raw_ metadata provided that could be brokered!', passon.id);
            }
        } else {
            debug('[%s] No metadata provided that could be brokered!', passon.id);
        }
        debug('[%s] Finished brokering!', passon.id);
        fulfill(passon);
    });
}

function save(passon) {
    return new Promise((fulfill, reject) => {
        debug('[%s] Saving...', passon.id);
        var compendium = new Compendium({
            id: passon.id,
            user: passon.user,
            metadata: passon.metadata
        });

        compendium.save(err => {
            if (err) {
                debug('[%s] ERROR saving new compendium', passon.id);
                passon.res.status(500).send(JSON.stringify({ error: 'internal error' }));
                reject(err);
            } else {
                debug('[%s] Saved new compendium', passon.id);
                fulfill(passon);
            }
        });
    });
}

function cleanup(passon) {
    return new Promise((fulfill, reject) => {
        debug('Cleaning up after upload of %s', passon.id);

        if (passon.metaextract_container_id) {
            debug('Deleting metadata extraction container %s', passon.metaextract_container_id);

            var container = passon.docker.getContainer(passon.metaextract_container_id);
            container.remove(function (err, data) {
                if (err) {
                    debug('[%s] Error removing container %s', passon.id, passon.metaextract_container_id);
                    reject(passon);
                } else {
                    debug('[%s] Removed container %s %s', passon.id, passon.metaextract_container_id, data);
                    fulfill(passon);
                }
            });
        } else {
            fulfill(passon);
        }
    });
}

module.exports = {
    unzip: unzip,
    scan: scan,
    extractMetadata: extractMetadata,
    loadMetadata: loadMetadata,
    brokerMetadata: brokerMetadata,
    save: save,
    cleanup: cleanup
};
