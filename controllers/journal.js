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
const resolve_public_link = require('./link').resolve_public_link;

let Journal = require('../lib/model/journal');
const Compendium = require('../lib/model/compendium');

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

    if (!req.body.domains) {
        debug('[%s] domains parameter not provided', journal_id);
        res.status(400).send({error: 'domains required'});
        return;
    }

    if (!Array.isArray(req.body.domains)) {
        debug('[%s] domains parameter is not an array', journal_id);
        res.status(400).send({error: 'domains not array'});
        return;
    }

    if (req.user.level < config.user.level.manage_journal) {
        debug('[%s] User is not allowed to create a journal', journal_id);
        res.status(401).send();
        return;
    }

    domain.validateDomains(req.body.domains)
        .then(() => {
            domain.addDomainsToDb(req.body.domains)
                .then((domains) => {
                    let newJournal = new Journal({
                        id: journal_id,
                        name: req.body.name,
                        domains: domains.sort(),
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
            res.status(400).send({error: 'List of domains includes invalid domains: ' + err.toString()});
        });
}

exports.update = (req, res) => {
    if (!req.isAuthenticated()) {
        res.status('401').send();
        return;
    }

    if (!req.params.id) {
        debug('Update journal: No ID provided');
        res.status(400).send({error: 'No ID provided'});
        return;
    }

    if (req.user.level < config.user.level.manage_journal) {
        debug('[%s] User is not allowed to edit a journal', req.params.id);
        res.status(401).send();
        return;
    }

    let journalId = req.params.id;

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
        if (req.body.domains) {
            debug('[%s] Updating journal, new domains list: %O', journalId, req.body.domains);
        }

        let oldDomainList = journal.domains;

        domain.validateDomains(req.body.domains)
            .then(() => {
                domain.addDomainsToDb(req.body.domains)
                    .then((domains) => {
                        journal.name = req.body.name;
                        journal.domains = domains.sort();

                        journal.save(err => {
                            if (err) {
                                debug('[%s] Error updating journal: %O', journal.id, err);
                                res.status(500).send({error: 'Error updating journal'});
                                return;
                            }
                            debug('[%s] Successfully updated journal', journal.id)
                            res.status(200).send();
                            dnsBuilder.removeJournalFromDns(journal.id, config.dns.priority.journal);
                            if (req.body.domains) {
                                domain.maybeDelete(oldDomainList);
                            }
                            dnsBuilder.addToDns(journal.id, config.dns.priority.journal);
                        });
                    }).catch(err => {
                    debug('[%s] Error saving domains provided by journal: %O', journal.id, err);
                    res.status(500).send({error: 'Error updating journal'});
                });
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

    if (!req.params.id) {
        debug('Add domain: No ID provided');
        res.status(400).send({error: 'No ID provided'});
        return;
    }

    if (req.user.level < config.user.level.manage_journal) {
        debug('[%s] User is not allowed to edit a journal', req.params.id);
        res.status(401).send();
        return;
    }

    Journal.findOne({id: req.params.id}, (err, journal) => {
        if (err) {
            debug('[%s] Error finding journal: %O', req.params.id, err);
            res.status(500).send({error: 'Error finding journal in database'});
            return;
        }
        if (!journal) {
            debug('[%s] No journal with this id found', req.params.id);
            res.status(500).send({error: 'No journal with this id found'});
            return;
        }

        if (req.user.orcid !== journal.owner) {
            res.status('403').send();
            return;
        }

        let domainArray = [];
        domainArray.push(req.body.url);

        domain.validateDomains(domainArray)
            .then(() => {
                domain.addDomainsToDb(domainArray)
                    .then((domains) => {
                        if (journal.domains.includes(domains[0])) {
                            res.status(400).send({error: 'domain is already in the list'});
                            return;
                        }

                        journal.domains.push(domains[0]);

                        journal.domains = journal.domains.sort();

                        journal.save(err => {
                            if (err) {
                                debug('[%s] Error updating journal: %O', journal.id, err);
                                res.status(500).send({error: 'Error updating journal'});
                                return;
                            }
                            debug('[%s] Successfully updated journal', journal.id)
                            res.status(200).send();
                            dnsBuilder.removeJournalFromDns(journal.id, config.dns.priority.journal);
                            dnsBuilder.addToDns(journal.id, config.dns.priority.journal);
                        });
                    }).catch(err => {
                    debug('[%s] Error saving domains provided by journal: %O', journal.id, err);
                    res.status(500).send({error: 'Error updating journal'});
                });
            })
            .catch(err => {
                debug('[%s] Domain is not a valid domain: %O', journal.id, err);
                res.status(400).send({error: 'Domain is not a valid domain: ' + err.toString()});
            });
    });
}

exports.removeDomain = function (req, res) {
    if (!req.isAuthenticated()) {
        res.status('401').send();
        return;
    }

    if (!req.params.id) {
        debug('Remove Domain from journal: No ID provided');
        res.status(400).send({error: 'No ID provided'});
        return;
    }

    if (req.user.level < config.user.level.manage_journal) {
        debug('[%s] User is not allowed to edit a journal', req.params.id);
        res.status(401).send();
        return;
    }

    Journal.findOne({id: req.params.id}, (err, journal) => {
        if (err) {
            debug('[%s] Error finding journal: %O', req.params.id, err);
            res.status(500).send({error: 'Error finding journal in database'});
            return;
        }
        if (!journal) {
            debug('[%s] No journal with this id found', req.params.id);
            res.status(500).send({error: 'No journal with this id found'});
            return;
        }

        if (req.user.orcid !== journal.owner) {
            res.status('403').send();
            return;
        }


        let domainArray = [];
        domainArray.push(req.body.url);

        domain.validateDomains(domainArray)
            .then(() => {
                domain.addDomainsToDb(domainArray)
                    .then((domains) => {
                        if (!journal.domains.includes(domains[0])) {
                            res.status(400).send({error: 'Domain is not in the list'});
                            return;
                        }

                        journal.domains.splice(journal.domains.indexOf(domains[0]), 1).sort();

                        journal.save(err => {
                            if (err) {
                                debug('[%s] Error updating journal: %O', journal.id, err);
                                res.status(500).send({error: 'Error updating journal'});
                                return;
                            }
                            debug('[%s] Successfully updated journal', journal.id)
                            res.status(200).send();
                            dnsBuilder.removeJournalFromDns(journal.id, config.dns.priority.journal);
                            if (req.body.domains) {
                                domain.maybeDelete(domains);
                            }
                            dnsBuilder.addToDns(journal.id, config.dns.priority.journal);
                        });
                    }).catch(err => {
                    debug('[%s] Error saving domains provided by journal: %O', journal.id, err);
                    res.status(500).send({error: 'Error updating journal'});
                });
            })
            .catch(err => {
                res.status(400).send({error: 'List of domains includes invalid domains: ' + err.toString()});
            });
    });
}

exports.addToPublisher = function (req, res) {
    if (!req.isAuthenticated()) {
        res.status('401').send();
        return;
    }

    if (!req.params.id) {
        debug('Add Journal to Publisher: No ID provided');
        res.status(400).send({error: 'No ID provided'});
        return;
    }

    if (req.user.level < config.user.level.manage_journal) {
        debug('[%s] User is not allowed to edit a journal', req.params.id);
        res.status(401).send();
        return;
    }

    Journal.findOne({id: req.params.id}, (err, journal) => {
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

exports.listJournal = function (req, res) {
    debug('Get list of journals');
    Journal.find({}, '-_id id name domains compendia', (err, journals) => {
        if (err) {
            debug('Error getting list of journals from database: %O', err);
            res.status(500).send("Error getting list of journals from database");
            return;
        }

        res.status(200).send(journals);
    })
}

exports.viewJournal = function (req, res) {
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

    Journal.findOne({id: journalId}, '-_id id name domains compendia', (err, journal) => {
        if (err) {
            debug('[%s] Error getting Journal from database: %O', journalId, err);
            res.status('500').send("Error getting Journal from database");
            return;
        } else if (!journal) {
            debug('[%s] No Journal with this ID found', journalId);
            res.status('404').send();
            return;
        }

        res.status('200').send(journal);
    });
}

exports.getJournal = function (req, res) {
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
        if (!journal) {
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

exports.getJournalDomains = function (req, res) {
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
        if (!journal) {
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

exports.getPossibleJournalsFromDomainList = function (req, res) {
    if (!req.body.domains) {
        debug('domains parameter not provided');
        res.status(400).send({error: 'domains required'});
        return;
    }

    if (!Array.isArray(req.body.domains)) {
        debug('domains parameter is not an array');
        res.status(400).send({error: 'domains not array'});
        return;
    }

    debug("Asking for possible Journals based on domain list: %O", req.body.domains);

    domain.parseDomains(req.body.domains)
        .then(domains => {
            let promiseArray = [];
            let domainIds = [];
            for (let dom of domains) {
                promiseArray.push(new Promise(async (fulfill, reject) => {
                    domain.checkExistence(dom)
                        .then(resDomain => {
                            domainIds.push(resDomain.id);
                            fulfill();
                        })
                        .catch(domain => {
                            reject(domain);
                        });
                }));
            }

            Promise.all(promiseArray)
                .then(() => {
                    Journal.find({domains: {$all: domainIds}}, (err, journals) => {
                        if (err || !journals || !Array.isArray(journals) || journals.length < 1) {
                            debug("Found no journal for queried domain list");
                            res.status('404').send("No journal found for the queried domains");
                        } else {
                            debug("Found journals for queried domain list: %O", journals);
                            res.status('200').send(journals);
                        }
                    })
                })
                .catch(err => {
                    debug("Found no journal for queried domain list");
                    res.status('404').send("No journal found for the queried domains");
                });
        });
}

exports.acceptCompendium = function (req, res) {
    if (!req.params.id) {
        res.status('400').send("No ID provided!");
        return;
    }

    if (!req.body.hasOwnProperty('compendium')) {
        res.status('400').send("No ID provided!");
        return;
    }

    if (!req.user.isAuthenticated()) {
        res.status('401').send();
        return;
    }

    let journalId = req.params.id;
    let compendiumId = req.body.compendium;

    debug("[%s] Accept compendium %s", journalId, compendiumId);

    resolve_public_link(req.params.id, (ident) => {
        let id;
        if (ident.is_link) {
            id = ident.link;
            debug('[%s] Compendium is public link', id);
        } else {
            id = ident.compendium;
        }

        Journal.findOne({id: journalId}, (err, journal) => {
            if (err || !journal) {
                debug("[%s] No journal found", journalId);
                res.status('404').send();
                return;
            }

            if (journal.owner !== req.user.orcid) {
                debug("[%s] User is not owner of this journal", journalId);
                res.status('403').send();
                return;
            }

            Compendium.findOne({id: id}, (err, compendium) => {
                if (err || !compendium) {
                    debug("[%s] No compendium found with id %s", journalId, id);
                    res.status('404').send();
                    return;
                }

                if (!journal.compendiaCandidates.includes(id)) {
                    debug("[%s] Compendium %s is not candidate for this journal", journalId, id);
                    res.status('400').send();
                    return;
                }

                let index = journal.compendiaCandidates.indexOf(id);
                journal.compendiaCandidates.splice(index, 1);
                compendium.journal = journal.id;

                journal.save(err => {
                    if (err) {
                        debug('[%s] Error saving journal: %O', journalId, err);
                        res.status(500).send({error: 'Error saving journal to database'});
                        return;
                    }
                    debug('[%s] Successfully saved journal', journalId);
                    compendium.save(err => {
                        if (err) {
                            debug('[%s] Error saving compendium: %O', journalId, err);
                            res.status(500).send({error: 'Error saving compendium to database'});
                            return;
                        }
                        debug('[%s] Successfully accepted compendium %s at this journal', journalId, id);
                        res.status(200).send();
                    });
                });
            });
        });
    });
}
