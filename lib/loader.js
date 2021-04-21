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

var config = require('../config/config');
const debug = require('debug')('muncher:load:loader');
const steps = require('../lib/steps');
const validateBag = require('../lib/bagit').validateBagAlt;
const randomstring = require('randomstring');

/**
 * Create Loader to handle given request and response
 * @constructor
 * @param {object} request - The load request
 * @param {object} response - The response; returns the id of the compendium if successful or an error otherwise
 */
function Loader(req, res) {
    this.req = req;
    this.res = res;

    this.loadOwncloud = (done) => {
        let id = randomstring.generate(config.id_length);
        debug('[%s] Handling public share load from "%s" for user %s', id, this.req.body.share_url, this.req.user.orcid);

        let passon = {
            id: id,
            content: req.body.content_type,
            shareURL: encodeURI(this.req.body.share_url),
            webdav_path: this.req.body.path,
            zipFile : this.req.zipFile,
            user: this.req.user.orcid,
            req: this.req,
            res: this.res
        };

        return steps.publicShareLoad(passon)
            .then(steps.unzipLoad)
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
                debug('[%s] completed load', passon.id);
                done({ id: passon.id, share_url: passon.shareURL }, null);
            })
            .catch(err => {
                debug('Rejection or unhandled failure during load from public share: %o\n%s', err, err);
                let status = 500;
                if (err.status) {
                    status = err.status;
                }
                let msg = 'Unknown error';
                if (err.msg) {
                    msg = err.msg;
                }
                done(null, err);
                res.status(status).send({ error: msg });
            });
    };

    this.loadZenodo = (done) => {
        debug('Handling zenodo load from "%s" for user %s', this.req.body.zenodoURL, this.req.user.orcid);

        let passon = {
            id: randomstring.generate(config.id_length),
            content: req.body.content_type,
            zenodoURL: encodeURI(this.req.body.share_url),
            zenodoID: this.req.params.zenodoID,
            baseURL: this.req.params.baseURL,
            filename: this.req.body.filename,
            user: this.req.user.orcid,
            req: this.req,
            res: this.res
        };

        return steps.checkZenodoContents(passon)
            .then(steps.zenodoLoad)
            .then(steps.unzipLoad)
            .then(steps.detectBag)
            .then(steps.getTextFiles)
            .then(steps.checkEncoding)
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
                debug('[%s] completed zenodo load', passon.id);
                done({ id: passon.id, share_url: passon.zenodoURL }, null);
            })
            .catch(err => {
                debug('Rejection or unhandled failure during load from zenodo: %o\n%s', err, err);
                let status = 500;
                if (err.status) {
                    status = err.status;
                }
                let msg = 'Unknown error';
                if (err.msg) {
                    msg = err.msg;
                }
                res.status(status).send({ error: msg });
                done(null, err);
            });
    };

    this.respond = (passon) => {
        return new Promise((fulfill) => {
            passon.res.status(200).send({ id: passon.id });
            debug('New compendium %s', passon.id);
            fulfill(passon);
        });
    };
}

module.exports.Loader = Loader;
