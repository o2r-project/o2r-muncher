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

const debug = require('debug')('muncher:repository');
const https = require('https');
const xmlParser = require('fast-xml-parser');

exports.listRepositories = function (req, res) {
    let url = 'https://www.re3data.org/api/beta/repositories';
    if (req.query && Object.keys(req.query).length > 0) {
        debug('List repositories: Making GET request to re3data with query: %O', req.query);
        url += '?';
        for (let key in req.query) {
            if (Array.isArray(req.query[key])) {
                for (let value of req.query[key]) {
                    url = addToQuery(url, key, value);
                }
            } else {
                url = addToQuery(url, key, req.query[key]);
            }
        }
    } else
        debug('List repositories: Making GET request to re3data');

    let url2 = new URL(url);

    let re3dataReq = https.get(url2.href, result => {
        debug('Received headers from re3data: %O', result.headers);
        debug('Received status code from re3data.org: %d', result.statusCode);

        let receivedData = '';
        result.on('data', data => {
            receivedData += data
        });

        result.on('end', () => {
            debug('Successfully received repository list from re3data');
            let result = xmlParser.parse(receivedData);
            if (result.hasOwnProperty('error')) {
                let errorJson = xmlParser.parse(result, {ignoreAttributes: false})
                res.status(errorJson['error']['@_code']).send(errorJson['error']['@_message']);
            } else {
                res.status('200').send(result);
            }
        });
    });

    re3dataReq.on('error', e => {
        res.status('500').send();
        debug('ERROR during GET request to re3data: %O', e);
    });
}

exports.getRepository = function (req, res) {
    if (!req.params.id) {
        res.status('400').send("No ID provided!");
        return;
    }

    let repoXmlReq = https.get('https://www.re3data.org/api/beta/repository/' + req.params.id, result => {
        let receivedXml = '';

        result.on('data', filterData => {
            receivedXml += filterData
        });

        result.on('end', async () => {
            let repoJson = xmlParser.parse(receivedXml);
            if (repoJson.hasOwnProperty('error')) {
                let errorJson = xmlParser.parse(receivedXml, {ignoreAttributes: false})
                res.status(errorJson['error']['@_code']).send(errorJson['error']['@_message']);
            } else {
                res.status('200').send(repoJson);
            }
        });
    });

    repoXmlReq.on('error', e => {
        res.status('500').send();
        debug('ERROR during GET request to re3data: %O', e);
    });
}

exports.getRepositoryFilter = function (req, res) {
    let filter = require('../lib/re3data/re3data-metrics.json');
    res.status('200').send(filter);
}

let addToQuery = function (url, key, value) {
    if (!url.endsWith('?')) {
        url += '&'
    }

    return (url + key + '%5b%5d=' + value);
}
