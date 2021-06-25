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
const debug = require('debug')('muncher:journal');
const randomstring = require('randomstring');
const dnsBuilder = require('../lib/dns-manager');
const domain = require('../lib/domain');
const publisher = require('../lib/publisher');

let Journal = require('../lib/model/journal');
let Domain = require('../lib/model/domain');

exports.create = (req, res) => {
    if (!req.isAuthenticated()) {
        res.status('401').send();
        return;
    }

    let journal_id = randomstring.generate(config.id_length);
    debug('[%s] Create new journal with name: %s', journal_id, req.body.name);

    // check parameters
    if (!req.body.name) {
        debug('[%s] name parameter not provided', journal_id);
        res.status(400).send({error: 'name required'});
        return;
    }

    if (!req.body.urls) {
        debug('[%s] urls parameter not provided', journal_id);
        res.status(400).send({error: 'urls required'});
        return;
    }

    if (!Array.isArray(req.body.urls)) {
        debug('[%s] urls parameter is not an array', journal_id);
        res.status(400).send({error: 'urls not array'});
        return;
    }

    if (req.user.level < config.user.level.manage_journal) {
        debug('[%s] User is not allowed to create a journal', journal_id);
        res.status(401).send();
        return;
    }

    domain.validateDomains(req.body.urls)
        .then(() => {
            domain.addDomainsToDb(req.body.urls)
                .then((urls) => {
                    let newJournal = new Journal({
                        id: journal_id,
                        name: req.body.name,
                        urls: urls.sort(),
                        owner: req.user.orcid
                    });

                    newJournal.save(err => {
                        if (err) {
                            debug('[%s] Error saving new journal: %O', journal_id, err);
                            res.status(500).send({error: 'Error saving new journal to database'});
                            return;
                        }
                        debug('[%s] Successfully saved new journal', journal_id)
                        res.status(200).send();
                        dnsBuilder.addToDns(journal_id, config.dns.priority.journal);
                    });
                })
                .catch(err => {
                    debug('[%s] Error saving domains provided by journal: %O', journal_id, err);
                    res.status(500).send({error: 'Error saving new journal to database'});
                });
        })
        .catch(err => {
            res.status(400).send({error: 'List of urls includes invalid domains: ' + err.toString()});
        });
}

exports.update = (req, res) => {
    if (!req.isAuthenticated()) {
        res.status('401').send();
        return;
    }

    if (!req.body.id) {
        debug('Update journal: No ID provided');
        res.status(400).send({error: 'No ID provided'});
        return;
    }

    if (req.user.level < config.user.level.manage_journal) {
        debug('[%s] User is not allowed to edit a journal', req.body.id);
        res.status(401).send();
        return;
    }

    let journalId = req.body.id;

    Journal.findOne({id: journalId}, (err, journal) => {
        if (err) {
            debug('[%s] Error finding journal: %O', journalId, err);
            res.status(500).send({error: 'Error finding journal in database'});
            return;
        }
        if (!journal) {
            debug('[%s] No journal with this id found', journalId);
            res.status(500).send({error: 'No journal with this id found'});
            return;
        }

        if (req.user.orcid !== journal.owner) {
            res.status('403').send();
            return;
        }

        if (req.body.name) {
            debug('[%s] Updating journal, new Name: %s', journalId, req.body.name);
        }
        if (req.body.urls) {
            debug('[%s] Updating journal, new url list: %O', journalId, req.body.urls);
        }

        let oldUrlList = journal.urls;

        domain.validateDomains(req.body.urls)
            .then(() => {
                domain.addDomainsToDb(req.body.urls)
                    .then((urls) => {
                        journal.name = req.body.name;
                        journal.urls = urls.sort();

                        journal.save(err => {
                            if (err) {
                                debug('[%s] Error updating journal: %O', journal.id, err);
                                res.status(500).send({error: 'Error updating journal'});
                                return;
                            }
                            debug('[%s] Successfully updated journal', journal.id)
                            res.status(200).send();
                            dnsBuilder.removeJournalFromDns(journal.id);
                            if (req.body.url) {
                                domain.maybeDelete(oldUrlList);
                            }
                            dnsBuilder.addToDns(journal.id, config.dns.priority.journal);
                        });
                    }).catch(err => {
                    debug('[%s] Error saving domains provided by journal: %O', journal.id, err);
                    res.status(500).send({error: 'Error updating journal'});
                });
            })
            .catch(err => {
                res.status(400).send({error: 'List of urls includes invalid domains: ' + err.toString()});
            });
    });
}

exports.addUrl = function (req, res) {
    if (!req.isAuthenticated()) {
        res.status('401').send();
        return;
    }

    if (!req.body.id) {
        debug('Add URL: No ID provided');
        res.status(400).send({error: 'No ID provided'});
        return;
    }

    if (req.user.level < config.user.level.manage_journal) {
        debug('[%s] User is not allowed to edit a journal', req.body.id);
        res.status(401).send();
        return;
    }

    Journal.findOne({id: req.body.id}, (err, journal) => {
        if (err) {
            debug('[%s] Error finding journal: %O', req.body.id, err);
            res.status(500).send({error: 'Error finding journal in database'});
            return;
        }
        if (!journal) {
            debug('[%s] No journal with this id found', req.body.id);
            res.status(500).send({error: 'No journal with this id found'});
            return;
        }

        if (req.user.orcid !== journal.owner) {
            res.status('403').send();
            return;
        }

        let urlArray = [];
        urlArray.push(req.body.url);

        domain.validateDomains(urlArray)
            .then(() => {
                domain.addDomainsToDb(urlArray)
                    .then((urls) => {
                        if (journal.urls.includes(urls[0])) {
                            res.status(400).send({error: 'Url is already in the list'});
                            return;
                        }

                        journal.urls.push(urls[0]);

                        journal.urls = journal.urls.sort();

                        journal.save(err => {
                            if (err) {
                                debug('[%s] Error updating journal: %O', journal.id, err);
                                res.status(500).send({error: 'Error updating journal'});
                                return;
                            }
                            debug('[%s] Successfully updated journal', journal.id)
                            res.status(200).send();
                            dnsBuilder.removeJournalFromDns(journal.id);
                            dnsBuilder.addToDns(journal.id, config.dns.priority.journal);
                        });
                    }).catch(err => {
                    debug('[%s] Error saving domains provided by journal: %O', journal.id, err);
                    res.status(500).send({error: 'Error updating journal'});
                });
            })
            .catch(err => {
                debug('[%s] Url is not a valid domain: %O', journal.id, err);
                res.status(400).send({error: 'Url is not a valid domain: ' + err.toString()});
            });
    });
}

exports.removeUrl = function (req, res) {
    if (!req.isAuthenticated()) {
        res.status('401').send();
        return;
    }

    if (!req.body.id) {
        debug('Remove URL from journal: No ID provided');
        res.status(400).send({error: 'No ID provided'});
        return;
    }

    if (req.user.level < config.user.level.manage_journal) {
        debug('[%s] User is not allowed to edit a journal', req.body.id);
        res.status(401).send();
        return;
    }

    Journal.findOne({id: req.body.id}, (err, journal) => {
        if (err) {
            debug('[%s] Error finding journal: %O', journal.id, err);
            res.status(500).send({error: 'Error finding journal in database'});
            return;
        }
        if (!journal) {
            debug('[%s] No journal with this id found', journal.id);
            res.status(500).send({error: 'No journal with this id found'});
            return;
        }

        if (req.user.orcid !== journal.owner) {
            res.status('403').send();
            return;
        }


        let urlArray = [];
        urlArray.push(req.body.url);

        domain.validateDomains(urlArray)
            .then(() => {
                domain.addDomainsToDb(urlArray)
                    .then((urls) => {
                        if (!journal.urls.includes(urls[0])) {
                            res.status(400).send({error: 'Url is not in the list'});
                            return;
                        }

                        journal.urls.splice(journal.urls.indexOf(urls[0]), 1).sort();

                        journal.save(err => {
                            if (err) {
                                debug('[%s] Error updating journal: %O', journal.id, err);
                                res.status(500).send({error: 'Error updating journal'});
                                return;
                            }
                            debug('[%s] Successfully updated journal', journal.id)
                            res.status(200).send();
                            dnsBuilder.removeJournalFromDns(journal.id);
                            if (req.body.url) {
                                domain.maybeDelete(urls);
                            }
                            dnsBuilder.addToDns(journal.id, config.dns.priority.journal);
                        });
                    }).catch(err => {
                    debug('[%s] Error saving domains provided by journal: %O', journal.id, err);
                    res.status(500).send({error: 'Error updating journal'});
                });
            })
            .catch(err => {
                res.status(400).send({error: 'List of urls includes invalid domains: ' + err.toString()});
            });
    });
}

exports.addToPublisher = function (req, res) {
    if (!req.isAuthenticated()) {
        res.status('401').send();
        return;
    }

    if (!req.body.id) {
        debug('Add Journal to Publisher: No ID provided');
        res.status(400).send({error: 'No ID provided'});
        return;
    }

    if (req.user.level < config.user.level.manage_journal) {
        debug('[%s] User is not allowed to edit a journal', req.body.id);
        res.status(401).send();
        return;
    }

    Journal.findOne({id: req.body.id}, (err, journal) => {
        if (err) {
            res.status('500').send();
            return;
        }
        if (!journal) {
            res.status('404').send();
            return;
        }
        if (req.user.orcid !== journal.owner) {
            res.status('403').send();
            return;
        }
        publisher.addJournal(req.body.publisher, journal.id)
            .then(() => {
                debug('[%s] Successfully added journal as candidate to publisher %s', journal.id, req.body.publisher);
                res.status(200).send();
            })
            .catch(err => {
                debug('[%s] Error adding journal as candidate to publisher %s: %O', journal.id, req.body.publisher, err);
                res.status(400).send({error: 'Error adding journal as candidate to publisher'});
            });
    });
}

exports.listJournal = function(req, res) {
    debug('Get list of journals');
    Journal.find({}, '-_id id name urls compendia', (err, journals) => {
        if (err){
            debug('Error getting list of journals from database: %O', err);
            res.status(500).send("Error getting list of journals from database");
            return;
        }

        res.status(200).send(journals);
    })
}

exports.viewJournal = function(req, res) {
    if (!req.isAuthenticated()) {
        req.status('401').send();
        return;
    }

    if (!req.params.id) {
        res.status('400').send("No ID provided!");
        return;
    }

    let journalId = req.params.id;

    debug('[%s] Getting journal', journalId)

    Journal.findOne({id: journalId}, '-_id id name urls compendia', (err, journal) => {
        if (err) {
            debug('[%s] Error getting Journal from database: %O', journalId, err);
            res.status('500').send("Error getting Journal from database");
            return;
        } else if(!journal) {
            debug('[%s] No Journal with this ID found', journalId);
            res.status('404').send();
            return;
        }

        res.status('200').send(journal);
    });
}

exports.getJournal = function(req, res) {
    if (!req.isAuthenticated()) {
        req.status('401').send();
        return;
    }

    if (!req.user || req.user.level === config.user.level.manage_journal) {
        req.status('403').send();
        return;
    }

    if (!req.params.id) {
        res.status('400').send("No ID provided!");
        return;
    }

    let journalId = req.params.id;

    debug('[%s] Getting Journal', journalId)

    Journal.findOne({id: journalId}, (err, journal) => {
        if (err) {
            debug('[%s] Error getting Journal from database: %O', journalId, err);
            res.status('500').send("Error getting Journal from database");
            return;
        }
        if(!journal) {
            debug('[%s] No Journal with this ID found', journalId);
            res.status('404').send();
            return;
        }
        if (req.user.orcid !== journal.owner) {
            res.status('403').send();
            return;
        }

        res.status('200').send(journal);
    });
}

exports.getJournalDomains = function(req, res) {
    if (!req.params.id) {
        res.status('400').send("No ID provided!");
        return;
    }

    let journalId = req.params.id;

    debug('[%s] Getting Journal Domains', journalId)

    Journal.findOne({id: journalId}, (err, journal) => {
        if (err) {
            debug('[%s] Error getting Journal from database: %O', journalId, err);
            res.status('500').send("Error getting Journal from database");
            return;
        }
        if(!journal) {
            debug('[%s] No Journal with this ID found', journalId);
            res.status('404').send();
            return;
        }
        domain.getDomainsForJournal(journal)
            .then(domains => {
                res.status('200').send(domains);
            })
            .catch(err => {
                res.status('500').send();
            });
    });
}
