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
const Publisher = require('./model/publisher');
const Domain = require('./model/domain');
const randomstring = require('randomstring');
const fse = require('fs-extra');
const path = require('path');
const Docker = require('dockerode');
const Stream = require('stream');
const archiver = require('archiver');

let docker = new Docker();

module.exports.addPublisherToDns = function (publisherId) {
    Publisher.findOne({id: publisherId}, (err, publisher) => {
        if (err) {
            debug('[%s] Could not find publisher: %O', publisherId, err);
        }

        Dns.findOne({'urls': publisher.urls}, (err, dns) => {
            if (err) {
                debug('[%s] Could not find DNS Server for publisher: %O', publisherId, err);
            } else {
                if (!dns) {
                    debug('[%s] No existing DNS Server for this configuration, creating new one');
                    createDnsServer(publisher.id, publisher.urls);
                } else {
                    debug('[%s] Found DNS Server for publisher: %s', publisherId, dns.id);
                    dns.updateOne({$addToSet: {publisher: publisherId}}, (err, result) => {
                        if (err)
                            debug('[%s] Could not add publisher to dns server configuration: %O', publisherId, result);
                        else {
                            debug('[%s] Added publisher to dns server configuration: %O', publisherId, result);
                        }
                    })
                }
            }
        });
    });
}

module.exports.removePublisherFromDns = function(publisherId) {
    Publisher.findOne({id: publisherId}, (err, publisher) => {
        if (err) {
            debug('[%s] Could not find publisher: %O', publisherId, err);
        }

        Dns.findOne({urls: publisher.id}, (err, dns) => {
            if (err) {
                debug('[%s] Could not find DNS Server for publisher: %O', publisherId, err);
            } else {
                dns.publisher = dns.publisher.splice(dns.publisher.indexOf(publisher.id), 1);
                if (dns.publisher.length < 1) {
                    debug('[%s] Deleting dns server because no publishers are using it!', dns.id);
                    Dns.deleteOne({id: dns.id}, err => {
                        if (err)
                            debug('[%s] Could not delete dns server: %O', dns.id, err);
                        else {
                            debug('[%s] Deleted dns server!');
                            stopAndRemoveDnsServer(dns.id);
                        }
                    })
                }
                dns.save(err => {
                    if (err)
                        debug('[%s] Error updating dns server configuration: %O', dns.id, err);
                    else {
                        debug('[%s] Deleted publisher %s from dns server', dns.id, publisherId);
                    }
                });
            }
        });
    });
}

createDnsServer = function (publisherId, publisherUrls) {
    let newId = randomstring.generate({
        length: config.id_length,
        capitalization: 'lowercase'
    });
    let dns = new Dns({
        id: newId,
        publisher: [publisherId],
        urls: publisherUrls
    });

    debug('[%s] Saving new DNS Server configuration to database: %O', newId, dns);

    dns.save((err, dns) => {
        if (err) {
            debug('[%s] Could not save new DNS Server configuration to database: %O', newId, err);
        } else {
            debug('[%s] Saved new DNS Server configuration to database', newId);
            buildNewDnsServer(dns.id);
        }
    })
}

buildNewDnsServer = function (dnsId) {
    let dnsConfigPath = path.join(config.fs.dns, dnsId);
    Dns.findOne({id: dnsId}, (err, dns) => {
        if (err)
            debug('[%s] Error searching in database: %O', dnsId, err);
        else if (!dns) {
            debug('[%s] No DNS Server configuration found!', dnsId);
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

                    // on stream closed we can fulfill the promise
                    archive.on('end', function () {
                        debug('[%s] Packing payload to file %s completed (%s total bytes)', dnsId, tarballFileName,  archive.pointer());

                        docker.buildImage(tarballFileName, {t: dns.id}, (error, output) => {
                            if (error) {
                                debug('[%s] error building image: %O', dns.id, error);
                            } else {
                                let lastData;
                                output.on('data', d => {
                                    lastData = JSON.parse(d.toString('utf8'));
                                    debug('[%s] [build] %o', dns.id, lastData);
                                });

                                output.on('end', () => {
                                    // check if build actually succeeded
                                    if (lastData.error) {
                                        debug('[%s] Docker image build FAILED: %O', dns.id, lastData);
                                    } else if (lastData.stream && lastData.stream.startsWith('Successfully tagged')) {
                                        debug('[%s] Created Docker image "%s", last log was "%s"', dns.id, dns.id, lastData.stream.trim());
                                        fse.unlink(tarballFileName, err1 => {
                                            if (err1)
                                                debug('[%s] Could not remove image file after build!');
                                            else
                                                debug('[%s] removed image file after build!');

                                        })

                                        startNewDnsServer(dns.id);
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
}

startNewDnsServer = function (dnsId) {
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
                    container.inspect(function(err, data) {
                        debug('[%s] container IP address: %O', dns.id, data.NetworkSettings.Networks.bridge.IPAddress);
                        dns.ip = data.NetworkSettings.Networks.bridge.IPAddress;
                        dns.save();
                    });
                }
            };

            docker.run(dns.id, [], stdStream, {name: dns.id}, {}, function (err, data, container) {
                if (err)
                    debug('[%s] Error starting container: %O', dns.id, err);
                else {
                    debug('[%s] Started container: %O', dns.id, data);
                    debug('[%s] Started container: %O', dns.id, container.id);
                }
            });
        }
    });
}

stopAndRemoveDnsServer = function (dnsId) {
    let container = docker.getContainer(dnsId);
    container.remove({force: true}, (err, data) => {
        if (err)
            debug('[%s] Error removing Container: %O', dnsId, err);
        else
            debug('[%s] Removed container!', dnsId);
        let image = docker.getImage(dnsId);
        image.remove({force: true}, (err, data) => {
            if (err)
                debug('[%s] Error removing Image: %O', dnsId, err);
            else {
                debug('[%s] Removed image!', dnsId);
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
