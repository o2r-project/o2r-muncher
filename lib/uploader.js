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

const debug = require('debug')('muncher:load:uploader');
const validateBag = require('../lib/bagit').validateBagAlt;
const steps = require('../lib/steps');
const util = require('util');

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
        debug('Handling direct upload of %s for user %s', this.req.file.filename, this.req.user.orcid);

        let passon = {
            id: req.file.filename,
            user: this.req.user.orcid,
            content: req.body.content_type,
            req: this.req,
            res: this.res
        };

        return steps.unzipUpload(passon)
            .then(steps.stripSingleBasedir)
            .then(steps.getTextFiles)
            .then(steps.checkEncoding)
            .then(steps.detectBag)
            .then(validateBag)
            .then(steps.detectCompendium)
            .then(steps.fetchCompendiumID)
            .then(steps.moveCompendiumFiles)
            .then(steps.extractMetadata)
            .then(steps.loadMetadata)
            .then(steps.brokerMetadata)
            .then(steps.save)
            .then(steps.cleanup)
            .then(this.respond)
            .then((passon) => {
                debug('[%s] completed upload:\n%s', passon.id, util.inspect(passon, { depth: 1, colors: true }));
                done(passon.id, null);
            })
            .catch(err => {
                debug('[%s] Rejection or unhandled failure during upload: %o', passon.id, err);
                debug('[%s] Passon object:\n%s', util.inspect(passon, { depth: 1, colors: true }));
                let status = 500;
                if (err.status) {
                    status = err.status;
                }
                let msg = 'Unknown error';
                if (err.msg) {
                    msg = err.msg;
                }
                res.status(status).send({ error: msg });
                done(passon.id, err);
            });
    };

    this.respond = (passon) => {
        return new Promise((fulfill) => {
            passon.res.status(200).send({ id: passon.id });
            debug('New compendium %s', passon.id);
            fulfill(passon);
        });
    }
}

module.exports.Uploader = Uploader;
