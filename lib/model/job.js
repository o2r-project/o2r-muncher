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
var mongoose = require('mongoose');
var timestamps = require('mongoose-timestamp');

var Job = new mongoose.Schema({
  id: { type: String, default: '' },
  compendium_id: { type: String, default: '' },
  user: { type: String, default: '' },
  status: { type: String, default: '' },
  steps: {
    validate_bag: {
      status: { type: String, default: 'queued' },
      start: Date,
      end: Date,
      text: { type: String, default: '' }
    },
    generate_configuration: {
      status: { type: String, default: 'queued' },
      start: Date,
      end: Date,
      text: { type: String, default: '' }
    },
    validate_compendium: {
      status: { type: String, default: 'queued' },
      start: Date,
      end: Date,
      text: { type: String, default: '' }
    },
    /* validate_dockerfile : {
      status :    { type: String, default: 'queued' },
      start :     Date,
      end :       Date,
      text   :    { type: String, default: '' }
    },*/
    generate_manifest: {
      status: { type: String, default: 'queued' },
      start: Date,
      end: Date,
      text: { type: String, default: '' },
      manifest: { type: String, default: '' }
    },
    image_prepare: {
      status: { type: String, default: 'queued' },
      start: Date,
      end: Date,
      text: { type: String, default: '' }
    },
    image_build: {
      status: { type: String, default: 'queued' },
      start: Date,
      end: Date,
      text: { type: String, default: '' }
    },
    image_execute: {
      status: { type: String, default: 'queued' },
      start: Date,
      end: Date,
      statuscode: Number,
      text: { type: String, default: '' }
    },
    check: {
      status: { type: String, default: 'queued' },
      start: Date,
      end: Date,
      text: { type: String, default: '' },
      images: Object,
      diffHTML: { type: String, default: '' },
      errors: Object
    },
    cleanup: {
      status: { type: String, default: 'queued' },
      start: Date,
      end: Date,
      text: { type: String, default: '' }
    }
  }
});
Job.plugin(timestamps);

module.exports = mongoose.model('Job', Job);
