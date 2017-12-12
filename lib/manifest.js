/*
 * (C) Copyright 2017 o2r project.
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
const debug = require('debug')('muncher:manifest');
const path = require('path');
const Stream = require('stream');
const Docker = require('dockerode');
const Job = require('../lib/model/job');

// setup Docker client with default options
var docker = new Docker();
debug('[%s] Docker client set up: %s', JSON.stringify(docker));

/*
 * provide access to suitable manifest generation functions
 */
module.exports.getGenerationFunction = function (file_name, callback) {
  ext = path.extname(file_name).toLowerCase();
  debug('Looking for generation function for file "%s" based on lower-cased extension "%s"', file_name, ext);
  switch (ext) {
    case '.r':
      f = module.exports.generateManifestForRScript;
      f.fName = 'generateManifestForRScript';
      callback(null, f);
      break;
    case '.rmd':
      f = module.exports.generateManifestForRMarkdown;
      f.fName = 'generateManifestForRMarkdown';
      callback(null, f);
      break;
    default:
      callback(new Error('No generation function for filename ' + file_name + ' found using extension ' + ext), null);
  }
}

/*
 * create a manifest for an R Markdown file using containerit
 */
module.exports.generateManifestForRMarkdown = function (job_id, job_dir, main_file, display_file, update, callback) {
  debug('[%s] generating manifest for [R Markdown] in %s with main file %s', job_id, job_dir, main_file);

  let binds = [
    job_dir + ':' + config.bagtainer.mountLocationInContainer // use the same location as needed in the render command
  ];
  let path_to_workdir_in_container = config.bagtainer.mountLocationInContainer;

  if (config.fs.volume) {
    debug('[%s] volume is configured, overwriting binds configuration (was %s)', job_id, JSON.stringify(binds));
    // job dir always starts with config.fs.base, mounting more than needed but limiting scope with cmd
    binds = [
      config.fs.volume + ':' + config.fs.base
    ];
    path_to_workdir_in_container = path.join(config.fs.job, job_id);
  }

  let path_to_mainfile_in_container = path.join(path_to_workdir_in_container, main_file);

  let create_options = Object.assign(
    config.containerit.default_create_options,
    {
      name: 'manifest_' + job_id,
      HostConfig: {
        Binds: binds,
        AutoRemove: config.containerit.rm
      }
    }
  );
  debug('[%s] container create options: %s', job_id, JSON.stringify(create_options));

  let start_options = {};
  debug('[%s] container start options: %s', job_id, JSON.stringify(start_options));

  // FIXME use some template mechanism instead of string concatenation

  // render command can ignore the config.vs.volume distinction
  r_render_command = 'CMD_Render(\''
    + path.join(config.bagtainer.mountLocationInContainer, main_file) + '\', '
    + 'output_dir = \'' + config.bagtainer.mountLocationInContainer + '\', '
    + 'output_file = \'' + display_file + '\')';

  // dockerfile command must use the correct files
  r_dockerfile_command = 'dockerfile('
    + 'from = \'' + path_to_mainfile_in_container + '\', '
    + 'maintainer = \'' + config.containerit.maintainer + '\', '
    + 'copy = NA, '
    + 'container_workdir = \'' + path_to_workdir_in_container + '\', '
    + 'cmd = ' + r_render_command + ')';

  // FIXME hack to remove .html .pdf files matching the main file
  main_file_without_extension = path.basename(main_file).replace(path.extname(main_file), '');
  display_file_without_extension = path.basename(display_file).replace(path.extname(display_file), '');
  r_cleanup_command = '';
  if (main_file_without_extension != display_file_without_extension) {
    r_cleanup_command = '; file.remove(\''
      + path.join(path_to_workdir_in_container, main_file_without_extension) + '.html\', \''
      + path.join(path_to_workdir_in_container, main_file_without_extension) + '.pdf\');'; // can be improved when https://github.com/o2r-project/containerit/issues/99 is implemented, use that option then
  }

  // TODO add label with o2r.generator.name=muncher, o2r.generator.version=config.version and o2r.generation.date=.., o2r.generation.job=...
  r_command = 'write(x = ' + r_dockerfile_command + ', '
    + 'file = \'' + path.join(path_to_workdir_in_container, config.bagtainer.manifestFile) + '\')'
    + r_cleanup_command;
  let cmd = [
    'R',
    '-e',
    r_command
  ];

  runContainerit(job_id, create_options, start_options, cmd, update, callback);
}

/*
 * create a manifest for an R script file using containerit
 */
module.exports.generateManifestForRScript = function (job_id, job_dir, main_file, display_file, update, callback) {
  debug('[%s] generating manifest for [R script] in %s with main file %s', job_id, job_dir, main_file);

  let binds = [
    job_dir + ':' + config.bagtainer.mountLocationInContainer // use the same location as needed in the render command
  ];
  let path_to_workdir_in_container = config.bagtainer.mountLocationInContainer;

  if (config.fs.volume) {
    debug('[%s] volume is configured, overwriting binds configuration (was %s)', job_id, JSON.stringify(binds));
    // job dir always starts with config.fs.base, mounting more than needed but limiting scope with cmd
    binds = [
      config.fs.volume + ':' + config.fs.base
    ];
    path_to_workdir_in_container = path.join(config.fs.job, job_id);
  }

  let path_to_mainfile_in_container = path.join(path_to_workdir_in_container, main_file);

  let create_options = Object.assign(
    config.containerit.default_create_options,
    {
      name: 'manifest_' + job_id,
      HostConfig: {
        Binds: [job_dir + ':' + config.bagtainer.mountLocationInContainer] // use the same location as needed in the render command
      }
    }
  );
  debug('[%s] container create options: %s', job_id, JSON.stringify(create_options));

  let start_options = {};
  debug('[%s] container start options: %s', job_id, JSON.stringify(start_options));

  // FIXME use some template mechanism instead of string concatenation
  r_render_command = 'CMD_Rscript(basename(\''
    + path_to_mainfile_in_container + '\'), vanilla = TRUE)';

  r_dockerfile_command = 'dockerfile('
    + 'from = \'' + path_to_mainfile_in_container + '\', '
    + 'maintainer = \'' + config.containerit.maintainer + '\', '
    + 'copy = NA, '
    + 'container_workdir = \'' + path_to_workdir_in_container + '\', '
    + 'cmd = ' + r_render_command + ')';

  r_command = 'setwd(\'' + path_to_workdir_in_container + '\'); write(' + r_dockerfile_command + ')'
  //+ 'file = \'' + path.join(config.bagtainer.mountLocationInContainer, config.bagtainer.manifestFile) + '\')';
  let cmd = [
    'R',
    '-e',
    r_command
  ];

  runContainerit(job_id, create_options, start_options, cmd, update, callback);
}

runContainerit = function (job_id, create_options, start_options, cmd, update, callback) {
  debug('[%s] Starting Docker container now with options and command:\n\tcreate_options: %s\n\tstart_options: %s\n\tcmd: %s',
    job_id, JSON.stringify(create_options), JSON.stringify(start_options), cmd.join(' '));

  const containerLogStream = Stream.Writable();
  containerLogStream._write = function (chunk, enc, next) {
    msg = Buffer.from(chunk).toString().trim();
    debug('[%s] [container] %s', job_id, msg);

    update('generate_manifest', null, msg, (err) => {
      if (err) debug('[%s] Error updating job log from container log stream: %s', error);

      next();
    });
  };

  docker.run(config.containerit.image, cmd, containerLogStream, create_options, start_options, (err, data, container) => {
    debug('[%s] container running: %s', job_id, JSON.stringify(container));
    if (err) {
      debug('[%s] error during manifest creation:', err);
      callback(err, null);
    } else {
      debug('[%s] broker container status code: %s', job_id, data.StatusCode);
      if (data.StatusCode === 0) {
        debug('[%s] Completed manifest creation: %s', job_id, JSON.stringify(data));

        // check if manifest was created, then return 
        callback(null, {
          data: data,
          manifest: config.bagtainer.manifestFile
        });
      } else {
        debug('[%s] Error during manifest container run: %s', job_id, JSON.stringify(data));
        container.logs({
          follow: true,
          stdout: true,
          stderr: true,
          timestamps: true
        }, function (err, stream) {
          if (err)
            debug('[%s] Error getting container logs after non-zero status code', job_id);
          else {
            stream.on('data', function (data) {
              debug('[%s] container logs      ', job_id, Buffer.from(data).toString().trim());
            });
          }
        });

        callback(new Error('Received non-zero statuscode from container: ' + JSON.stringify(data)), null);
      }
    }
  });
}