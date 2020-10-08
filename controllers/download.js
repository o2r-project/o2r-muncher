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
const debug = require('debug')('muncher:download');
const fs = require('fs');
const Compendium = require('../lib/model/compendium');
const archiver = require('archiver');
const Timer = require('timer-machine');
const path = require('path');
const resolve_public_link = require('./link').resolve_public_link;

function imageTarballExists(compendiumPath) {
  let p = path.join(compendiumPath, config.bagtainer.imageTarballFile);
  try {
    let stats = fs.statSync(p);
    if (stats.size > 0) {
      debug('Tarball file for already exists at %s', p);
      return true;
    } else {
      debug('Tarball file exists at %s but file size is %s', p, stats.size);
      return false;
    }
  } catch (err) {
    debug('Tarball file at %s does not exist (or other file system error): %s', p, err);
    return false;
  }
}

function archiveCompendium(archive, compendiumPath, ignoreImage, ignoreMetadataFiles) {
  let glob = '**';
  let options = {};
  options.cwd = compendiumPath;
  if (ignoreImage) {
    options.ignore = [config.bagtainer.imageTarballFile];
  }
  if (!ignoreMetadataFiles) {
    options.dot = true;
  }

  debug('Putting "%s" into archive with options %s', glob, JSON.stringify(options));
  archive.glob(glob, options);
  archive.finalize();
}

returnError = (res, status, message, timer) => {
  if (timer) timer.stop();

  res.removeHeader('content-disposition'); // response is not a file
  res.setHeader('Content-Type', 'application/json');
  res.status(status).send({ error: message });
}

// throws exception if localPath does not exist
returnArchive = (res, id, includeImage, localPath, filename, archive) => {
  debug('[%s] returning archive with filename %s', id, filename); //, util.inspect(archive, {depth: 1, color: true}));

  fs.accessSync(localPath); //throws if does not exist

  let timer = new Timer();
  timer.start();

  archive.on('error', function (err) {
    returnError(res, 500, erpReq.message, timer);
  });

  archive.on('end', function () {
    timer.stop();
    debug('[%s] Wrote %d bytes in %s ms to archive', id, archive.pointer(), timer.time());
  });

  //set the archive name
  res.attachment(filename);

  //this is the streaming magic
  archive.pipe(res);

  if (includeImage) {
    if (!imageTarballExists(localPath)) {
      debug('[%s] Error: cannot include image tarball because it is missing at %s', id, localPath);
      returnError(res, 400, 'Image tarball is missing, so it cannot be included. Please ensure a successful job execution first.', timer);
    } else {
      archiveCompendium(archive, localPath, false, false);
    }
  } else {
    archiveCompendium(archive, localPath, true, false);
  }
}

parseRequest = (req, done) => {
  let includeImage = config.download.defaults.includeImage;
  if (req.query.image) {
    includeImage = (req.query.image === "true");
  }
  let gzip = false;
  if (req.query.gzip !== undefined) {
    gzip = true;
  }
  let port = "";
  if (req.port) {
    port = ':' + req.port;
  }

  resolve_public_link(req.params.id, (ident) => {
    let id = null;
    let parsed = {
      includeImage: includeImage,
      id: req.params.id,
      gzip: gzip,
      originalUrl: req.protocol + '://' + req.hostname + port + req.path,
      localPath: path.join(config.fs.compendium, ident.compendium)
    };
    
    done(parsed);
  });
}

// based on https://github.com/archiverjs/node-archiver/blob/master/examples/express.js
exports.downloadZip = (req, res) => {
  parseRequest(req, pReq => {
    debug('Download ZIP archive for %s (image? %s) with original request %s', pReq.id, pReq.includeImage, pReq.originalUrl);

    resolve_public_link(pReq.id, (ident) => {
      let id = null;
      if (ident.is_link) {
        id = ident.link;
      } else {
        id = ident.compendium;
      }

      Compendium.findOne({ id: ident.compendium }).select('id').exec((err, compendium) => {
        if (err || compendium == null) {
          returnError(res, 404, 'no compendium with this id');
        } else {
          try {
            let archive = archiver('zip', {
              comment: 'Created by o2r [' + pReq.originalUrl + ']',
              statConcurrency: config.download.defaults.statConcurrency
            });

            returnArchive(res, pReq.id, pReq.includeImage, pReq.localPath, pReq.id + '.zip', archive);
          } catch (e) {
            debug('[%s] Error: %s', pReq.id, e);
            returnError(res, 500, e.message);
          }
        }
      });
    });
  });
};

exports.downloadTar = (req, res) => {
  parseRequest(req, pReq => {
    debug('[%s] Download TAR archive (image? %s gzip? %s) with original request %s', pReq.id, pReq.includeImage, pReq.gzip, pReq.originalUrl);

    resolve_public_link(pReq.id, (ident) => {
      let id = null;
      if (ident.is_link) {
        id = ident.link;
      } else {
        id = ident.compendium;
      }

      Compendium.findOne({ id: ident.compendium }).select('id').exec((err, compendium) => {
        if (err || compendium == null) {
          res.setHeader('Content-Type', 'application/json');
          res.status(404).send({ error: 'no compendium with this id' });
        } else {
          try {
            let archive = archiver('tar', {
              gzip: pReq.gzip,
              gzipOptions: config.download.defaults.tar.gzipOptions,
              statConcurrency: config.download.defaults.statConcurrency
            });

            let filename = pReq.id + '.tar';
            if (pReq.gzip) {
              filename = filename + '.gz';
              res.set('Content-Type', 'application/gzip'); // https://superusepReq.com/a/960710
            }

            returnArchive(res, pReq.id, pReq.includeImage, pReq.localPath, filename, archive);
          } catch (e) {
            debug('[%s] Error: %s', pReq.id, e);
            returnError(res, 500, e.message);
            return;
          }
        }
      });
    });
  });
};
