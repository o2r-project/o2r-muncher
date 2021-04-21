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
const debug = require('debug')('muncher:load:steps');
const exec = require('child_process').exec;
const errorMessageHelper = require('../lib/error-message');

const Compendium = require('../lib/model/compendium');
const path = require('path');
const fs = require('fs');
const fse = require('fs-extra');
const url = require('url');
const createClient = require('webdav').createClient;
const https = require('https');
const htmlparser = require('htmlparser2');
const objectPath = require('object-path');
const recursiveReaddir = require('recursive-readdir');
const detectCharacterEncoding = require('detect-character-encoding');
const util = require('util');
const Docker = require('dockerode');
const Stream = require('stream');
const meta = require('../lib/meta');
const yaml = require('js-yaml');

var docker = new Docker();

function publicShareLoad(passon) {
    debug('[%s] Loading file list from sciebo', passon.id);

    // Extract owncloud share token from share URL
    let sharedURL_parsed = url.parse(passon.shareURL);
    let pathElements = sharedURL_parsed.path.split('/');
    let token = pathElements[pathElements.length - 1];

    //build webdav url for the client from share URL (replace "/index.php/s/<share_token>" or "/s/<share_token>" with "/public.php/webdav")
    // https://doc.owncloud.com/server/user_manual/files/access_webdav.html#accessing-public-link-shares-over-webdav
    let webdavURL = new url.URL(config.webdav.sciebo.webdav_path, sharedURL_parsed.href);

    passon.client = createClient(
        webdavURL.toString(),
        {
            username: token
        }
    );
    debug('[%s] Created client with WebDAV URL %s', passon.id, webdavURL);

    return getContents(passon)
        .then(analyzeContents)
        .then(checkContents)
        .then(checkAndLoadZip)
        .then(checkAndCopyCompendium)
        .then(checkAndLoadFiles)
        .catch(function (err) {
            debug('[%s] Error loading public share (rethrow): %s', passon.id, err);
            throw err;
        });
}

/**
 * Loads filename(s) from the zenodo record by parsing the HTML document
 * @param {string} passon.zenodoID - The Zenodo record id.
 * @param {string} passon.baseURL - The Zenodo URL without a path (https://zenodo.org or https://sandbox.zenodo.org).
 */
function checkZenodoContents(passon) {
    return new Promise((fulfill, reject) => {
        if (typeof passon.filename !== 'undefined') {
            debug('Filename for record %s already specified. Continuing with download.', passon.zenodoID);
            passon.zenodoLink = passon.baseURL + path.join('record/', passon.zenodoID, '/files/', passon.filename);
            fulfill(passon);
            return;
        }

        let requestURL = passon.baseURL + 'record/' + passon.zenodoID;

        https.get(requestURL, (res) => {
            debug('Fetched zenodo contents, statusCode:', res.statusCode);
            if (res.statusCode !== 200) {
                debug('Error: No Zenodo record found at %s!', requestURL);
                let err = new Error('Zenodo record not found!');
                err.status = 404;
                reject(err);
                return;
            }

            res.on('data', (d) => {
                debug('Loading zenodo html document...');

                let zenodoLinks = [];
                //parse the html document and extract links such as "<link rel="alternate" type="application/zip" href="https://sandbox.zenodo.org/record/69114/files/metatainer.zip">"
                var parser = new htmlparser.Parser({
                    onopentag: function (name, attribs) {
                        if (name === 'link' && attribs.rel === 'alternate' && attribs.type === 'application/zip') {
                            //save links to files in zenodoLinks
                            zenodoLinks.push(attribs.href);
                        }
                    }
                }, { decodeEntities: true });
                parser.write(d.toString());
                parser.end();

                if (zenodoLinks.length === 0) { //If the parser did not find any zip files in the HTML document
                    debug('No files found in zenodo deposit.');
                    let err = new Error('No files found in zenodo deposit.');
                    err.status = 404;
                    reject(err);
                }

                // Handle only the first zip file (for now)
                passon.zenodoLink = zenodoLinks[0];
                debug('Parsing zenodo contents completed, found zip file %s', passon.zenodoLink);
                fulfill(passon);
            });

        }).on('error', (e) => {
            debug('Loading file list failed, error: %s', e);
            e.status = 404;
            e.message = 'Loading file list failed';
            reject(e);
        });
    });
}

/**
 * Currently not in use!
 * Loads metadata (filenames, ...) from a zenodo deposit using the zenodo developer API.
 * Currently not used because the zenodo developer API only allows access to your personal files
 * @param {string} passon.zenodoID - The zenodo record id.
 * @param {string} passon.baseURL - The zenodo URL without a path (https://zenodo.org or https://sandbox.zenodo.org).
 * @param {string} config.zenodo.token - The user's zenodo dev access_token
 */
function checkZenodoContentsViaAPI(passon) {
    return new Promise((fulfill, reject) => {
        debug('Checking files in Zenodo deposit');

        let requestURL = passon.baseURL + 'api/deposit/depositions/' + passon.zenodoID;

        if (!config.zenodo.token) {
            debug('ZENODO_TOKEN not set');
            let err = new Error('ZENODO_TOKEN not set');
            err.status = 404;
            reject(err);
            return;
        } else {
            requestURL += '?access_token=' + config.zenodo.token;
        }
        debug('Getting data on zenodo record %s with request %s', passon.zenodoID, requestURL);

        https.get(requestURL, (res) => {
            debug('Fetched zenodo contents, statusCode:', res.statusCode);

            res.on('data', (d) => {
                // check files length
                let data = JSON.parse(d);
                if (data.files.length === 0) {
                    debug('No files found in zenodo deposit.');
                    let err = new Error('No files found in zenodo deposit.');
                    err.status = 404;
                    reject(err);
                }
                passon.zenodoFiles = [];
                passon.zenodoFiles = data.files;
                passon.filename = data.files[0].filename;
                //passon.zenodoLink = data.files[0].links.download;
                //process.stdout.write(data);
                debug('Reading zenodo record completed');
                fulfill(passon);
            });

        }).on('error', (e) => {
            debug('Loading file list failed, error: %s', e);
            e.status = 404;
            e.message = 'Loading file list failed';
            reject(e);
        });

    });
}


/**
 * Loads a single file from zenodo.org or sandbox.zenodo.org
 * @param {string} passon.zenodoLink - The download link of the first zip file in the zenodo record.
 * @param {string} passon.zenodoID - The zenodo record id.
 */
function zenodoLoad(passon) {
    return new Promise((fulfill, reject) => {
        debug('Loading files from Zenodo using link "%s"', passon.zenodoLink);
        var zipPath = path.join(config.fs.incoming, passon.id);
        var cmd = 'wget -q -O ' + zipPath + ' ' + passon.zenodoLink;
        passon.result = {};
        passon.result.zipName = passon.zenodoLink;

        debug('Downloading using command "%s"', cmd);
        exec(cmd, (error, stdout, stderr) => {
            if (error || stderr) {
                debug(error, stderr, stdout);
                let errors = error.message.split(':');
                let message = errorMessageHelper(errors[errors.length - 1]);
                error.msg = 'download failed: ' + message;
                error.status = 500;
                reject(error);
            } else {
                passon.archive = zipPath;
                debug('Download of zenodo record %s complete, saved at "%s"', passon.id, passon.archive);
                fulfill(passon);
            }
        });
    });
}

function getContents(passon) {
    return new Promise((fulfill, reject) => {
        passon.client
            .getDirectoryContents(passon.webdav_path)
            .then(function (contents) {
                passon.contents = contents;
                debug('[%s] Successfully loaded file list of %s with path "%s" resulting in length %s',
                    passon.id, passon.shareURL, passon.webdav_path, passon.contents.length);
                fulfill(passon);
            })
            .catch(function (error) {
                debug(error);
                error.status = 404;
                error.msg = 'could not read webdav contents';
                reject(error);
            });
    })
}

function analyzeContents(passon) {
    return new Promise((fulfill, reject) => {

        let contents = passon.contents;

        let result = {
            bagitCount: 0,
            zipCount: 0,
            directoryCount: 0,
            length: 0
        };

        for (let i = 0; i < contents.length; i++) {
            if (contents[i].basename === 'bagit.txt') {
                result.bagitCount++;
            } else if (contents[i].mime === 'application/zip') {
                result.zipCount++;
                if (passon.zipFile) {
                    //use the file provided in the path parameter (support for zip file names in path parameter)
                    result.zipName = passon.zipFile;
                } else {
                    //use the file found in the webdav directory
                    result.zipName = contents[i].basename;
                }
                if (result.zipName === 'webdav') { // return an error message if a zip file is submitted directly
                    debug('Direct file submission is not supported.');
                    let err = new Error('Direct file submission is not supported. Please submit a shared folder containing the file.');
                    err.status = 404;
                    reject(err);
                }
            } else if (contents[i].type === 'directory') {
                result.directoryCount++;
            }
        }
        result.length = contents.length;
        passon.result = result;
        debug('[%s] Content analysis: Found %s bagit.txt, %s zip files, %s directories, and %s elements overall',
            passon.id, result.bagitCount, result.zipCount, result.directoryCount, result.length);
        fulfill(passon);
    });
}

function checkContents(passon) {
    return new Promise((fulfill, reject) => {
        if (passon.result.length === 0) {
            let message = 'public share is empty';
            let err = new Error(message);
            err.status = 400;
            err.msg = 'public share is empty'; // overwrite default message
            reject(err);
        } else {
            fulfill(passon);
        }
    });
}

function checkAndCopyCompendium(passon) {
    return new Promise((fulfill, reject) => {
        if (passon.archive) {
            debug('[%s] Skipping check and copy compendium step, archive already downloaded: %s', passon.id, passon.archive);
            fulfill(passon);
        } else if (passon.result.bagitCount === 0 && passon.content === 'compendium') {
            debug('[%s] Error: no bagit found BUT content type is "%s".', passon.id, passon.content);
            let error = new Error('bagit not found but content type is ' + passon.content);
            error.msg = 'load from share failed: ' + error.message;
            error.status = 400;
            reject(error);
        } else if (passon.result.bagitCount === 0 && passon.content !== 'compendium') {
            debug('[%s] No bagit found and content type is "%s", all OK but skipping compendium check/copy step.', passon.id, passon.content);
            fulfill(passon);
        } else {
            debug('[%s] Found bagit (%s), downloading as compendium with content type %s', passon.id, passon.result.bagitCount, passon.content);

            //wget zip with well-known Sciebo URL and continue with unzip
            let downloadURL = passon.shareURL + '/download?path=' + encodeURIComponent(passon.webdav_path);
            let zipPath = path.join(config.fs.incoming, passon.id);
            let cmd = 'wget -q -O ' + zipPath + ' ' + downloadURL;

            debug('[%s] Downloading: "%s"', passon.id, cmd);
            exec(cmd, (error, stdout, stderr) => {
                if (error || stderr) {
                    debug(error, stderr, stdout);
                    let errors = error.message.split(':');
                    let message = errorMessageHelper(errors[errors.length - 1]);
                    error.msg = 'download failed: ' + message;
                    error.status = 500;
                    reject(error);
                } else {
                    debug('[%s] Download of public share complete!', passon.id);
                    passon.archive = zipPath;
                    fulfill(passon);
                }
            });
        }
    });
}

function checkAndLoadZip(passon) {
    //Check if a single zip file exists -> load and unzip it
    return new Promise((fulfill, reject) => {
        if (passon.result.zipCount >= 1 && passon.result.bagitCount === 0) {
            if (passon.result.zipCount === 1) {
                debug('[%s] Single zip file found: %s', passon.id);
            } else if (passon.zipFile) {
                debug('[%s] Multiple zip files found: %s. Filename %s was provided.', passon.id, passon.zipFile);
            } else {
                debug('[%s] Multiple zip files found but no filename provided, aborting.', passon.id);
                let error = new Error();
                error.msg = 'Multiple zip files found but no filename provided';
                error.status = 404;
                reject(error);
            }
            return passon.client
                .getFileContents(path.join(passon.webdav_path, passon.result.zipName))
                .then(function (zipData) {
                    let downloadFile = path.join(config.fs.incoming, passon.id);
                    fs.writeFile(downloadFile, zipData, function (err) {
                        if (err) {
                            reject(err);
                        } else {
                            passon.archive = downloadFile;
                            debug('[%s] Successfully loaded zip file for compendium: %s', passon.id, passon.archive);
                            fulfill(passon);
                        }
                    });
                })
                .catch(function (error) {
                    debug('[%s] Error loading public share as zip file: %s', error);
                    error.status = 404;
                    error.msg = 'could not download zip file';
                    reject(error);
                });
        } else {
            fulfill(passon);
        }
    });
}

function checkAndLoadFiles(passon) {
    return new Promise((fulfill, reject) => {
        if (passon.result.bagitCount === 0 && passon.result.zipCount === 0) {
            let share = path.join(passon.webdav_path);
            debug('[%s] Load %s files from share at: %s', passon.id, passon.result.length, share);

            //wget zip and continue with unzip
            let downloadURL = passon.shareURL + '/download?path=' + encodeURIComponent(passon.webdav_path);
            let zipPath = path.join(config.fs.incoming, passon.id);
            let cmd = 'wget -q -O ' + zipPath + ' ' + downloadURL;

            debug('[%s] Downloading: "%s"', passon.id, cmd);
            exec(cmd, (error, stdout, stderr) => {
                if (error || stderr) {
                    debug(error, stderr, stdout);
                    let errors = error.message.split(':');
                    let message = errorMessageHelper(errors[errors.length - 1]);
                    error.msg = 'download failed: ' + message;
                    error.status = 500;
                    reject(error);
                } else {
                    debug('[%s] Download of public share complete!', passon.id);
                    passon.archive = zipPath;
                    fulfill(passon);
                }
            });
        } else {
            fulfill(passon);
        }
    });
}

function unzipUpload(passon) {
    return new Promise((fulfill, reject) => {
        debug('[%s] Unzip for direct upload', passon.id);

        let outputPath = path.join(config.fs.compendium, passon.id);
        switch (passon.req.file.mimetype) {
            case 'application/zip':
            case 'application/x-zip':
            case 'application/x-zip-compressed':
            case 'multipart/x-zip':
                cmd = 'unzip -uq ' + passon.req.file.path + ' -d ' + outputPath;
                passon.archive = passon.req.file.path;
                break;
            default:
                let message = 'Got unsupported mimetype: " ' + passon.req.file.mimetype +
                    '" in uploaded file:\n' + JSON.stringify(passon.req.file);
                let error = new Error(message);
                error.msg = 'extraction failed: ' + message;
                error.status = 500;
                debug(message);
                reject(error);
        }

        exec(cmd, (error, stdout, stderr) => {
            if (error || stderr) {
                debug(error, stderr, stdout);
                let errors = error.message.split(':');
                let message = errorMessageHelper(errors[errors.length - 1]);
                error.msg = 'extraction failed: ' + message;
                error.status = 500;
                reject(error);
            } else {
                passon.compendium_path = outputPath;
                debug('[%s] Unzip finished! Files stored in %s', passon.id, passon.compendium_path);
                fulfill(passon);
            }
        });
    });
}

function unzipLoad(passon) {
    return new Promise((fulfill, reject) => {
        debug('[%s] Unzip for load from share', passon.id);

        let outputPath = path.join(config.fs.compendium, passon.id);
        let cmd = '';

        if (passon.result.zipName && passon.result.bagitCount === 0) { //standard zip file contains all files directly and will be extracted to outputPath
            cmd = 'unzip -u ' + passon.archive + ' -d ' + outputPath;
        } else { //owncloud zip files have an additional parent directory, which will be stripped in next chained function
            cmd = 'unzip -u ' + passon.archive + ' -d ' + outputPath;
        }

        debug('[%s] Unzip command: %s', passon.id, cmd);
        exec(cmd, (error, stdout, stderr) => {
            if (error || stderr) {
                debug(error, stderr, stdout);
                let errors = error.message.split(':');
                let message = errorMessageHelper(errors[errors.length - 1]);
                error.msg = 'extraction failed: ' + message;
                error.status = 500;
                reject(error);
            } else {
                passon.compendium_path = outputPath;
                debug('[%s] Unzip finished! Files stored in %s', passon.id, passon.compendium_path);
                fulfill(passon);
            }
        });
    });
}

function stripSingleBasedir(passon) {
    return new Promise((fulfill, reject) => {
        debug('[%s] Starting basedir stripping...', passon.id);

        fs.readdir(passon.compendium_path, (err, files) => {
            if (err) {
                let errors = err.message.split(':');
                let message = errorMessageHelper(errors[errors.length - 1]);
                error.msg = 'extraction failed: ' + message;
                error.status = 500;
                reject(err);
                return;
            }

            if (files.length === 1 && fs.statSync(path.join(passon.compendium_path, files[0])).isDirectory()) {
                let stripDir = path.join(passon.compendium_path, files[0]);
                debug('[%s] Stripping single basedir "%s" in %s', passon.id, stripDir, passon.compendium_path);

                //fse.move(stripDir, passon.compendium_path);
                //fs.unlink(stripDir);

                let cmd = 'mv ' + stripDir + '/* ' + passon.compendium_path + ' && rm -r ' + stripDir;
                exec(cmd, (error, stdout, stderr) => {
                    if (error || stderr) {
                        debug(error, stderr, stdout);
                        let errors = error.message.split(':');
                        let message = errorMessageHelper(errors[errors.length - 1]);
                        error.msg = 'stripping base dir failed: ' + message;
                        error.status = 500;
                        reject(error);
                    } else {
                        debug('[%s] Stripping finished: %s', passon.id, stdout);
                        fulfill(passon);
                    }
                });
            } else {
                debug('[%s] Found %s files in compendium directory and not a single directory, nothing to strip', passon.id, files.length);
                fulfill(passon);
            }
        });
    });
}

function detectBag(passon) {
    return new Promise((fulfill) => {
        debug('[%s] Detecting bag', passon.id);

        let detectionFile = path.join(passon.compendium_path, config.bagit.detectionFileName);

        try {
            fs.accessSync(detectionFile);

            debug('[%s] Found %s - it\'s a bag!', passon.id, detectionFile);
            passon.isBag = true;
        } catch (err) {
            debug('[%s] Could not find bag detection file, NOT a bag: %s', passon.id, err);
            passon.isBag = false;
        }

        fulfill(passon);
    });
}

function detectCompendium(passon) {
    return new Promise((fulfill, reject) => {
        debug('[%s] Detecting compendium', passon.id);

        if (passon.isBag) {
            passon.configurationFile = path.join(passon.compendium_path, config.bagit.payloadDirectory, config.bagtainer.configFile.name);
        } else {
            passon.configurationFile = path.join(passon.compendium_path, config.bagtainer.configFile.name);
        }

        try {
            fs.accessSync(passon.configurationFile);

            debug('[%s] Found %s - it\'s a compendium! Content was labeled as "%s"', passon.id, passon.configurationFile, passon.content);
            passon.isCompendium = true;
            fulfill(passon);
        } catch (error) {
            if (passon.content === 'compendium') {
                debug('[%s] Could not find compendium configuration file but content is %s: %s', passon.id, passon.content, error);

                error.msg = 'content_type is ' + passon.content + ' but no compendium provided.';
                error.status = 400;
                reject(error);
            } else {
                debug('[%s] Could not find compendium detection file but content is "%s". All good.', passon.id, passon.content);
                fulfill(passon);
            }
        }
    });
}

function fetchCompendiumID(passon) {
    return new Promise((fulfill, reject) => {
        if (passon.isCompendium) {
            debug('[%s] Reading compendium ID from %s', passon.id, config.bagtainer.configFile.name);

            let compendiumID = null;

            // Get compendium yml, or throw exception on error
            try {
                let doc = yaml.safeLoad(fs.readFileSync(passon.configurationFile, 'utf8'));
                compendiumID = doc.id;
                debug('[%s] Successfully read compendium metadata: %O', passon.id, doc);

            } catch (error) {
                debug('[%s] Could not read compendium detection file %s: %s', passon.id, passon.configurationFile, error);
                error.msg = 'Could not read compendium detection file';
                error.status = 400;
                reject(error);
            }

            if (!compendiumID) {
                debug('[%s] No ID specified for compendium', passon.id);
                let message = 'No id found in compendium detection file';
                let error = new Error(message);
                error.msg = message;
                error.status = 400;
                reject(error);
            } else {
                // Validate compendium id
                if (config.bagtainer.id_regex.test(compendiumID)) {

                    // Check if id found in compendium file already exists
                    Compendium.findOne({ id: compendiumID }).select('id user').exec((err, compendium) => {
                        // eslint-disable-next-line no-eq-null, eqeqeq
                        if (err) {
                            debug('[%s] Error querying compendium with id %s', passon.id, compendiumID);
                            err.message = 'Error querying compendium';
                            err.status = 400;
                            reject(err);
                        }
                        if (compendium === null) {
                            debug('[%s] Assigned ID %s from configuration file to compendium', passon.id, compendiumID);
                            passon.uploadId = passon.id;
                            passon.id = compendiumID;
                            fulfill(passon);
                        } else {
                            debug('[%s] Compendium with ID %s already exists; user %s', passon.id, compendiumID, compendium.user);
                            let message = 'Error fetching ID from compendium, ID already exists';
                            let error = new Error(message);
                            error.msg = message;
                            error.status = 400;
                            reject(error);
                        }
                    });
                } else {
                    debug('[%s] Invalid ID %s specified for compendium in %s', passon.id, compendiumID, passon.configurationFile);
                    let message = 'Invalid id found in compendium detection file';
                    let error = new Error(message);
                    error.msg = message;
                    error.status = 400;
                    reject(error);
                }
            }
        } else {
            debug('[%s] Not a compendium, keeping generated ID', passon.id);
            fulfill(passon);
        }
    });
}

function moveCompendiumFiles(passon) {
    return new Promise((fulfill, reject) => {

        if (passon.isCompendium) {
            let updatedPath = path.join(config.fs.compendium, passon.id);
            debug('[%s] Copying compendium files from %s to %s due to ID specified in compendium file', passon.id, passon.compendium_path, updatedPath);

            fs.access(updatedPath, (err) => {
                if (!err) {
                    updatedPath_backup = updatedPath.replace(passon.id, passon.id + '_' + passon.uploadId);
                    debug('[%s] Directory %s already exists, backing up files to %s', passon.id, updatedPath, updatedPath_backup);

                    // not catching errors on next function to escalate if something goes wrong
                    fs.renameSync(updatedPath, updatedPath_backup);
                }

                let cmd = 'mv ' + passon.compendium_path + ' ' + updatedPath;
                debug('[%s] Executing %s', passon.id, cmd);
                exec(cmd, (error, stdout, stderr) => {
                    if (error || stderr) {
                        debug('Error copying compendium files: %O', { error, stderr, stdout });
                        debug(error, stderr, stdout);
                        let errors = error.message.split(':');
                        let message = errorMessageHelper(errors[errors.length - 1]);
                        error.msg = 'moving compendium files to new location failed: ' + message;
                        error.status = 500;
                        reject(error);
                    } else {
                        debug('[%s] Moving compendium files finished: %s', passon.id, stdout);
                        passon.compendium_path = updatedPath;
                        passon.configurationFile = path.join(passon.compendium_path, config.bagit.detectionFileName);
                        fulfill(passon);
                    }
                });
            });
        } else {
            debug('[%s] Not a compendium, files do not need to be moved', passon.id, );
            fulfill(passon);
        }

    });
}

function getTextFiles(passon) {
    return new Promise((fulfill, reject) => {
        debug('[%s] Getting text files', passon.id);
        //regular expression for text file types (.txt .r .rmd .text .json .yml .yaml ..)
        let textFileRegex = new RegExp(config.encoding.textFileRegex, 'i');
        passon.textFiles = [];

        //ignore text files
        function ignoreFunc(file, stats) {
            return !stats.isDirectory() && !textFileRegex.test(path.extname(file));
        }

        //recursively iterate through path and collect file names
        recursiveReaddir(passon.compendium_path, [ignoreFunc], function (err, files) {
            if (err) {
                debug('[%s] Error reading text files: %s', passon.id, err.message);
                reject(err);
            }
            debug('[%s] Found %s text files.', passon.id, files.length);
            passon.textFiles = files;
            fulfill(passon);
        });
    });
}

function checkEncoding(passon) {
    return new Promise((fulfill, reject) => {
        debug('[%s] Checking file encoding', passon.id);
        let invalidFiles = [];

        for (let i = 0; i < passon.textFiles.length; i++) {
            let element = passon.textFiles[i];
            const fileBuffer = fs.readFileSync(element);
            const charsetMatch = detectCharacterEncoding(fileBuffer);
            debug('[%s] File %s has encoding %s with confidence %s', passon.id, element, charsetMatch.encoding, charsetMatch.confidence);

            // If encoding type is not supported
            if (config.encoding.supportedEncodings.indexOf(charsetMatch.encoding) === -1) {
                // rewrite file path:
                let splitPath = element.split('/compendium/');
                let shortFilePath = splitPath[splitPath.length - 1];
                invalidFiles.push({ file: shortFilePath, encoding: charsetMatch.encoding });
            }
        }

        if (invalidFiles.length !== 0) {
            debug('[%s] Unsupported encoding found in file(s) %o!', passon.id, invalidFiles);
            let err = new Error('unsupported encoding');
            err.status = 422;
            err.msg = {};
            err.msg.message = 'Files with unsupported encoding detected. Only UTF-8 is supported.';
            err.msg.files = invalidFiles;
            reject(err);
        } else {
            debug('[%s] All text files passed encoding check.', passon.id);
            fulfill(passon);
        }

    });
}

function extractMetadata(passon) {
    return new Promise((fulfill, reject) => {
        debug('[%s] Extracting metadata: %s', passon.id, util.inspect(passon, { depth: 1, colors: true }));

        // handle bag vs. workspace case
        let metaextract_input_dir = passon.compendium_path;
        if (passon.isBag) {
            metaextract_input_dir = path.join(metaextract_input_dir, config.bagit.payloadDirectory);
        }
        let metaextract_output_dir = path.join(metaextract_input_dir, config.meta.extract.outputDir);
        debug('[%s] Input dir: %s | Output dir: %s', passon.id, metaextract_input_dir, metaextract_output_dir);

        // create output dir to avoid later issues with access rights
        // (if directory is created a a side effect of the Bind below it belongs to root)
        try {
            fse.mkdirSync(metaextract_output_dir);
            debug('[%s] Created output dir: %s', passon.id, metaextract_output_dir);
        } catch (e) {
            debug('[%s] error creating metadata output directory at %s: %s', passon.id, metaextract_output_dir, e);
        }

        let binds = [
            metaextract_input_dir + ':' + metaextract_input_dir,
            metaextract_output_dir + ':' + metaextract_output_dir
        ];
        if (config.fs.volume) {
            debug('[%s] volume is configured, overwriting binds configuration (was %o)', passon.id, binds);
            // passon.compendium_path always starts with config.fs.base
            binds = [
                config.fs.volume + ':' + config.fs.base
            ];
        }
        debug('[%s] Binds: %o', passon.id, binds);

        // run metadata extraction container
        let create_options = Object.assign(
            config.meta.container.default_create_options,
            {
                name: 'meta_extract_' + passon.id,
                HostConfig: {
                    Binds: binds,
                    AutoRemove: config.meta.container.rm
                }
            }
        );
        let start_options = {};
        let cmd = [
            '-debug',
            config.meta.extract.module,
            '--inputdir', metaextract_input_dir,
            '--outputdir', metaextract_output_dir,
            '--metafiles', // save all raw files
            '--ercid', passon.id,
            '--basedir', passon.compendium_path
        ];
        if (config.meta.extract.stayOffline) {
            cmd.push('--stayoffline');
        }
        debug('[%s] Starting Docker container now with options and command:\n\tcreate_options: %s\n\tstart_options: %s\n\tcmd: %s',
            passon.id, JSON.stringify(create_options), JSON.stringify(start_options), cmd.join(' '));

        // create stream for logging container output
        let containerLogStream = Stream.Writable();
        containerLogStream._write = function (chunk, enc, next) {
            debug('[%s] [extract container] %s', passon.id, Buffer.from(chunk).toString().trim());
            next();
        };

        docker.run(config.meta.container.image, cmd, containerLogStream, create_options, start_options, (err, data, container) => {
            debug('[%s] container running: %s', passon.id, container);
            if (err) {
                reject(err);
            } else {
                if (data.StatusCode === 0) {
                    debug('[%s] Completed metadata extraction: %O', passon.id, data);
                    // check if metadata was found, if so put the metadata directory into passon
                    try {
                        fs.readdir(metaextract_output_dir, (err, files) => {
                            if (err) {
                                debug('[%s] Error reading metadata directory %s [fail the upload? %s]:\n\t%s', passon.id,
                                    metaextract_output_dir,
                                    config.meta.extract.failOnNoMetadata, err);
                                if (config.meta.extract.failOnNoMetadata) {
                                    reject(err);
                                } else {
                                    debug('[%s] Continuing with empty metadata (A) ...', passon.id);
                                    fulfill(passon);
                                }
                            } else if (files.length < 1) {
                                debug('[%s] Metadata extraction directory %s is empty. Fail the upload? %s', passon.id,
                                    metaextract_output_dir,
                                    config.meta.extract.failOnNoMetadata);
                                if (config.meta.extract.failOnNoMetadata) {
                                    reject(new Error('No files in the metadata directory'));
                                } else {
                                    debug('[%s] Continuing with empty metadata (B) ...', passon.id);
                                    fulfill(passon);
                                }
                            } else {
                                debug('[%s] Finished metadata extraction and created %s metadata files in %s: %s', passon.id,
                                    files.length, metaextract_output_dir, JSON.stringify(files));
                                passon.metadata_dir = metaextract_output_dir;
                                passon.metadata_file = path.join(passon.metadata_dir, config.meta.extract.bestCandidateFile);
                                fulfill(passon);
                            }
                        });
                    } catch (err) {
                        debug('[%s] error reading metadata directory: %s', passon.id, err.message);
                        reject(err);
                    }
                } else {
                    debug('[%s] Error during meta container run: %o', passon.id, data);
                    container.logs({
                        follow: true,
                        stdout: true,
                        stderr: true,
                        timestamps: true
                    }, function (err, stream) {
                        if (err)
                            debug('[%s] Error getting container logs after non-zero status code', passon.id);
                        else {
                            stream.on('data', function (data) {
                                debug('[%s] container logs      ', passon.id, Buffer.from(data).toString().trim());
                            });
                        }
                    });

                    reject(new Error('Received non-zero statuscode from container'));
                }
            }
        });
    });
}

function loadMetadata(passon) {
    return new Promise((fulfill, reject) => {
        if (passon.metadata_dir) {
            debug('[%s] Loading metadata from %s', passon.id, passon.metadata_file);

            fs.readFile(passon.metadata_file, (err, data) => {
                if (err) {
                    debug('[%s] Error reading metadata file: %s [fail? %s]', passon.id, err.message,
                        config.meta.extract.failOnNoMetadata);
                    if (config.meta.extract.failOnNoMetadata) {
                        reject(new Error('no metadata found in the metadata extraction directory'));
                    } else {
                        debug('[%s] Continuing with empty metadata (C) ...', passon.id);
                        fulfill(passon);
                    }
                } else {
                    passon.metadata = {};
                    passon.metadata.raw = JSON.parse(data);
                    passon.metadata.raw.source = passon.shareURL;
                    debug('[%s] Finished metadata loading!', passon.id);
                    fulfill(passon);
                }
            });
        } else {
            debug('[%s] Cannot load metadata, metadata_dir is not available in passon', passon.id);
            if (config.meta.extract.failOnNoMetadata) {
                reject(new Error('no metadata directory provided by previous steps'));
            } else {
                debug('[%s] Continuing with empty metadata (D) ...', passon.id);
                fulfill(passon);
            }
        }
    });
}

function brokerMetadata(passon) {
    return new Promise((fulfill, reject) => {
        debug('[%s] Brokering metadata', passon.id);

        if (passon.metadata) {
            if (passon.metadata.raw) {
                Promise.all([
                    meta.broker(passon.id, passon.metadata_dir, passon.metadata_file, 'o2r')
                ])
                    .then((results) => {
                        debug('[%s] Completed brokerings: %s', passon.id, results
                            .filter(obj => { return !obj.error })
                            .map(obj => { return obj.name; }).join(', '));
                        debug('[%s] FAILED brokerings: %s', passon.id, results
                            .filter(obj => { return obj.error })
                            .map(obj => { return obj.name; }).join(', '));

                        results.filter(obj => { return !obj.error }).map((current) => {
                            objectPath.set(passon.metadata,
                                current.target,
                                current.result);
                        });

                        fulfill(passon);
                    })
                    .catch(err => {
                        debug('[%s] error during brokering: %s', passon.id, err);
                        reject(err);
                    });
            } else {
                debug('[%s] No _raw_ metadata provided that could be brokered!', passon.id);
                fulfill(passon);
            }
        } else {
            debug('[%s] No metadata provided that could be brokered!', passon.id);
            fulfill(passon);
        }
    });
}

function save(passon) {
    return new Promise((fulfill, reject) => {
        debug('[%s] Saving...', passon.id);
        var compendium = new Compendium({
            id: passon.id,
            user: passon.user,
            metadata: passon.metadata,
            candidate: true,
            bag: passon.isBag,
            compendium: passon.isCompendium
        });

        compendium.save(error => {
            if (error) {
                debug('[%s] ERROR saving new compendium:', passon.id, error);
                error.msg = 'Error saving new compendium';
                error.status = 500;
                reject(error);
            } else {
                debug('[%s] Saved new compendium', passon.id);
                fulfill(passon);
            }
        });
    });
}

function cleanup(passon) {
    return new Promise((fulfill, reject) => {
        debug('[%s] Cleaning up after upload', passon.id);

        Promise.all([
            new Promise((fulfill, reject) => {
                if (!config.fs.keepIncomingArchive) {
                    if (passon.archive) {
                        fs.unlink(passon.archive, err => {
                            if (err)
                                debug('[%s] Error deleting archive file: %s', err);
                            else
                                debug('[%s] Deleted archive file %s', passon.id, passon.archive);

                            fulfill();
                        });
                    }
                }
            })
        ]).then((results) => {
            debug('[%s] Finished cleanup: %o', passon.id, results);
            fulfill(passon);
        });
    });
}

module.exports = {
    unzipUpload: unzipUpload,
    unzipLoad: unzipLoad,
    stripSingleBasedir: stripSingleBasedir,
    detectBag: detectBag,
    detectCompendium: detectCompendium,
    getTextFiles: getTextFiles,
    checkEncoding: checkEncoding,
    fetchCompendiumID: fetchCompendiumID,
    moveCompendiumFiles: moveCompendiumFiles,
    extractMetadata: extractMetadata,
    loadMetadata: loadMetadata,
    brokerMetadata: brokerMetadata,
    save: save,
    cleanup: cleanup,
    publicShareLoad: publicShareLoad,
    zenodoLoad: zenodoLoad,
    checkZenodoContents: checkZenodoContents,
    checkAndLoadFiles: checkAndLoadFiles
};
