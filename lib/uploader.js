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

const debug = require('debug')('muncher:uploader');
const Docker = require('dockerode');
const validateBag = require('../lib/bagit').validateBag;
const steps = require('../lib/uploader-steps');

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
            res: this.res,
            docker: new Docker() // setup Docker client with default options
        };
        debug('[%s] Docker client set up: %s', passon.id, JSON.stringify(passon.docker));
        
        return steps.unzip(passon)
            .then(steps.scan)
            .then(validateBag)
            .then(steps.extractMetadata)
            .then(steps.loadMetadata)
            //.then(this.updateMetadataWithCleverBrokerAndSchema)
            .then(steps.save)
            .then(steps.cleanup)
            .then(this.respond)
            .then((passon) => {
                debug('[%s] completed upload');
                done(passon.id);
            })
            .catch(err => {
                debug('%s] Rejection or unhandled failure during execute: \n\t%s',
                    this.req.file.filename, JSON.stringify(err));
                let status = 500;
                if (err.status) {
                    status = err.status;
                }
                let msg = 'Internal error';
                if (err.msg) {
                    msg = err.msg;
                }
                res.status(status).send(JSON.stringify({ error: msg }));
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
