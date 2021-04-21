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
const debug = require('debug')('muncher:environment');
const os = require('os');
const Docker = require('dockerode');

var docker = new Docker();

createEnvironment = async () => {
  const dockerVersion = await docker.version();

  env = {
    "architecture": [ dockerVersion.Arch ],
    "os": [{
      "name": os.platform(),  // also in dockerVersion.Os
      "version": os.release() // also in dockerVersion.KernelVersion
    }],
    "container_runtimes": [{
      "name": dockerVersion.Platform.Name,
      "api_version": dockerVersion.ApiVersion,
      "version": dockerVersion.Version
    }],
    "erc": {
      "manifest": {
        "capture_image": config.containerit.image,
        "base_image": config.containerit.baseImage,
        "memory": config.containerit.default_create_options.Memory
      },
      "execution": {
        "memory": config.bagtainer.docker.create_options.Memory
      }
    }
  };

  return env;
};

var environments = null;

createEnvironment().then(env => {
  environments = env;
  debug("Captured environment information: %o", environments);
});

module.exports.getEnvironments = () => {
  return(environments);
};
