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

let Dns = require('../lib/model/dns');
let dnsManager = require('../lib/dns-manager');
const debug = require('debug')('muncher:dns');

exports.startServersOnStartup = function () {
    return new Promise((fulfill, reject) => {
        debug("Starting DNS servers on startup");
        let promiseArray = [];
        Dns.find((err, docs) => {
            if (err) {
                debug("Error searching for DNS Server configurations: %O", err);
                reject(err);
            } else if (docs.length < 1) {
                debug("No DNS Server configurations in database");
                reject("No DNS configurations in database");
            } else {
                for (let dns of docs) {
                    promiseArray.push(new Promise((fulfill2, reject2) => {
                        debug("Starting DNS Server: %s", dns.id);
                        dnsManager
                            .stopAndRemoveDnsServer(dns.id)
                            .then(() => {
                                buildNewDnsServer(dns.id)
                                    .then(dnsManager.startNewDnsServer)
                                    .then(() => {
                                        debug("Successfully started DNS Server: %s", dns.id);
                                        fulfill2();
                                    })
                                    .catch((err) => {
                                        debug("Error starting DNS Server: %O", err);
                                        reject2(err);
                                    });
                            });
                    }));
                }
            }
            Promise.all(promiseArray)
                .then(() => {
                    debug("Successfully started all DNS Servers");
                    fulfill();
                })
                .catch((error) => {
                    debug("Error starting DNS Servers: %O", error);
                    reject(error);
                });
        });
    });
}
