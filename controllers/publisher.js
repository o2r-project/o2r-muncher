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
const debug = require('debug')('muncher:publisher');
const randomstring = require('randomstring');
const dnsBuilder = require('../lib/dns-manager');
const domain = require('../lib/domain');

let Publisher = require('../lib/model/publisher');
let Domain = require('../lib/model/domain');

exports.create = (req, res) => {
    let publisher_id = randomstring.generate(config.id_length);
    debug('[%s] Create new publisher with name: %s', publisher_id, req.body.name);

    // check parameters
    if (!req.body.name) {
        debug('[%s] name parameter not provided', publisher_id);
        res.status(400).send({error: 'name required'});
        return;
    }

    if (!req.body.urls) {
        debug('[%s] urls parameter not provided', publisher_id);
        res.status(400).send({error: 'urls required'});
        return;
    }

    if (!Array.isArray(req.body.urls)) {
        debug('[%s] urls parameter is not an array', publisher_id);
        res.status(400).send({error: 'urls not array'});
        return;
    }

    if (req.body.urls.length < 1) {
        debug('[%s] Empty list of urls provided', publisher_id);
        res.status(400).send({error: 'List of urls is empty'});
        return;
    }

    domain.validateDomains(req.body.urls)
        .then(() => {
            domain.addDomainsToDb(req.body.urls)
                .then((urls) => {
                    let newPublisher = new Publisher({
                        id: publisher_id,
                        name: req.body.name,
                        urls: urls.sort()
                    });

                    newPublisher.save(err => {
                        if (err) {
                            debug('[%s] Error saving new publisher: %O', publisher_id, err);
                            res.status(500).send({error: 'Error saving new publisher to database'});
                            return;
                        }
                        debug('[%s] Successfully saved new publisher',)
                        res.status(200).send();
                        dnsBuilder.addPublisherToDns(publisher_id);
                    });
                })
                .catch(err => {
                    debug('[%s] Error saving domains provided by publisher: %O', publisher_id, err);
                    res.status(500).send({error: 'Error saving new publisher to database'});
                });
        })
        .catch(err => {
            res.status(400).send({error: 'List of urls includes invalid domains: ' + err.toString()});
        });
}

let update = (req, res) => {
    if (!req.body.id) {
        debug('Update publisher: No ID provided');
        res.status(400).send({error: 'No ID provided'});
        return;
    }

    let publisherId = req.body.id;

    Publisher.findOne({id: publisherId}, (err, publisher) => {
        if (err) {
            debug('[%s] Error finding publisher: %O', publisherId, err);
            res.status(500).send({error: 'Error finding publisher in database'});
            return;
        }
        if (!publisher) {
            debug('[%s] No publisher with this id found', publisherId);
            res.status(500).send({error: 'No publisher with this id found'});
            return;
        }
        if (req.body.name) {
            debug('[%s] Updating Publisher, new Name: %s', publisherId, req.body.name);
        }
        if (req.body.urls) {
            debug('[%s] Updating Publisher, new url list: %O', publisherId, req.body.urls);
        }

        domain.validateDomains(req.body.urls)
            .then(() => {
                domain.addDomainsToDb(req.body.urls)
                    .then((urls) => {
                        publisher.name = req.body.name;
                        publisher.urls = urls.sort();

                        publisher.save(err => {
                            if (err) {
                                debug('[%s] Error updating publisher: %O', publisher.id, err);
                                res.status(500).send({error: 'Error updating publisher'});
                                return;
                            }
                            debug('[%s] Successfully updated publisher',)
                            res.status(200).send();
                            dnsBuilder.removePublisherFromDns(publisher.id);
                            if (req.body.url) {
                                domain.maybeDelete(req.body.url);
                            }
                            dnsBuilder.addPublisherToDns(publisher.id);
                        });
                    }).catch(err => {
                    debug('[%s] Error saving domains provided by publisher: %O', publisher.id, err);
                    res.status(500).send({error: 'Error updating publisher'});
                });
            })
            .catch(err => {
                res.status(400).send({error: 'List of urls includes invalid domains: ' + err.toString()});
            });
    });
}

exports.addUrl = function(req, res) {
    if (!req.body.id) {
        debug('Update publisher: No ID provided');
        res.status(400).send({error: 'No ID provided'});
        return;
    }

    Publisher.findOne({id: req.body.id}, (err, publisher) => {
        if (err) {
            debug('[%s] Error finding publisher: %O', publisher.id, err);
            res.status(500).send({error: 'Error finding publisher in database'});
            return;
        }
        if (!publisher) {
            debug('[%s] No publisher with this id found', publisher.id);
            res.status(500).send({error: 'No publisher with this id found'});
            return;
        }

        // TODO: Insert new URL in req.body.urls list and provide list to update()

        // req.body.urls = publisher.urls.push(req.body.url);
        // req.body.name = publisher.name;
        // update(req, res);
    });
}

exports.removeUrl = function(req, res) {
    if (!req.body.id) {
        debug('Update publisher: No ID provided');
        res.status(400).send({error: 'No ID provided'});
        return;
    }

    Publisher.findOne({id: req.body.id}, (err, publisher) => {
        if (err) {
            debug('[%s] Error finding publisher: %O', publisher.id, err);
            res.status(500).send({error: 'Error finding publisher in database'});
            return;
        }
        if (!publisher) {
            debug('[%s] No publisher with this id found', publisher.id);
            res.status(500).send({error: 'No publisher with this id found'});
            return;
        }
        // TODO: Delete URL from req.body.urls list and provide list to update()

        // req.body.urls = publisher.urls.splice(publisher.urls.indexOf(req.body.url), 1);
        // req.body.name = publisher.name;
        // update(req, res);
    });
}

exports.update = update;
