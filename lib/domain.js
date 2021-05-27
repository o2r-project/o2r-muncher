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
const Publisher = require('../lib/model/publisher');
const randomstring = require('randomstring');
const config = require('../config/config');

module.exports.validateDomains = function (domains) {
    return new Promise(async (fulfill, reject) => {
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
        let objects = [];
        let exists = [];
        for (let i = 0; i < domains.length; i++) {
            domains[i] = await removeProtocol(domains[i]);
            let parsedDomain = psl.parse(domains[i]);
            let subdomain = "";
            if (parsedDomain.subdomain !== "www.") {
                if (parsedDomain.subdomain.includes("www.")) {
                    let index = parsedDomain.subdomain.indexOf("www.");
                    parsedDomain.subdomain = parsedDomain.subdomain.substring(index + 4);
                }
                subdomain = parsedDomain.subdomain;
            }
            Domain.findOne({
                topLevelDomain: parsedDomain.tld,
                secondLevelDomain: parsedDomain.sld,
                subDomain: subdomain
            }, (err, doc) => {
                if (err)
                    reject(err);
                else {
                    if (!doc) {
                        objects.push(new Domain({
                            id: randomstring.generate(config.id_length),
                            topLevelDomain: parsedDomain.tld,
                            secondLevelDomain: parsedDomain.sld,
                            subDomain: subdomain
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
        Publisher.findOne({urls: domain.id}, (err, publisher) => {
            if (!publisher) {
                Domain.findByIdAndDelete(domain.id);
            }
        });
    }
}

removeProtocol = async function (domain) {
    if (domain.includes("://")) {
        let index = domain.indexOf('://');
        return domain.substring(index + 3);
    }

    return domain;
}
