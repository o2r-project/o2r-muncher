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


const config = require('../config/config');
const debug = require('debug')('substituter');
const path = require('path');
const fse = require('fs-extra');
const yaml = require('js-yaml');
const writeYaml = require('write-yaml');

var Compendium = require('../lib/model/compendium');

/**
 * function to get metadata of base compendium
 * @param {object} passon - new compendium id and data of origin compendia
 */
function checkBase(passon) {
    return new Promise((fulfill, reject) => {
        debug('[%s] Requesting metadata of base compendium with id - %s ...', passon.id, passon.metadata.substitution.base);
        try {
            Compendium.findOne({ id: passon.metadata.substitution.base })
                .select('id metadata bag').exec((err, compendium) => {
                    if (err) {
                        debug('[%s] Error requesting metadata of base compendium.', passon.id);
                        err.status = 400;
                        err.msg = 'base ID is invalid';
                        reject(err);
                    } else {
                        if (!compendium || compendium == null) {
                            debug('[%s] Error requesting metadata of base compendium.', passon.id);
                            let err = new Error();
                            err.status = 400;
                            err.msg = 'base ID is invalid';
                            reject(err);
                        } else {
                            debug('[%s] Requesting metadata of base compendium with id - %s - successful.', passon.id, passon.metadata.substitution.base);

                            passon.baseMetaData = compendium.metadata;
                            passon.bag = compendium.bag;
                            passon.basePath = path.join(config.fs.compendium, passon.metadata.substitution.base);

                            fulfill(passon);
                        }
                    }
                });
        } catch (err) {
            debug('[%s] Error requesting metadata of base Compendium.', passon.id);
            err.status = 400;
            err.msg = 'base ID is invalid';
            reject(err);
        }
    })
}

/**
 * function to check if overlay compendium exists
 * @param {object} passon - new compendium id and data of origin compendia
 */
function checkOverlay(passon) {
    return new Promise((fulfill, reject) => {
        debug('[%s] Checking overlay compendium with id - %s ...', passon.id, passon.metadata.substitution.overlay);
        try {
            Compendium.findOne({ id: passon.metadata.substitution.overlay })
                .select('id bag').exec((err, compendium) => {
                    if (err) {
                        debug('[%s] Error checking id of overlay Compendium.', passon.id);
                        err.status = 400;
                        err.msg = 'overlay ID is invalid';
                        reject(err);
                    } else {
                        if (!compendium || compendium == null) {
                            debug('[%s] Error getting overlay compendium with id %s', passon.id, passon.metadata.substitution.overlay);
                            let err = new Error();
                            err.status = 400;
                            err.msg = 'overlay ID is invalid';
                            reject(err);
                        } else {
                            debug('[%s] Checking metadata of overlay compendium with id - %s - successful.', passon.id, passon.metadata.substitution.overlay);

                            passon.overlay = {};
                            passon.overlay.bag = compendium.bag;
                            passon.overlayPath = path.join(config.fs.compendium, passon.metadata.substitution.overlay);

                            fulfill(passon);
                        }
                    }
                });
        } catch (err) {
            debug('[%s] Error checking id of overlay Compendium.', passon.id);
            err.status = 400;
            err.msg = 'overlay ID is invalid';
            reject(err);
        }
    })
}

/**
 * function to check if provided base and overlay files exist
 * @param {object} passon
 */
function checkSubstitutionFiles(passon) {
    debug('[%s] Checking substitution files...', passon.id);
    return new Promise((fulfill, reject) => {
        let substFiles = passon.metadata.substitution.substitutionFiles;

        // check if array substitutionFiles exists and has data
        if (substFiles && Array.isArray(substFiles) && substFiles.length > 0) {
            for (var i = 0; i < substFiles.length; ++i) { // use a normal for loop so we can use break;
                debug('[%s] Checking substitution: %s', passon.id, JSON.stringify(substFiles[i]));

                if (!isNonEmptyString(substFiles[i].base)) {
                    debug('[%s] Base file is not valid: %s', passon.id, substFiles[i].base);
                    cleanup(passon);
                    let err = new Error();
                    err.status = 400;
                    err.msg = 'base file is undefined';
                    reject(err);
                    break;
                }

                if (!isNonEmptyString(substFiles[i].overlay)) {
                    debug('[%s] Overlay file is not valid: %s', passon.id, substFiles[i].overlay);
                    cleanup(passon);
                    let err = new Error();
                    err.status = 400;
                    err.msg = 'overlay file is undefined';
                    reject(err);
                    break;
                }

                let baseFileFullPath = path.join(passon.basePath, substFiles[i].base);
                let overlayFileFullPath = path.join(passon.overlayPath, substFiles[i].overlay);

                if (!fse.existsSync(baseFileFullPath)) {
                    debug('[%s] Base file %s does not exist', passon.id, baseFileFullPath);
                    let err = new Error();
                    cleanup(passon);
                    err.status = 400;
                    err.msg = 'base file "' + substFiles[i].base + '" does not exist';
                    reject(err);
                    break;
                }

                if (!fse.existsSync(overlayFileFullPath)) {
                    debug('[%s] Overlay file %s does not exist', passon.id, overlayFileFullPath);
                    cleanup(passon);
                    let err = new Error();
                    err.status = 400;
                    err.msg = 'overlay file "' + substFiles[i].overlay + '" does not exist';
                    reject(err);
                    break;
                }
            }

            fulfill(passon);
        } else {
            debug('[%s] substitutionFiles is not defined in %s', passon.id, JSON.stringify(passon.metadata.substitution));
            cleanup(passon);
            let err = new Error();
            err.status = 400;
            err.msg = 'substitution files missing';
            reject(err);
        }
    });
}

/**
 * function to create folder for new compendium
 * @param {object} passon - new compendium id and data of origin compendia
 */
function createFolder(passon) {
    return new Promise((fulfill, reject) => {
        var outputPath = path.join(config.fs.compendium, passon.id);
        debug('[%s] Creating folder for new compendium ...', passon.id);
        try {
            fse.mkdirsSync(outputPath);
            debug('[%s] Created folder for new compendium in: \n # %s\n', passon.id, outputPath);
            passon.substitutedPath = outputPath;
            debug("[%s] basePath: [%s], overlayPath: [%s], substitutedPath: [%s]", passon.id, passon.basePath, passon.overlayPath, passon.substitutedPath);
            fulfill(passon);
        } catch (err) {
            debug('[%s] Error creating directory for new compendium - err:\n%s', passon.id, err);
            reject(err);
        }
    });
}

/**
 * function to copy base files for new compendium, stripping the bag if it exists
 * @param {object} passon - new compendium id and data of origin compendia
 */
function copyBaseFiles(passon) {
    debug('[%s] Copying base files ...', passon.id);
    return new Promise((fulfill, reject) => {
        let substFiles = passon.metadata.substitution.substitutionFiles;

        // if compendium is a bag, copy only the payload
        let copyBasePath = passon.basePath;
        if (passon.bag) {
            copyBasePath = path.join(passon.basePath, 'data');
        }

        try {
            debug('[%s] Copy base files from %s to %s', passon.id, copyBasePath, passon.substitutedPath);
            fse.copySync(copyBasePath, passon.substitutedPath);
            debug('[%s] Finished copy base files', passon.id);
            fulfill(passon);
        } catch (err) {
            debug('[%s] Error copying base files to directory of new compendium: %s', passon.id, err);
            cleanup(passon);
            err.status = 400;
            err.msg = 'could not copy base files - base path does not exist';
            reject(err);
        }
    });
}

/**
 * function to copy overlay files for new compendium
 * @param {object} passon - new compendium id and data of origin compendia
 */
function copyOverlayFiles(passon) {
    return new Promise((fulfill, reject) => {
        let substFiles = passon.metadata.substitution.substitutionFiles;
        debug('[%s] Copying %s overlay files ...', passon.id, substFiles.length);

        try {
            for (var i = 0; i <= substFiles.length; i++) {
                if (i == substFiles.length) {
                    // execute only if the last file is mounted
                    debug('[%s] Finished copy overlay files.', passon.id);
                    fulfill(passon);
                } else {
                    overlayFileSource = path.join(passon.overlayPath, substFiles[i].overlay);
                    overlayFileDestination = path.join(passon.substitutedPath, path.basename(overlayFileSource)); // always copy overlay files to the base directory

                    try {
                        if (fse.existsSync(overlayFileDestination)) {
                            prefixedFileName = config.substitutionFilePrepend + path.basename(overlayFileDestination);
                            prefixedOverlayFileDestination = path.join(passon.substitutedPath, prefixedFileName);

                            // add prefix until the destination file name does not exist
                            while (fse.existsSync(prefixedOverlayFileDestination)) {
                                prefixedFileName = config.substitutionFilePrepend + prefixedFileName;
                                prefixedOverlayFileDestination = path.join(passon.substitutedPath, prefixedFileName);
                            }
                            fse.copySync(overlayFileSource, prefixedOverlayFileDestination);
                            substFiles[i].filename = prefixedFileName; // update substitution metadata
                            debug('[%s] copied file #%s: %s to %s', passon.id, (i + 1), overlayFileSource, prefixedOverlayFileDestination);
                        } else {
                            fse.copySync(overlayFileSource, overlayFileDestination);
                            substFiles[i].filename = path.basename(overlayFileDestination);
                            debug('[%s] copied file #%s: %s to %s', passon.id, (i + 1), overlayFileSource, overlayFileDestination);
                        }
                    } catch (err) {
                        debug('[%s] Error copying overlay files to directory of new compendium: %s', passon.id, err);
                        cleanup(passon);
                        err.status = 400;
                        err.msg = 'overlay file "' + substFiles[i].overlay + '" does not exist';
                        reject(err);
                    }
                } // end copying files
            } // end for
        } catch (err) {
            debug('[%s] Error copying overlay files to directory of new compendium: %s', passon.id, err);
            cleanup(passon);
            err.status = 400;
            err.msg = 'Error copying overlay files to directory of new compendium.';
            reject(err);
        }
    });
}

/**
 * function to update substituted compendium metadata that have been copied from base compendium
 * @param {object} passon - compendium id and data of compendia
 */
function updateMetadata(passon) {
    return new Promise((fulfill, reject) => {
        debug('[%s] metadata handling is set to: %s', passon.id, passon.metadata.substitution.metadataHandling);
        if (passon.metadata.substitution.metadataHandling == "keepBase") {
            try {
                debug('[%s] Updating paths in metadata ...', passon.id);
                let pathsArray = config.substitution.meta.updatePath;
                let updatedJSON = passon.baseMetaData;
                for (let i = 0; i < pathsArray.length; i++) {
                    debug('[#%s] update path in metadata at [%s] (is bag? %s)', i + 1, updatedJSON.o2r[pathsArray[i]], passon.bag);
                    let stringified = JSON.stringify(updatedJSON.o2r[pathsArray[i]]);
                    if (passon.bag && stringified.indexOf('data/') >= 0) { // delete "data/" if base compendium is a bag
                        stringified = stringified.replace('data/', '');
                    }
                    if (stringified.indexOf(passon.metadata.substitution.base) >= 0) {
                        stringified = stringified.replace(passon.metadata.substitution.base, passon.id);
                    }
                    updatedJSON.o2r[pathsArray[i]] = JSON.parse(stringified);
                }

                passon.baseMetaData = updatedJSON;
                fulfill(passon);
            } catch (err) {
                debug('[%s] Error updating path in metadata: %o', passon.id, err);
                cleanup(passon);
                reject(err);
            }
        }
    })
};

/**
 * function to save new compendium to mongodb
 * @param {object} passon - new compendium id and data of origin compendia
 */
function saveToDB(passon) {
    return new Promise((fulfill, reject) => {
        debug('[%s] Saving new compendium ...', passon.id);
        var metadataToSave = {};
        metadataToSave = passon.baseMetaData.o2r;
        var compendium = new Compendium({
            id: passon.id,
            user: passon.user,
            metadata: {
                substitution: passon.metadata.substitution,
                o2r: metadataToSave
            },
            bag: config.substitution.meta.bag,
            candidate: config.substitution.meta.candidate,
            compendium: config.substitution.meta.compendium,
            substituted: passon.metadata.substituted
        });

        compendium.save(error => {
            if (error) {
                debug('[%s] ERROR saving new compendium for user: %s', passon.id, passon.user);
                cleanup(passon);
                error.msg = JSON.stringify({ error: 'internal error' });
                error.status = 500;
                reject(error);
            } else {
                debug('[%s] Saved new compendium for user: %s.', passon.id, passon.user);
                fulfill(passon);
            }
        });
    });
}

/**
 * function to create new execution command
 * @param {object} passon - compendium id and data of compendia
 */
function createVolumeBinds(passon) {
    return new Promise((fulfill, reject) => {
        try {
            debug('[%s] Starting creating volume binds ...', passon.id);
            passon.imageTag = config.bagtainer.image.prefix.compendium + passon.id;
            if (!passon.imageTag) {
                debug('[%s] image tag was not passed.', passon.id);
                cleanup(passon);
                reject(new Error('image tag was not passed on!'));
            }

            debug('[%s] Starting creating volume binds with image [%s] ...', passon.id, passon.imageTag);
            let substFiles = passon.metadata.substitution.substitutionFiles;
            // data folder with configuration file
            let baseBind = config.substitution.docker.volume.basePath + ":" + config.bagtainer.mountLocationInContainer;

            // https://docs.docker.com/engine/admin/volumes/bind-mounts/
            let volumes = [];
            let baseVolume = config.substitution.docker.volume.flag + baseBind;
            volumes.push(baseVolume);

            let bind_mounts = [];

            for (let i = 0; i < substFiles.length; i++) {
                let baseFileName = substFiles[i].base;
                if (passon.bag) {
                    let splitCompBag = baseFileName.indexOf("/") + 1;    // split after ".../<compendium id>/data/" to get only filenamePath of basefile
                    baseFileName = baseFileName.substring(splitCompBag);
                }

                if (!isNonEmptyString(substFiles[i].filename)) {
                    reject(new Error('substitution filename has not been passed correctly.'));
                    return;
                }

                // --volume mounts as string
                let volumeParameterString = config.substitution.docker.volume.flag
                    + path.join(config.substitution.docker.volume.basePath, substFiles[i].filename)
                    + ":"
                    + path.join(config.bagtainer.mountLocationInContainer, baseFileName)
                    + config.substitution.docker.volume.mode;
                volumes.push(volumeParameterString);

                // --mount bind mounts as data structure
                let mount = {
                    source: substFiles[i].filename,
                    destination: path.join(config.bagtainer.mountLocationInContainer, baseFileName)
                };
                bind_mounts.push(mount);
            }

            passon.execution = {};
            passon.execution.volumes = volumes;
            passon.execution.bind_mounts = bind_mounts;

            debug('[%s] Finished creating volumes and mounts: \n%s', passon.id, JSON.stringify(passon.execution));
            fulfill(passon);
        } catch (err) {
            debug('[%s] Error during creating volume binds with err:\n%s', passon.id, err);
            cleanup(passon);
            reject(new Error('volume binds were not passed!'));
        }
    });
}

/**
 * function for cleanup after error is detected
 * @param {object} passon - compendium id and data of compendia
 */
function cleanup(passon) {
    debug('[%s] Cleaning up ...', passon.id);
    try {
        debug('[%s] Cleanup running ...', passon.id);
        let cleanupPath = passon.substitutedPath;
        fse.removeSync(cleanupPath);
        debug('[%s] Finished cleanup.', passon.id);
    } catch (err) {
        debug('[%s] Cleanup not successful: %s', passon.id, err);
    }
};

/**
 * function to read configuration file and overwrite with execution command for "docker run"
 * @param {object} passon - compendium id and data of compendia
 */
function updateCompendiumConfiguration(passon) {
    return new Promise((fulfill, reject) => {
        debug('[%s] Starting write yaml ...', passon.id);
        let yamlPath = path.join(passon.substitutedPath, config.bagtainer.configFile.name);
        // check if configuration file exists
        if (fse.existsSync(yamlPath)) {
            try {
                let dockerCmd = config.substitution.docker.cmd;
                passon.execution.volumes.forEach(vol => {
                    dockerCmd += " " + vol;
                });

                let doc = yaml.safeLoad(fse.readFileSync(yamlPath, 'utf8'));
                debug('[%s] Old configuration file (%s):\n%O', passon.id, yamlPath, doc);

                // update id
                doc.id = passon.id;

                // add execution property
                if (!doc.execution) {
                    doc.execution = {};
                }
                doc.execution.cmd = "'" + dockerCmd + " " + passon.imageTag + "'";
                doc.execution.bind_mounts = passon.execution.bind_mounts;
                writeYaml(yamlPath, doc, function (err) {
                    if (err) {
                        debug("[%s] Error writing configuration file to '%s', error: %o", passon.id, yamlPath, err);
                        cleanup(passon);
                        reject("Error writing configuration file to %s", yamlPath);
                    } else {
                        debug('[%s] New configuration file (%s):\n%s', passon.id, yamlPath, yaml.dump(doc));
                        fulfill(passon);
                    }
                });
            } catch (err) {
                debug("[%s] Error writing configuration file: %o", passon.id, err);
                cleanup(passon);
                reject("Error writing configuration file to %s", yamlPath);
            }
        } else {
            debug("[%s] missing configuration file in base compendium, returning error", passon.id);
            cleanup(passon);
            var err = new Error();
            err.status = 400;
            err.msg = 'missing configuration file in base compendium, please execute a job for the base compendium first';
            reject(err);
        }
    })
};

/**
 * function to check string is defined and not empty
 */
function isNonEmptyString(s) {
    if (s == undefined || typeof (s) != 'string' || s == '') {
        return false;
    } else {
        return true;
    }
};

module.exports = {
    checkBase: checkBase,
    checkOverlay: checkOverlay,
    checkSubstitutionFiles: checkSubstitutionFiles,
    createFolder: createFolder,
    copyBaseFiles: copyBaseFiles,
    copyOverlayFiles: copyOverlayFiles,
    saveToDB: saveToDB,
    createVolumeBinds: createVolumeBinds,
    cleanup: cleanup,
    updateCompendiumConfiguration: updateCompendiumConfiguration,
    updateMetadata: updateMetadata
};
