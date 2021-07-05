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
const journal = require('../lib/journal')

let Publisher = require('../lib/model/publisher');

exports.create = (req, res) => {
    if (!req.isAuthenticated()) {
        res.status('401').send();
        return;
    }

    let publisher_id = randomstring.generate(config.id_length);
    debug('[%s] Create new publisher with name: %s', publisher_id, req.body.name);

    // check parameters
    if (!req.body.name) {
        debug('[%s] name parameter not provided', publisher_id);
        res.status(400).send({error: 'name required'});
        return;
    }

    if (!req.body.domains) {
        debug('[%s] domains parameter not provided', publisher_id);
        res.status(400).send({error: 'domains required'});
        return;
    }

    if (!Array.isArray(req.body.domains)) {
        debug('[%s] domains parameter is not an array', publisher_id);
        res.status(400).send({error: 'domains not array'});
        return;
    }

    if (req.user.level < config.user.level.manage_publisher) {
        debug('[%s] User is not allowed to create a publisher', publisher_id);
        res.status(401).send();
        return;
    }

    domain.validateDomains(req.body.domains)
        .then(() => {
            let journals = [];
            if (req.body.journals)
                journals = req.body.journals;

            journal.validateJournals(journals)
                .then(() => {
                    domain.addDomainsToDb(req.body.domains)
                        .then((domains) => {
                            let newPublisher = new Publisher({
                                id: publisher_id,
                                name: req.body.name,
                                domains: domains.sort(),
                                journals: journals,
                                owner: req.user.orcid,
                                journalCandidates: []
                            });

                            newPublisher.save(err => {
                                if (err) {
                                    debug('[%s] Error saving new publisher: %O', publisher_id, err);
                                    res.status(500).send({error: 'Error saving new publisher to database'});
                                    return;
                                }
                                debug('[%s] Successfully saved new publisher', publisher_id)
                                res.status(200).send();
                                dnsBuilder.addToDns(publisher_id, config.dns.priority.publisher);
                            });
                        })
                        .catch(err => {
                            debug('[%s] Error saving domains provided by publisher: %O', publisher_id, err);
                            res.status(500).send({error: 'Error saving new publisher to database'});
                        });
                })
                .catch(err => {
                    res.status(400).send({error: 'List of journals includes invalid journals: ' + err.toString()});
                })
        })
        .catch(err => {
            res.status(400).send({error: 'List of domains includes invalid domains: ' + err.toString()});
        });
}

exports.update = (req, res) => {
    if (!req.isAuthenticated()) {
        res.status('401').send();
        return;
    }

    if (!req.body.id) {
        debug('Update publisher: No ID provided');
        res.status(400).send({error: 'No ID provided'});
        return;
    }

    if (req.user.level < config.user.level.manage_publisher) {
        debug('[%s] User is not allowed to edit a publisher', req.body.id);
        res.status(401).send();
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
        if (req.user.orcid !== publisher.owner) {
            res.status('403').send();
            return;
        }
        if (req.body.name) {
            debug('[%s] Updating publisher, new Name: %s', publisherId, req.body.name);
        }
        if (req.body.domains) {
            debug('[%s] Updating publisher, new domain list: %O', publisherId, req.body.domains);
        }

        let oldDomainList = publisher.domains;

        domain.validateDomains(req.body.domains)
            .then(() => {
                let journals = [];
                if (req.body.journals)
                    journals = req.body.journals;

                journal.validateJournals(journals)
                    .then(() => {
                        domain.addDomainsToDb(req.body.domains)
                            .then((domains) => {
                                publisher.name = req.body.name;
                                publisher.domains = domains.sort();
                                publisher.journals = journals;

                                publisher.save(err => {
                                    if (err) {
                                        debug('[%s] Error updating publisher: %O', publisher.id, err);
                                        res.status(500).send({error: 'Error updating publisher'});
                                        return;
                                    }
                                    debug('[%s] Successfully updated publisher', publisher.id)
                                    res.status(200).send();
                                    dnsBuilder.removeJournalFromDns(publisher.id, config.dns.priority.publisher);
                                    if (req.body.domains) {
                                        domain.maybeDelete(oldDomainList);
                                    }
                                    dnsBuilder.addToDns(publisher.id, config.dns.priority.publisher);
                                });
                            }).catch(err => {
                            debug('[%s] Error saving domains provided by publisher: %O', publisher.id, err);
                            res.status(500).send({error: 'Error updating publisher'});
                        });
                    })
                    .catch(err => {
                        res.status(400).send({error: 'List of journals includes invalid journals: ' + err.toString()});
                    })
            })
            .catch(err => {
                res.status(400).send({error: 'List of domains includes invalid domains: ' + err.toString()});
            });
    });
}

exports.addDomain = function (req, res) {
    if (!req.isAuthenticated()) {
        res.status('401').send();
        return;
    }

    if (!req.body.id) {
        debug('Add domain: No ID provided');
        res.status(400).send({error: 'No ID provided'});
        return;
    }

    if (req.user.level < config.user.level.manage_publisher) {
        debug('[%s] User is not allowed to edit a publisher', req.body.id);
        res.status(401).send();
        return;
    }

    Publisher.findOne({id: req.body.id}, (err, publisher) => {
        if (err) {
            debug('[%s] Error finding publisher: %O', req.body.id, err);
            res.status(500).send({error: 'Error finding publisher in database'});
            return;
        }
        if (!publisher) {
            debug('[%s] No publisher with this id found', req.body.id);
            res.status(500).send({error: 'No publisher with this id found'});
            return;
        }
        if (req.user.orcid !== publisher.owner) {
            res.status('403').send();
            return;
        }

        let domainArray = [];
        domainArray.push(req.body.url);

        domain.validateDomains(domainArray)
            .then(() => {
                domain.addDomainsToDb(domainArray)
                    .then((domains) => {
                        if (publisher.domains.includes(domains[0])) {
                            res.status(400).send({error: 'Domain is already in the list'});
                            return;
                        }

                        publisher.domains.push(domains[0]);

                        publisher.domains = publisher.domains.sort();

                        publisher.save(err => {
                            if (err) {
                                debug('[%s] Error updating publisher: %O', publisher.id, err);
                                res.status(500).send({error: 'Error updating publisher'});
                                return;
                            }
                            debug('[%s] Successfully updated publisher', publisher.id)
                            res.status(200).send();
                            dnsBuilder.removeJournalFromDns(publisher.id, config.dns.priority.publisher);
                            dnsBuilder.addToDns(publisher.id, config.dns.priority.publisher);
                        });
                    }).catch(err => {
                    debug('[%s] Error saving domains provided by publisher: %O', publisher.id, err);
                    res.status(500).send({error: 'Error updating publisher'});
                });
            })
            .catch(err => {
                debug('[%s] Domain is not a valid domain: %O', publisher.id, err);
                res.status(400).send({error: 'Domain is not a valid domain: ' + err.toString()});
            });
    });
}

exports.removeDomain = function (req, res) {
    if (!req.isAuthenticated()) {
        res.status('401').send();
        return;
    }

    if (!req.body.id) {
        debug('Remove Domain from publisher: No ID provided');
        res.status(400).send({error: 'No ID provided'});
        return;
    }

    if (req.user.level < config.user.level.manage_publisher) {
        debug('[%s] User is not allowed to edit a publisher', req.body.id);
        res.status(401).send();
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
        if (req.user.orcid !== publisher.owner) {
            res.status('403').send();
            return;
        }

        let domainArray = [];
        domainArray.push(req.body.url);

        domain.validateDomains(domainArray)
            .then(() => {
                domain.addDomainsToDb(domainArray)
                    .then((domains) => {
                        if (!publisher.domains.includes(domains[0])) {
                            res.status(400).send({error: 'Domain is not in the list'});
                            return;
                        }

                        publisher.domains.splice(publisher.domains.indexOf(domains[0]), 1).sort();

                        publisher.save(err => {
                            if (err) {
                                debug('[%s] Error updating publisher: %O', publisher.id, err);
                                res.status(500).send({error: 'Error updating publisher'});
                                return;
                            }
                            debug('[%s] Successfully updated publisher', publisher.id)
                            res.status(200).send();
                            dnsBuilder.removeJournalFromDns(publisher.id, config.dns.priority.publisher);
                            if (req.body.domains) {
                                domain.maybeDelete(domains);
                            }
                            dnsBuilder.addToDns(publisher.id, config.dns.priority.publisher);
                        });
                    }).catch(err => {
                    debug('[%s] Error saving domains provided by publisher: %O', publisher.id, err);
                    res.status(500).send({error: 'Error updating publisher'});
                });
            })
            .catch(err => {
                res.status(400).send({error: 'List of domains includes invalid domains: ' + err.toString()});
            });
    });
}

exports.addJournal = function (req, res) {
    if (!req.isAuthenticated()) {
        res.status('401').send();
        return;
    }

    if (!req.body.publisherId) {
        debug('Add journal to publisher: No publisher ID provided');
        res.status(400).send({error: 'No ID provided'});
        return;
    }

    if (!req.body.journalId) {
        debug('Add journal to publisher: No journal ID provided');
        res.status(400).send({error: 'No ID provided'});
        return;
    }

    if (req.user.level < config.user.level.manage_publisher) {
        debug('[%s] User is not allowed to edit a publisher', req.body.id);
        res.status(401).send();
        return;
    }

    let publisherId = req.body.publisherId;
    let journalId = req.body.journalId;

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
        if (req.user.orcid !== publisher.owner) {
            res.status('403').send();
            return;
        }

        let journals = [];
        journals.push(journalId);

        journal.validateJournals(journals)
            .then(() => {
                publisher.journals.push(journalId);
                publisher.save(err => {
                    if (err) {
                        debug('[%s] Error updating publisher: %O', publisher.id, err);
                        res.status(500).send({error: 'Error updating publisher'});
                        return;
                    }
                    debug('[%s] Successfully updated publisher', publisher.id)
                    res.status(200).send();
                });
            })
            .catch(err => {
                res.status(400).send({error: 'Journal not found: ' + err.toString()});
            })
    })
}

exports.confirmJournal = function (req, res) {
    if (!req.isAuthenticated()) {
        res.status('401').send();
        return;
    }

    if (!req.body.publisherId) {
        debug('Confirm journal: No publisher ID provided');
        res.status(400).send({error: 'No ID provided'});
        return;
    }

    if (!req.body.journalId) {
        debug('Confirm journal: No journal ID provided');
        res.status(400).send({error: 'No ID provided'});
        return;
    }

    if (req.user.level < config.user.level.manage_publisher) {
        debug('[%s] User is not allowed to edit a publisher', req.body.id);
        res.status(401).send();
        return;
    }

    let publisherId = req.body.publisherId;
    let journalId = req.body.journalId;

    Publisher.findOne({id: publisherId}, (err, publisher) => {
        if (err || !publisher) {
            debug('[%s] No publisher with this ID', publisherId);
            res.status(404).send();
            return;
        }
        if (req.user.orcid !== publisher.owner) {
            res.status('403').send();
            return;
        }

        journal.validateJournals([journalId])
            .then(() => {
                if (publisher.journalCandidates.includes(journalId)) {
                    publisher.journalCandidates = publisher.journalCandidates.filter(el => el !== journalId);
                    publisher.journals.push(journalId);

                    publisher.save(err => {
                        if (err) {
                            debug('[%s] Error updating publisher: %O', publisher.id, err);
                            res.status(500).send({error: 'Error updating publisher'});
                            return;
                        }
                        debug('[%s] Successfully updated publisher', publisher.id)
                        res.status(200).send();
                    });
                } else {
                    debug('[%s] Journal is no candidate for this publisher', publisherId);
                    res.status(500).send();
                }
            })
            .catch(err => {
                res.status(400).send({error: 'Journal not found: ' + err.toString()});
            });
    })
}

exports.removeJournal = function (req, res) {
    if (!req.isAuthenticated()) {
        res.status('401').send();
        return;
    }

    if (!req.body.publisherId) {
        debug('Remove journal: No publisher ID provided');
        res.status(400).send({error: 'No ID provided'});
        return;
    }

    if (!req.body.journalId) {
        debug('Remove journal: No journal ID provided');
        res.status(400).send({error: 'No ID provided'});
        return;
    }

    if (req.user.level < config.user.level.manage_publisher) {
        debug('[%s] User is not allowed to edit a publisher', req.body.id);
        res.status(401).send();
        return;
    }

    let publisherId = req.body.publisherId;
    let journalId = req.body.journalId;

    Publisher.findOne({id: publisherId}, (err, publisher) => {
        if (err || !publisher) {
            debug('[%s] No publisher with this ID', publisherId);
            res.status(404).send();
            return;
        }
        if (req.user.orcid !== publisher.owner) {
            res.status('403').send();
            return;
        }

        journal.validateJournals([journalId])
            .then(() => {
                if (publisher.journals.includes(journalId)) {
                    publisher.journals = publisher.journals.filter(el => el !== journalId);

                    publisher.save(err => {
                        if (err) {
                            debug('[%s] Error updating publisher: %O', publisher.id, err);
                            res.status(500).send({error: 'Error updating publisher'});
                            return;
                        }
                        debug('[%s] Successfully updated publisher', publisher.id)
                        res.status(200).send();
                    });
                } else {
                    debug('[%s] Journal does not belong to this publisher', publisherId);
                    res.status(500).send();
                }
            })
            .catch(err => {
                res.status(400).send({error: 'Journal not found: ' + err.toString()});
            });
    })
}

exports.listPublishers = function (req, res) {
    debug('Get list of publishers');
    Publisher.find({}, '-_id id name domains journals', (err, publishers) => {
        if (err) {
            debug('Error getting list of publishers from database: %O', err);
            res.status(500).send("Error getting list of publishers from database");
            return;
        }

        res.status(200).send(publishers);
    })
}

exports.viewPublisher = function (req, res) {
    if (!req.isAuthenticated()) {
        req.status('401').send();
        return;
    }

    if (!req.params.id) {
        res.status('400').send("No ID provided!");
        return;
    }

    let publisherId = req.params.id;

    debug('[%s] Getting publisher', publisherId)

    Publisher.findOne({id: publisherId}, '-_id id name domains journals', (err, publisher) => {
        if (err) {
            debug('[%s] Error getting Publisher from database: %O', publisherId, err);
            res.status('500').send("Error getting Publisher from database");
            return;
        } else if (!publisher) {
            debug('[%s] No Publisher with this ID found', publisherId);
            res.status('404').send();
            return;
        }

        res.status('200').send(publisher);
    });
}

exports.getPublisher = function (req, res) {
    if (!req.isAuthenticated()) {
        req.status('401').send();
        return;
    }

    if (!req.user || req.user.level < config.user.level.manage_publisher) {
        res.status('403').send();
        return;
    }

    if (!req.params.id) {
        res.status('400').send("No ID provided!");
        return;
    }

    let publisherId = req.params.id;

    debug('[%s] Getting publisher', publisherId)

    Publisher.findOne({id: publisherId}, (err, publisher) => {
        if (err) {
            debug('[%s] Error getting Publisher from database: %O', publisherId, err);
            res.status('500').send("Error getting Publisher from database");
            return;
        }
        if (!publisher) {
            debug('[%s] No Publisher with this ID found', publisherId);
            res.status('404').send();
            return;
        }
        if (req.user.orcid !== publisher.owner) {
            res.status('403').send();
            return;
        }

        res.status('200').send(publisher);
    });
}

exports.getPublisherDomains = function (req, res) {
    if (!req.params.id) {
        res.status('400').send("No ID provided!");
        return;
    }

    let publisherId = req.params.id;

    debug('[%s] Getting Publisher Domains', publisherId)

    Publisher.findOne({id: publisherId}, (err, publisher) => {
        if (err) {
            debug('[%s] Error getting Publisher from database: %O', publisherId, err);
            res.status('500').send("Error getting Publisher from database");
            return;
        }
        if (!publisher) {
            debug('[%s] No Publisher with this ID found', publisherId);
            res.status('404').send();
            return;
        }
        domain.getDomainsForPublisher(publisher)
            .then(domains => {
                res.status('200').send(domains);
            })
            .catch(err => {
                res.status('500').send();
            });
    });
}

exports.getPublisherJournals = function (req, res) {
    if (!req.params.id) {
        res.status('400').send("No ID provided!");
        return;
    }

    let publisherId = req.params.id;

    debug('[%s] Getting Publisher Journals', publisherId)

    Publisher.findOne({id: publisherId}, (err, publisher) => {
        if (err) {
            debug('[%s] Error getting Publisher from database: %O', publisherId, err);
            res.status('500').send("Error getting Publisher from database");
            return;
        }
        if (!publisher) {
            debug('[%s] No Publisher with this ID found', publisherId);
            res.status('404').send();
            return;
        }
        journal.getJournalsForPublisher(publisher)
            .then(domains => {
                res.status('200').send(domains);
            })
            .catch(err => {
                res.status('500').send();
            });
    });
}
