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

const psl = require('psl');
const Domain = require('../lib/model/domain');
const Journal = require('./model/journal');
const randomstring = require('randomstring');
const config = require('../config/config');

module.exports.validateDomains = function (domains) {
    return new Promise(async (fulfill, reject) => {
        if (domains.length < 1) {
            fulfill();
        }
        let notValid = [];
        for (let i = 0; i < domains.length; i++) {
            domains[i] = await removeProtocol(domains[i]);
            if (!psl.isValid(domains[i])) {
                notValid.push(domains[i]);
            }
            if (i === domains.length - 1) {
                if (notValid.length < 1) {
                    fulfill();
                } else {
                    reject(notValid);
                }
            }
        }
    });
}

module.exports.addDomainsToDb = function (domains) {
    return new Promise(async (fulfill, reject) => {
        if (domains.length < 1) {
            fulfill([]);
        }
        let objects = [];
        let exists = [];
        let parsedDomains = await parseDomains(domains);
        for (let i = 0; i < parsedDomains.length; i++) {
            Domain.findOne({
                topLevelDomain: parsedDomains[i].topLevelDomain,
                secondLevelDomain: parsedDomains[i].secondLevelDomain,
                subDomain: parsedDomains[i].subDomain
            }, (err, doc) => {
                if (err)
                    reject(err);
                else {
                    if (!doc) {
                        objects.push(new Domain({
                            id: randomstring.generate(config.id_length),
                            topLevelDomain: parsedDomains[i].topLevelDomain,
                            secondLevelDomain: parsedDomains[i].secondLevelDomain,
                            subDomain: parsedDomains[i].subDomain
                        }))
                    } else {
                        exists.push(doc.id);
                    }
                }

                if (i === domains.length - 1) {
                    Domain.create(objects, (err1, doc) => {
                        if (err1)
                            reject(err1);
                        else {
                            fulfill(objects.map(d => d.id).concat(exists).sort());
                        }
                    });
                }
            });
        }
    });
}

module.exports.maybeDelete = function (domains) {
    for (let domain of domains) {
        Journal.findOne({domains: domain.id}, (err, journal) => {
            if (!journal) {
                Domain.findByIdAndDelete(domain.id);
            }
        });
    }
}

module.exports.getDomainsForPublisher = function (publisher) {
    return new Promise((fulfill, reject) => {
        getDomains(publisher)
            .then(res => {
                fulfill(res);
            })
            .catch(err => {
                reject(err);
            });
    });
}

module.exports.getDomainsForJournal = function (journal) {
    return new Promise((fulfill, reject) => {
        getDomains(journal)
            .then(res => {
                fulfill(res);
            })
            .catch(err => {
                reject(err);
            });
    });
}

module.exports.checkExistence = function (domain) {
    return new Promise((fulfill, reject) => {
        Domain.findOne({
            topLevelDomain: domain.topLevelDomain,
            secondLevelDomain: domain.secondLevelDomain,
            subDomain: domain.subDomain
        }, (err, resDomain) => {
            if (err || !resDomain)
                reject(domain);
            else {
                fulfill(resDomain);
            }
        })
    });
}

getDomains = function (object) {
    return new Promise((fulfill, reject) => {
        let promises = [];
        let domains = [];
        for (let domain of object.domains) {
            promises.push(new Promise((fulfill2, reject2) => {
                Domain.findOne({id: domain}, '-_id id topLevelDomain secondLevelDomain subDomain', (err, domain) => {
                    if (err) {
                        reject2("Error getting domain from database")
                        return;
                    }
                    if (!domain) {
                        reject2("No domain with this ID")
                        return;
                    }
                    domains.push(domain);
                    fulfill2();
                });
            }));
        }

        Promise.all(promises)
            .then(() => {
                fulfill(domains);
            })
            .catch((error) => {
                reject(error);
            });
    });
}

removeProtocol = async function (domain) {
    if (domain.includes("://")) {
        let index = domain.indexOf('://');
        return domain.substring(index + 3);
    }

    return domain;
}

parseDomains = function (domains) {
    return new Promise((fulfill, reject) => {
        let promiseArray = [];
        let parsedDomains = [];
        for (let domain of domains) {
            promiseArray.push(new Promise(async (fulfill2, reject2) => {
                domain = await removeProtocol(domain);
                let parsedDomain = psl.parse(domain);
                let subdomain = "";
                if (parsedDomain.subdomain && parsedDomain.subdomain !== "www") {
                    if (parsedDomain.subdomain.includes("www")) {
                        let index = parsedDomain.subdomain.indexOf("www");
                        parsedDomain.subdomain = parsedDomain.subdomain.substring(index + 4);
                    }
                    subdomain = parsedDomain.subdomain;
                }
                parsedDomains.push({
                    topLevelDomain: parsedDomain.tld,
                    secondLevelDomain: parsedDomain.sld,
                    subDomain: subdomain
                });
                fulfill2();
            }));
        }

        Promise.all(promiseArray)
            .then(() => {
                fulfill(parsedDomains);
            })
            .catch((error) => {
                reject(error);
            });
    });
}

module.exports.parseDomains = parseDomains;
