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

const Journal = require('./model/journal');

module.exports.validateJournals = function (journalId) {
    return new Promise((fulfill, reject) => {
        if (!journalId)
            reject("No IDs provided");

        let promiseArray = [];
        for (let jId of journalId) {
            promiseArray.push(new Promise((fulfill2, reject2) => {
                Journal.findOne({id: jId}, (err, journal) => {
                    if (err || !journal)
                        reject2("No journal with this ID")
                    else
                        fulfill2();
                });
            }));
        }

        Promise.all(promiseArray)
            .then(() => {
                fulfill();
            })
            .catch((error) => {
                reject(error);
            });
    });
}

module.exports.getJournalsForPublisher = function (publisher) {
    return new Promise((fulfill, reject) => {
        let promises = [];
        let journals = [];
        for (let journal of publisher.journals) {
            promises.push(new Promise((fulfill2, reject2) => {
                Journal.findOne({id: journal}, '-_id id name domains owner compendia', (err, domain) => {
                    if (err) {
                        reject2("Error getting journal from database")
                        return;
                    }
                    if (!domain) {
                        reject2("No journal with this ID")
                        return;
                    }
                    journals.push(domain);
                    fulfill2();
                });
            }));
        }

        Promise.all(promises)
            .then(() => {
                fulfill(journals);
            })
            .catch((error) => {
                reject(error);
            });
    });
}
