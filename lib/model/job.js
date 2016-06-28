/*
 * (C) Copyright 2016 Jan Koppe.
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
var mongoose = require('mongoose');
var Job = new mongoose.Schema({
    id :            String,
    compendium_id : String,
    steps : {
      validate_bag : {
        status :    { type: String, default: 'queued' },
        text   :    String
      },
      validate_compendium : {
        status :    { type: String, default: 'queued' },
        text   :    String
      },
      validate_dockerfile : {
        status :    { type: String, default: 'queued' },
        text   :    String
      },
      image_build : {
        status :    { type: String, default: 'queued' },
        text   :    String
      },
      image_execute : {
        status :    { type: String, default: 'queued' },
        statuscode: Number,
        text   :    String
      },
      cleanup : {
        status :    { type: String, default: 'queued' },
        text   :    String
      }
    }
});

Job.methods.updateStep = (id, step, status, text, cb) => {
  let key = 'steps.' + step;
  console.log(this);
  return this.Update({id}, {key:{status, text}}, (err) => {
    cb();
  });
};

module.exports = mongoose.model('Job', Job);
