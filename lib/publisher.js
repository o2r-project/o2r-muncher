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

const Publisher = require('./model/publisher');

module.exports.addJournal = function (publisherId, journalId) {
    return new Promise((fulfill, reject) => {
        Publisher.findOne({id: publisherId}, (err, publisher) => {
            if (err || !publisher) {
                reject("No publisher with this ID");
            } else {
                publisher.journalCandidates.push(journalId);
                publisher.save(err => {
                    if (err) {
                        reject("Could not add journal to publisher");
                    } else {
                        fulfill();
                    }
                })
            }
        });
    });
}
