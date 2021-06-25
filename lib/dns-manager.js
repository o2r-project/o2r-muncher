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
const debug = require('debug')('muncher:dns-builder');
const Dns = require('./model/dns');
const Journal = require('./model/journal');
const Domain = require('./model/domain');
const randomstring = require('randomstring');
const fse = require('fs-extra');
const path = require('path');
const Docker = require('dockerode');
const Stream = require('stream');
const archiver = require('archiver');

let docker = new Docker();

module.exports.addToDns = function (journalId, priority) {
    Journal.findOne({id: journalId}, (err, journal) => {
        if (err) {
            debug('[%s] Could not find owner: %O', journalId, err);
        }

        Dns.findOne({'urls': journal.urls, priority: priority}, (err, dns) => {
            if (err) {
                debug('[%s] Could not find DNS Server for owner: %O', journalId, err);
            } else {
                if (!dns) {
                    debug('[%s] No existing DNS Server for this configuration, creating new one');
                    createDnsServer(journal.id, journal.urls, priority);
                } else {
                    debug('[%s] Found DNS Server for owner: %s', journalId, dns.id);
                    dns.updateOne({$addToSet: {journal: journalId}}, (err, result) => {
                        if (err)
                            debug('[%s] Could not add owner to dns server configuration: %O', journalId, result);
                        else {
                            debug('[%s] Added owner to dns server configuration: %O', journalId, result);
                        }
                    })
                }
            }
        });
    });
}

module.exports.removeJournalFromDns = function (journalId) {
    Journal.findOne({id: journalId}, (err, journal) => {
        if (err) {
            debug('[%s] Could not find owner: %O', journalId, err);
        }

        Dns.findOne({journal: journal.id}, (err, dns) => {
            if (err) {
                debug('[%s] Could not find DNS Server for owner: %O', journalId, err);
            } else {
                dns.owner.splice(dns.owner.indexOf(journal.id), 1);
                if (dns.owner.length < 1) {
                    debug('[%s] Deleting dns server because no journals are using it!', dns.id);
                    Dns.deleteOne({id: dns.id}, err => {
                        if (err)
                            debug('[%s] Could not delete dns server: %O', dns.id, err);
                        else {
                            debug('[%s] Deleted dns server!', dns.id);
                            stopAndRemoveDnsServer(dns.id);
                        }
                    })
                } else {
                    dns.save(err => {
                        if (err)
                            debug('[%s] Error updating dns server configuration: %O', dns.id, err);
                        else {
                            debug('[%s] Deleted owner %s from dns server', dns.id, journalId);
                        }
                    });
                }
            }
        });
    });
}

createDnsServer = function (journalId, journalUrls, priority) {
    let newId = randomstring.generate({
        length: config.id_length,
        capitalization: 'lowercase'
    });
    let dns = new Dns({
        id: newId,
        owner: [journalId],
        urls: journalUrls,
        priority: priority
    });

    debug('[%s] Saving new DNS Server configuration to database: %O', newId, dns);

    dns.save((err, dns) => {
        if (err) {
            debug('[%s] Could not save new DNS Server configuration to database: %O', newId, err);
        } else {
            debug('[%s] Saved new DNS Server configuration to database', newId);
            buildNewDnsServer(dns.id)
                .then(() => {
                    startNewDnsServer(dns.id);
                });
        }
    })
}

buildNewDnsServer = function (dnsId) {
    console.log("buildNewSndServer: " + dnsId);
    return new Promise((fulfill, reject) => {
        let dnsConfigPath = path.join(config.fs.dns, dnsId);
        Dns.findOne({id: dnsId}, (err, dns) => {
            if (err) {
                debug('[%s] Error searching in database: %O', dnsId, err);
                reject(err);
            } else if (!dns) {
                debug('[%s] No DNS Server configuration found!', dnsId);
                reject("No DNS Server configuration found!")
            } else {
                fse.mkdirsSync(dnsConfigPath);
                fse.writeFileSync(dnsConfigPath + '/Dockerfile', config.dns.dockerfile);
                fse.writeFileSync(dnsConfigPath + '/dnsmasq.conf', config.dns.dnsmasq.default);
                addDomainsToDns(dnsConfigPath + '/dnsmasq.conf', dns.urls)
                    .then(() => {
                        let tarballFileName = path.join(config.payload.tarball.tmpdir, dnsId + '.tar');
                        let tarballFile = fse.createWriteStream(tarballFileName);

                        let archive = archiver('tar', {
                            gzip: config.payload.tarball.gzip,
                            gzipOptions: config.payload.tarball.gzipOptions,
                            statConcurrency: config.payload.tarball.statConcurrency
                        });

                        archive.on('end', function () {
                            debug('[%s] Packing payload to file %s completed (%s total bytes)', dnsId, tarballFileName, archive.pointer());

                            docker.buildImage(tarballFileName, {t: dns.id}, (error, output) => {
                                if (error) {
                                    debug('[%s] error building image: %O', dns.id, error);
                                    reject(error);
                                } else {
                                    let lastData;
                                    output.on('data', d => {
                                        lastData = JSON.parse(d.toString('utf8'));
                                        debug('[%s] [build] %o', dns.id, lastData);
                                    });

                                    output.on('end', async () => {
                                        // check if build actually succeeded
                                        if (lastData.error) {
                                            debug('[%s] Docker image build FAILED: %O', dns.id, lastData);
                                        } else if (lastData.stream && lastData.stream.startsWith('Successfully tagged')) {
                                            debug('[%s] Created Docker image "%s", last log was "%s"', dns.id, dns.id, lastData.stream.trim());
                                            fse.unlink(tarballFileName, err1 => {
                                                if (err1)
                                                    debug('[%s] Could not remove image file after build!', dns.id);
                                                else
                                                    debug('[%s] removed image file after build!', dns.id);

                                            })
                                            fulfill(dns.id);
                                        }
                                    });
                                }
                            });
                        });

                        archive.pipe(tarballFile);

                        archive.glob(config.payload.tarball.globPattern, {
                            cwd: dnsConfigPath
                        })
                        archive.finalize();
                    });
            }
        });
    });
}

startNewDnsServer = function (dnsId) {
    console.log("startNewDnsServer");
    return new Promise((fulfill, reject) => {
        Dns.findOne({id: dnsId}, (err, dns) => {
            if (err)
                debug('[%s] Error searching in database: %O', dnsId, err);
            else if (!dns) {
                debug('[%s] No DNS Server configuration found!', dnsId);
            } else {
                let stdStream = Stream.Writable();
                stdStream._write = function (chunk, enc, next) {
                    let msg = Buffer.from(chunk).toString().trim();
                    debug('[%s] [run] %s', dnsId, msg);
                    if (msg.includes("dnsmasq: started")) {
                        let container = docker.getContainer(dns.id);
                        container.inspect(function (err, data) {
                            dns.ip = data.NetworkSettings.Networks.bridge.IPAddress;
                            dns.save();
                        });
                        fulfill();
                    }
                };

                docker.run(dns.id, [], stdStream, {name: dns.id}, {}, function (err, data, container) {
                    if (err) {
                        debug('[%s] Error starting container: %O', dns.id, err);
                        reject(err);
                    } else {
                        debug('[%s] Started container: %O', dns.id, data);
                        debug('[%s] Started container: %O', dns.id, container.id);
                    }
                });
            }
        });
    });
}

stopAndRemoveDnsServer = function (dnsId) {
    console.log("stopAndRemoveDnsServer: DnsId: " + dnsId);
    return new Promise((fulfill, reject) => {
        docker.listContainers({
            all: true
        }, (err, containers) => {

            if (containers.some(c => c.Image === dnsId)) {
                console.log("stopAndRemoveDnsServer: Found container with same image");
                for (let containerInfo of containers) {
                    if (containerInfo.Image === dnsId) {
                        console.log("stopAndRemoveDnsServer: container with same image: " + containerInfo.Image);
                        let container = docker.getContainer(containerInfo.Id);
                        container.remove({force: true}, (err, data) => {
                            if (err) {
                                debug('[%s] Error removing Container: %O', dnsId, err);
                                reject(err);
                            } else
                                debug('[%s] Removed container!', dnsId);
                            let image = docker.getImage(dnsId);
                            image.remove({force: true}, (err, data) => {
                                if (err) {
                                    debug('[%s] Error removing Image: %O', dnsId, err);
                                    reject(err);
                                } else {
                                    debug('[%s] Removed image!', dnsId);
                                    fulfill();
                                }
                            });
                        });
                    }
                }
            } else {
                fulfill();
            }
        });
    });
}

addDomainsToDns = function (filePath, domains) {
    return new Promise(async (fulfill, reject) => {
        let promiseArray = [];
        for (let domain of domains) {
            promiseArray.push(new Promise((fulfill2, reject2) => {
                Domain.findOne({id: domain}, (err, dom) => {
                    if (err) {
                        debug('[%S] Error finding domain!', domain);
                        reject2(err);
                    } else if (!dom) {
                        debug('[%S] Could not find domain!', domain);
                        reject2("No Domain with this ID found");
                    } else {
                        fse.appendFileSync(filePath, "server=/");
                        if (dom.subdomain) {
                            fse.appendFileSync(filePath, dom.subdomain + ".");
                        }
                        if (dom.secondLevelDomain) {
                            fse.appendFileSync(filePath, dom.secondLevelDomain + ".");
                        }
                        if (dom.topLevelDomain) {
                            fse.appendFileSync(filePath, dom.topLevelDomain);
                        }
                        fse.appendFileSync(filePath, "/8.8.8.8\n");
                        fulfill2();
                    }
                })
            }));
        }

        fulfill(await Promise.all(promiseArray));
    });
}

module.exports.buildNewDnsServer = buildNewDnsServer;
module.exports.startNewDnsServer = startNewDnsServer;
module.exports.stopAndRemoveDnsServer = stopAndRemoveDnsServer;
