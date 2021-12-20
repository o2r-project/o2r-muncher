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

/* eslint-env mocha */
const assert = require('chai').assert;
const request = require('request');
const path = require('path');
const mongojs = require('mongojs');
const fs = require('fs');
const config = require('../config/config');
const chai = require('chai');
chai.use(require('chai-datetime'));
const createCompendiumPostRequest = require('./util').createCompendiumPostRequest;
const publishCandidate = require('./util').publishCandidate;

require("./setup");
const {joinURL} = require("webdav/dist/node/tools/url");

const cookie_o2r = 's:C0LIrsxGtHOGHld8Nv2jedjL4evGgEHo.GMsWD5Vveq0vBt7/4rGeoH5Xx7Dd2pgZR9DvhKCyDTY';
const cookie_plain = 's:yleQfdYnkh-sbj9Ez--_TWHVhXeXNEgq.qRmINNdkRuJ+iHGg5woRa9ydziuJ+DzFG9GnAZRvaaM';
const cookie_editor = 's:xWHihqZq6jEAObwbfowO5IwdnBxohM7z.VxqsRC5A1VqJVspChcxVPuzEKtRE+aKLF8k3nvCcZ8g';
const cookie_admin = 's:hJRjapOTVCEvlMYCb8BXovAOi2PEOC4i.IEPb0lmtGojn2cVk2edRuomIEanX6Ddz87egE5Pe8UM';

describe('Create publisher', () => {
    var db = mongojs('localhost/muncher', ['publisher']);

    before(function (done) {
        db.publisher.drop(function () {
            done();
        });
    });

    after(function (done) {
        db.close();
        done();
    });

    describe('as admin', () => {
        it('should return status code 200', function (done) {
            j = request.jar();
            ck = request.cookie('connect.sid=' + cookie_admin);
            j.setCookie(ck, global.test_host);

            request({
                uri: global.test_host + '/api/v1/publisher',
                method: 'POST',
                header: {
                    "content-type": "application/json"
                },
                jar: j,
                json: {
                    name: "first",
                    domains: ["www.doi.pangaea.de", "www.zenodo.com"]
                }
            }, (err, res) => {
                assert.ifError(err);
                assert.equal(res.statusCode, 200);
                done();
            });
        });

        it('should return status code 400 without domains parameter', function (done) {
            j = request.jar();
            ck = request.cookie('connect.sid=' + cookie_admin);
            j.setCookie(ck, global.test_host);

            request({
                uri: global.test_host + '/api/v1/publisher',
                method: 'POST',
                header: {
                    "content-type": "application/json"
                },
                jar: j,
                json: {
                    name: "first",
                }
            }, (err, res) => {
                assert.ifError(err);
                assert.equal(res.statusCode, 400);
                done();
            });
        });

        it('should return status code 400 without name parameter', function (done) {
            j = request.jar();
            ck = request.cookie('connect.sid=' + cookie_admin);
            j.setCookie(ck, global.test_host);

            request({
                uri: global.test_host + '/api/v1/publisher',
                method: 'POST',
                header: {
                    "content-type": "application/json"
                },
                jar: j,
                json: {
                    domains: ["www.doi.pangaea.de", "www.zenodo.com"]
                }
            }, (err, res) => {
                assert.ifError(err);
                assert.equal(res.statusCode, 400);
                done();
            });
        });
    });

    describe('as editor', () => {
        it('should return status code 401', function (done) {
            j = request.jar();
            ck = request.cookie('connect.sid=' + cookie_editor);
            j.setCookie(ck, global.test_host);

            request({
                uri: global.test_host + '/api/v1/publisher',
                method: 'POST',
                header: {
                    "content-type": "application/json"
                },
                jar: j,
                json: {
                    name: "first",
                    domains: ["www.doi.pangaea.de", "www.zenodo.com"]
                }
            }, (err, res) => {
                assert.ifError(err);
                assert.equal(res.statusCode, 401);
                done();
            });
        });
    });

    describe('as a known user', () => {
        it('should return status code 401', function (done) {
            j = request.jar();
            ck = request.cookie('connect.sid=' + cookie_o2r);
            j.setCookie(ck, global.test_host);

            request({
                uri: global.test_host + '/api/v1/publisher',
                method: 'POST',
                header: {
                    "content-type": "application/json"
                },
                jar: j,
                json: {
                    name: "first",
                    domains: ["www.doi.pangaea.de", "www.zenodo.com"]
                }
            }, (err, res) => {
                assert.ifError(err);
                assert.equal(res.statusCode, 401);
                done();
            });
        });
    });

    describe('as a user', () => {
        it('should return status code 401', function (done) {
            j = request.jar();
            ck = request.cookie('connect.sid=' + cookie_plain);
            j.setCookie(ck, global.test_host);

            request({
                uri: global.test_host + '/api/v1/publisher',
                method: 'POST',
                header: {
                    "content-type": "application/json"
                },
                jar: j,
                json: {
                    name: "first",
                    domains: ["www.doi.pangaea.de", "www.zenodo.com"]
                }
            }, (err, res) => {
                assert.ifError(err);
                assert.equal(res.statusCode, 401);
                done();
            });
        });
    });
});

describe('Add domain to publisher', () => {
    var db = mongojs('localhost/muncher', ['publisher']);

    before(function (done) {
        db.publisher.drop(function () {
            done();
        });
    });

    after(function (done) {
        db.close();
        done();
    });

    describe('as admin', () => {
        let publisher_id = null;
        before(function (done) {
            j = request.jar();
            ck = request.cookie('connect.sid=' + cookie_admin);
            j.setCookie(ck, global.test_host);

            request({
                uri: global.test_host + '/api/v1/publisher/',
                method: 'POST',
                header: {
                    "content-type": "application/json"
                },
                jar: j,
                json: {
                    name: "first",
                    domains: ["www.doi.pangaea.de", "www.zenodo.com"]
                }
            }, (err, res, body) => {
                publisher_id = body.id;
                done();
            });
        });

        it('should return status code 200', function (done) {
            j = request.jar();
            ck = request.cookie('connect.sid=' + cookie_admin);
            j.setCookie(ck, global.test_host);

            request({
                uri: global.test_host + '/api/v1/publisher/' + publisher_id + '/adddomain',
                method: 'PUT',
                header: {
                    "content-type": "application/json"
                },
                jar: j,
                json: {
                    url: "google.com",
                }
            }, (err, res) => {
                assert.ifError(err);
                assert.equal(res.statusCode, 200);
                done();
            });
        });
    });

    describe('as unauthorised user', () => {
        let publisher_id = null;
        before(function (done) {
            j = request.jar();
            ck = request.cookie('connect.sid=' + cookie_admin);
            j.setCookie(ck, global.test_host);

            request({
                uri: global.test_host + '/api/v1/publisher/',
                method: 'POST',
                header: {
                    "content-type": "application/json"
                },
                jar: j,
                json: {
                    name: "first",
                    domains: ["www.doi.pangaea.de", "www.zenodo.com"]
                }
            }, (err, res, body) => {
                publisher_id = body.id;
                done();
            });
        });

        it('should return status code 401', function (done) {
            j = request.jar();
            ck = request.cookie('connect.sid=' + cookie_editor);
            j.setCookie(ck, global.test_host);

            request({
                uri: global.test_host + '/api/v1/publisher/' + publisher_id + '/adddomain',
                method: 'PUT',
                header: {
                    "content-type": "application/json"
                },
                jar: j,
                json: {
                    url: "google.com",
                }
            }, (err, res) => {
                assert.ifError(err);
                assert.equal(res.statusCode, 401);
                done();
            });
        });
    });
});

describe('Remove domain from publisher', () => {
    var db = mongojs('localhost/muncher', ['publisher']);

    before(function (done) {
        db.publisher.drop(function () {
            done();
        });
    });

    after(function (done) {
        db.close();
        done();
    });

    describe('as admin', () => {
        let publisher_id = null;
        before(function (done) {
            j = request.jar();
            ck = request.cookie('connect.sid=' + cookie_admin);
            j.setCookie(ck, global.test_host);

            request({
                uri: global.test_host + '/api/v1/publisher/',
                method: 'POST',
                header: {
                    "content-type": "application/json"
                },
                jar: j,
                json: {
                    name: "first",
                    domains: ["www.doi.pangaea.de", "www.zenodo.com"]
                }
            }, (err, res, body) => {
                publisher_id = body.id;
                done();
            });
        });

        it('should return status code 200', function (done) {
            j = request.jar();
            ck = request.cookie('connect.sid=' + cookie_admin);
            j.setCookie(ck, global.test_host);

            request({
                uri: global.test_host + '/api/v1/publisher/' + publisher_id + '/removedomain',
                method: 'PUT',
                header: {
                    "content-type": "application/json"
                },
                jar: j,
                json: {
                    url: "www.doi.pangaea.de",
                }
            }, (err, res) => {
                assert.ifError(err);
                assert.equal(res.statusCode, 200);
                done();
            });
        });
    });

    describe('as unauthorised user', () => {
        let publisher_id = null;
        before(function (done) {
            j = request.jar();
            ck = request.cookie('connect.sid=' + cookie_admin);
            j.setCookie(ck, global.test_host);

            request({
                uri: global.test_host + '/api/v1/publisher/',
                method: 'POST',
                header: {
                    "content-type": "application/json"
                },
                jar: j,
                json: {
                    name: "first",
                    domains: ["www.doi.pangaea.de", "www.zenodo.com"]
                }
            }, (err, res, body) => {
                publisher_id = body.id;
                done();
            });
        });

        it('should return status code 401', function (done) {
            j = request.jar();
            ck = request.cookie('connect.sid=' + cookie_editor);
            j.setCookie(ck, global.test_host);

            request({
                uri: global.test_host + '/api/v1/publisher/' + publisher_id + '/removedomain',
                method: 'PUT',
                header: {
                    "content-type": "application/json"
                },
                jar: j,
                json: {
                    url: "www.doi.pangaea.de",
                }
            }, (err, res) => {
                assert.ifError(err);
                assert.equal(res.statusCode, 401);
                done();
            });
        });
    });
});

describe('Add journal to publisher', () => {
    var db = mongojs('localhost/muncher', ['publisher journal']);

    before(function (done) {
        db.publisher.drop(function () {
            db.journal.drop(function () {
                done();
            });
        });
    });

    after(function (done) {
        db.close();
        done();
    });

    describe('as admin', () => {
        let publisher_id = null;
        let journal_id = null;
        before(function (done) {
            j = request.jar();
            ck = request.cookie('connect.sid=' + cookie_admin);
            j.setCookie(ck, global.test_host);

            request({
                uri: global.test_host + '/api/v1/publisher/',
                method: 'POST',
                header: {
                    "content-type": "application/json"
                },
                jar: j,
                json: {
                    name: "first",
                    domains: ["www.doi.pangaea.de", "www.zenodo.com"]
                }
            }, (err, res, body) => {
                publisher_id = body.id;
                request({
                    uri: global.test_host + '/api/v1/journal/',
                    method: 'POST',
                    header: {
                        "content-type": "application/json"
                    },
                    jar: j,
                    json: {
                        name: "first",
                        domains: ["www.doi.pangaea.de", "www.zenodo.com"]
                    }
                }, (err, res, body) => {
                    journal_id = body.id;
                    done();
                });
            });
        });

        it('should return status code 200', function (done) {
            j = request.jar();
            ck = request.cookie('connect.sid=' + cookie_admin);
            j.setCookie(ck, global.test_host);

            request({
                uri: global.test_host + '/api/v1/publisher/' + publisher_id + '/addjournal',
                method: 'PUT',
                header: {
                    "content-type": "application/json"
                },
                jar: j,
                json: {
                    journalId: journal_id,
                }
            }, (err, res) => {
                assert.ifError(err);
                assert.equal(res.statusCode, 200);
                done();
            });
        });
    });

    describe('as unauthorised user', () => {
        let publisher_id = null;
        let journal_id = null;
        before(function (done) {
            j = request.jar();
            ck = request.cookie('connect.sid=' + cookie_admin);
            j.setCookie(ck, global.test_host);

            request({
                uri: global.test_host + '/api/v1/publisher/',
                method: 'POST',
                header: {
                    "content-type": "application/json"
                },
                jar: j,
                json: {
                    name: "first",
                    domains: ["www.doi.pangaea.de", "www.zenodo.com"]
                }
            }, (err, res, body) => {
                publisher_id = body.id;
                request({
                    uri: global.test_host + '/api/v1/journal/',
                    method: 'POST',
                    header: {
                        "content-type": "application/json"
                    },
                    jar: j,
                    json: {
                        name: "first",
                        domains: ["www.doi.pangaea.de", "www.zenodo.com"]
                    }
                }, (err, res, body) => {
                    journal_id = body.id;
                    done();
                });
            });
        });

        it('should return status code 401', function (done) {
            j = request.jar();
            ck = request.cookie('connect.sid=' + cookie_editor);
            j.setCookie(ck, global.test_host);

            request({
                uri: global.test_host + '/api/v1/publisher/' + publisher_id + '/addjournal',
                method: 'PUT',
                header: {
                    "content-type": "application/json"
                },
                jar: j,
                json: {
                    journalId: journal_id,
                }
            }, (err, res) => {
                assert.ifError(err);
                assert.equal(res.statusCode, 401);
                done();
            });
        });
    });
});

describe('Remove journal from publisher', () => {
    var db = mongojs('localhost/muncher', ['publisher journal']);

    before(function (done) {
        db.publisher.drop(function () {
            db.journal.drop(function () {
                done();
            });
        });
    });

    after(function (done) {
        db.close();
        done();
    });

    describe('as admin', () => {
        let publisher_id = null;
        let journal_id = null;
        before(function (done) {
            j = request.jar();
            ck = request.cookie('connect.sid=' + cookie_admin);
            j.setCookie(ck, global.test_host);

            request({
                uri: global.test_host + '/api/v1/publisher/',
                method: 'POST',
                header: {
                    "content-type": "application/json"
                },
                jar: j,
                json: {
                    name: "first",
                    domains: ["www.doi.pangaea.de", "www.zenodo.com"]
                }
            }, (err, res, body) => {
                publisher_id = body.id;
                request({
                    uri: global.test_host + '/api/v1/journal/',
                    method: 'POST',
                    header: {
                        "content-type": "application/json"
                    },
                    jar: j,
                    json: {
                        name: "first",
                        domains: ["www.doi.pangaea.de", "www.zenodo.com"]
                    }
                }, (err, res, body) => {
                    journal_id = body.id;
                    request({
                        uri: global.test_host + '/api/v1/publisher/' + publisher_id + '/addjournal',
                        method: 'PUT',
                        header: {
                            "content-type": "application/json"
                        },
                        jar: j,
                        json: {
                            journalId: journal_id
                        }
                    }, () => {
                        done();
                    });
                });
            });
        });

        it('should return status code 200', function (done) {
            j = request.jar();
            ck = request.cookie('connect.sid=' + cookie_admin);
            j.setCookie(ck, global.test_host);

            request({
                uri: global.test_host + '/api/v1/publisher/' + publisher_id + '/removejournal',
                method: 'PUT',
                header: {
                    "content-type": "application/json"
                },
                jar: j,
                json: {
                    journalId: journal_id,
                }
            }, (err, res) => {
                assert.ifError(err);
                assert.equal(res.statusCode, 200);
                done();
            });
        });
    });

    describe('as unauthorised user', () => {
        let publisher_id = null;
        let journal_id = null;
        before(function (done) {
            j = request.jar();
            ck = request.cookie('connect.sid=' + cookie_admin);
            j.setCookie(ck, global.test_host);

            request({
                uri: global.test_host + '/api/v1/publisher/',
                method: 'POST',
                header: {
                    "content-type": "application/json"
                },
                jar: j,
                json: {
                    name: "first",
                    domains: ["www.doi.pangaea.de", "www.zenodo.com"]
                }
            }, (err, res, body) => {
                publisher_id = body.id;
                request({
                    uri: global.test_host + '/api/v1/journal/',
                    method: 'POST',
                    header: {
                        "content-type": "application/json"
                    },
                    jar: j,
                    json: {
                        name: "first",
                        domains: ["www.doi.pangaea.de", "www.zenodo.com"]
                    }
                }, (err, res, body) => {
                    journal_id = body.id;
                    request({
                        uri: global.test_host + '/api/v1/publisher/' + publisher_id + '/addjournal',
                        method: 'PUT',
                        header: {
                            "content-type": "application/json"
                        },
                        jar: j,
                        json: {
                            journalId: journal_id
                        }
                    }, () => {
                        done();
                    });
                });
            });
        });

        it('should return status code 401', function (done) {
            j = request.jar();
            ck = request.cookie('connect.sid=' + cookie_editor);
            j.setCookie(ck, global.test_host);

            request({
                uri: global.test_host + '/api/v1/publisher/' + publisher_id + '/removejournal',
                method: 'PUT',
                header: {
                    "content-type": "application/json"
                },
                jar: j,
                json: {
                    journalId: journal_id,
                }
            }, (err, res) => {
                assert.ifError(err);
                assert.equal(res.statusCode, 401);
                done();
            });
        });
    });
});
