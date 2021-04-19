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
const slack = require('slack');
const debug = require('debug')('muncher:load:slack');
const request = require('request');
const os = require('os');

// start listening to the slack team associated to the token
exports.start = function (err, done) {
  if (config.slack.verification_token === undefined || config.slack.bot_token === undefined) {
    debug('Slack bot token and verification token not properly configured: %s | %s', config.slack.bot_token, config.slack.verification_token);
    err(new Error('Required Slack environment variables not available.'));
    return;
  }

  bot2r = slack.rtm.client();

  bot2r.started(function (payload) {
    debug('Started... payload from rtm.start: %o', payload);
  });

  bot2r.channel_joined(function (payload) {
    debug('payload from channel joined: %o', payload);
  });

  bot2r.message(function (payload) {
    debug('[message] Incoming message: %o', payload);
  });

  bot2r.goodbye(function (payload) {
    debug('[goodbye] Server wants to close the connection soon... %o', payload);
  });

  bot2r.hello(function (payload) {
    debug('[hello] connected to server: %s', payload);

    joinChannelAndSayHello(err, done);
  });

  // connect!
  bot2r.listen({ token: config.slack.bot_token });
};

joinChannelAndSayHello = function (err, done) {

  slack.chat.postMessage({
    token: config.slack.bot_token,
    channel: config.slack.channel.status,
    text: 'I am now online running on host `' + os.hostname() + '`.'
  }, (e, data) => {
    if (e) {
      debug(e);
      err(e);
    }
    else {
      debug('Response on posting startup message to %s: %o', config.slack.channel.status, data);
      done(data);
    }
  });
}

exports.newDirectUpload = function (compendium_url, orcid) {
  let user_link = 'https://orcid.org/' + orcid;
  debug('Notifying about new compendium %s for user %s', compendium_url, orcid);

  slack.chat.postMessage({
    token: config.slack.bot_token,
    channel: config.slack.channel.loadEvents,
    text: '<!here> A new compendium was just uploaded by user ' + user_link + ' :\n*' + compendium_url + ' *'
  }, (err, data) => {
    if (err) {
      debug('Error posting new direct upload message: %s', err);
    }
    else {
      if (data.ok) {
        debug('Message send was OK');
      } else {
        debug('Message send NOT OK. Response for posting new direct upload message: %o', data);
      }
    }
  });
};

exports.newShareUpload = function (compendium_url, orcid, share_url) {
  let user_link = 'https://orcid.org/' + orcid;
  debug('Notifying about new compendium %s for user %s based on %s', compendium_url, orcid, share_url);

  slack.chat.postMessage({
    token: config.slack.bot_token,
    channel: config.slack.channel.loadEvents,
    text: '<!here> A new compendium was just uploaded by user ' + user_link + ' :\n*' + compendium_url + ' * using a _public share_ at *' + share_url + ' *'
  }, (err, data) => {
    if (err) {
      debug('Error posting new share upload message: %s', err);
    }
    else {
      if (data.ok) {
        debug('Message send was OK');
      } else {
        debug('Message send NOT OK. Response for posting new share upload message: %o', data);
      }
    }
  });
};
