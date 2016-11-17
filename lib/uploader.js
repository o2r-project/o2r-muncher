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

var config = require('../config/config');
var debugUpload = require('debug')('uploader');
var exec = require('child_process').exec;
var errorMessageHelper = require('../lib/error-message');

var Compendium = require('../lib/model/compendium');

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
        debugUpload('Handling upload of %s for user %s', this.req.file.filename, this.req.user.orcid);

        return this.unzip({
            id: req.file.filename,
            user: this.req.user.orcid,
            req: this.req,
            res: this.res
        }).then(this.extractMetadata)
            //.then(this.updateMetadataWithCleverBrokerAndSchema)
            .then(this.save)
            .then(this.respond)
            .then((passon) => {
                done(passon.id);
            })
            .catch(err => {
                debugUpload("[%s] Unhandled failure (or rejection) during execute: \n\t%s", this.jobId, err);
                res.status(500).send(JSON.stringify({ error: 'internal error' }));
            });
    }

    this.unzip = (passon) => {
        return new Promise((fulfill, reject) => {
            debugUpload('Unzipping %s', passon.id);

            var path = config.fs.compendium + passon.id;
            var cmd = '';
            switch (passon.req.file.mimetype) {
                case 'application/zip':
                    cmd = 'unzip -uq ' + passon.req.file.path + ' -d ' + path;
                    if (config.fs.delete_inc) { // should incoming files be deleted after extraction?
                        cmd += ' && rm ' + passon.req.file.path;
                    }
                    break;
                default:
                    cmd = 'false';
            }

            debugUpload('Unzipping command "%s"', cmd);
            exec(cmd, (error, stdout, stderr) => {
                if (error || stderr) {
                    debugUpload(error, stderr, stdout);
                    let errors = error.message.split(':');
                    let message = errorMessageHelper(errors[errors.length - 1]);
                    passon.res.status(500).send(JSON.stringify({ error: 'extraction failed: ' + message }));
                    reject(error);
                } else {
                    passon.path = path;
                    debugUpload('Unzip of %s complete!', passon.id);
                    fulfill(passon);
                }
            });
        });
    };

    this.extractMetadata = (passon) => {
        return new Promise((fulfill, reject) => {
            debugUpload('Extracting metadata from %s', passon.id);

            // ...
            passon.metadata = { only: 'a test' };

            fulfill(passon);
        });
    }

    this.save = (passon) => {
        return new Promise((fulfill, reject) => {
            debugUpload('Saving %s', passon.id);
            var compendium = new Compendium({
                id: passon.id,
                user: passon.user,
                metadata: passon.metadata
            });

            compendium.save(err => {
                if (err) {
                    debugUpload('ERROR saving new compendium %s', passon.id);
                    passon.res.status(500).send(JSON.stringify({ error: 'internal error' }));
                    reject(err);
                } else {
                    debugUpload('Saved new compendium %s', passon.id);
                    fulfill(passon);
                }
            });
        });
    }

    this.respond = (passon) => {
        return new Promise((fulfill) => {
            passon.res.status(200).send({ id: passon.id });
            debugUpload('New compendium %s', passon.id);
            fulfill(passon);
        });
    }
}

module.exports.Uploader = Uploader;
