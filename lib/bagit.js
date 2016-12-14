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
const debug = require('debug')('muncher:bagit');
const Bag = require('bagit');
const config = require('../config/config');
const cleanMessage = require('../lib/error-message');

/*
 *  Load the associated bag, check if it's valid.
 * 
 *  The provided object must have the fields id and bagpath.
 */
function validateBag(passon) {
    return new Promise((fulfill, reject) => {
        debug('[%s] Validate bag', passon.id);

        let bag = new Bag(passon.bagpath);
        bag
            .validate(config.bagtainer.bagit.validateFast)
            .then(res => {
                debug('[%s] bag is valid: %s', passon.id, res);
                fulfill(passon);
            }).catch((err) => {
                debug('[%s] bag is _IN_valid [fail? %s]: %s', passon.id,
                    config.bagtainer.bagit.failOnValidationError.upload, err);

                if (config.bagtainer.bagit.failOnValidationError.upload) {
                    err.status = 400;
                    err.msg = 'bag ist invalid: ' + cleanMessage(err.message);
                    reject(err);
                } else {
                    fulfill(passon);
                }
            });
    });
}

module.exports.validateBag = validateBag;