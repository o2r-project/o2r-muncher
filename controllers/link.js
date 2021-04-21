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
const debug = require('debug')('muncher:link');
const randomstring = require('randomstring');

const Compendium = require('../lib/model/compendium');
const PublicLink = require('../lib/model/link');

exports.listLinks = (req, res) => {
  var fields = [ 'id', 'compendium', 'user' ];

  if (!req.isAuthenticated()) {
    res.status(401).send({ error: 'user is not authenticated' });
    return;
  }
  if (req.user.level < config.user.level.manage_links) {
    res.status(403).send({ error: 'not allowed' });
    return;
  }

  PublicLink.find({}).select(fields).lean().exec((err, links) => {
    if (err) {
      res.status(500).send({ error: 'link query failed' });
    } else {
      if (links.length < 1) {
        debug('Search for links has empty result: %o', req);
      }

      answer = {};
      answer.results = links.map((link) => {
        return {
          id: link.id,
          compendium_id: link.compendium,
          user: link.user
        };
      });

      res.status(200).send(answer);
    }
  });
};

exports.viewCompendiumLink = (req, res) => {
  let id = req.params.id;
  var fields = [ 'id', 'compendium', 'user' ];

  if (!req.isAuthenticated()) {
    res.status(401).send({ error: 'user is not authenticated' });
    return;
  }
  if (req.user.level < config.user.level.manage_links) {
    res.status(403).send({ error: 'not allowed' });
    return;
  }

  PublicLink.findOne({ compendium: id }).select(fields).lean().exec((err, link) => {
    // eslint-disable-next-line no-eq-null, eqeqeq
    if (err || link == null) {
      debug('[%s] error retrieving link: %s', id, err);
      res.status(404).send({ error: 'link not found' });
    } else {
      debug('[%s] Found link %s', id, link.id);
      answer = {
        id: link.id,
        compendium_id: link.compendium,
        user: link.user
      };

      res.status(200).send(answer);
    }
  });
};

exports.createLink = (req, res) => {
  let id = req.params.id;

  if (!req.isAuthenticated()) {
    res.status(401).send({ error: 'user is not authenticated' });
    return;
  }
  if (req.user.level < config.user.level.manage_links) {
    res.status(403).send({ error: 'not allowed' });
    return;
  }
  let user_id = req.user.orcid;
  debug('User %s creates link for %s', user_id, id);
  
  let link_id = randomstring.generate(config.link_length);

  try {
    Compendium.findOne({ id }).select(['id', 'candidate']).lean().exec((err, compendium) => {
      // eslint-disable-next-line no-eq-null, eqeqeq
      if (err || compendium == null) {
        res.status(404).send({ error: 'no compendium with this id' });
      } else {
        // don't create link for published compendium
        if (compendium.candidate) {
          // see if there is already a link for the compendium, if yes then return it, if not then create one
          PublicLink.findOne({ compendium: id }).exec((err, link) => {
            if (err) {
              debug('Error querying links: %O', err);
              res.status(500).send({ error: 'error querying links' });
            } else if (link == null) {
              debug('No link for compendium %s yet, creating one', id);

              linkData = {
                id: link_id,
                user: user_id,
                compendium: id
              };
              var newLink = new PublicLink(linkData);
      
              newLink.save(err => {
                if (err) {
                  debug('[%s] error saving new link for %s by user %s', id, user_id);
                  throw new Error('error creating link');
                } else {
                  res.status(200).send(linkData);
                  debug("[%s] Request complete and response sent; link %s created.", id, link_id);
                }
              });
            } else {
              res.status(200).send({
                id: link.id,
                compendium_id: link.compendium,
                user: link.user
              });
            }
          });
        } else {
          // not a candidate
          res.status(400).send({ 'error': 'compendium is not a candidate' });
        }
      }
    });
  } catch (err) {
    debug('Internal error creating link: %O', err);
    res.status(500).send({ 'error': err.message });
  }
};

exports.deleteLink = (req, res) => {
  let id = req.params.id;

  if (!req.isAuthenticated()) {
    res.status(401).send({ error: 'user is not authenticated' });
    return;
  }
  if (req.user.level < config.user.level.manage_links) {
    res.status(403).send({ error: 'not allowed' });
    return;
  }
  debug('User %s deletes link for %s', req.user.orcid, id);
  
  try {
    PublicLink.findOne({ compendium: id }).exec((err, link) => {
      if (err) {
        debug('Error querying link: %O', err);
        res.status(500).send({ error: 'error querying link' });
      } else if (link == null) {
        debug('No link for compendium %s', id);
        res.status(400).send({error: 'no link found'});
      } else {
        link.remove((err, removed) => {
          if (err) {
            debug('Error deleting link: %O', err);
            res.status(500).send({ error: 'error deleting link' });
          } else {
            debug('User %s removed link: %O', req.user.id, removed);
            res.sendStatus(204);
          }
        });
      }
    });
  } catch (err) {
    debug('Internal error deleting link: %O', err);
    res.status(500).send({ error: err.message });
  }
};

/*
 * is a given compendium ID a public link? if so get the actual id
 */
exports.resolve_public_link = function (id, callback) {
  debug('Checking public link %s', id);

  PublicLink.findOne({ id }).lean().exec((err, link) => {
    // eslint-disable-next-line no-eq-null, eqeqeq
    if (err || link == null) {
      debug('%s is not a public link.', id);
      callback({ is_link: false, compendium: id });
    } else {
      debug('Public link %s used for compendium %s', id, link.compendium);
      callback({
        is_link: true,
        link: link.id,
        compendium: link.compendium
      });
    }
  });
}
