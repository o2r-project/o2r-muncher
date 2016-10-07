/* eslint-env mocha */
var mongojs = require('mongojs');

// test parameters for local session authentication directly via fixed database entries
var orcid_o2r = '0000-0001-6021-1617';
var orcid_plain = '0000-0000-0000-0001';
var sessionId_o2r = 'C0LIrsxGtHOGHld8Nv2jedjL4evGgEHo';
var sessionId_plain = 'yleQfdYnkh-sbj9Ez--_TWHVhXeXNEgq';

before(function() {
    var db = mongojs('localhost/muncher', ['users', 'sessions', 'compendia', 'jobs']);

    db.sessions.drop(function (err, doc) {
        //if (err) throw err;
    });
    var session_o2r = {
        '_id': sessionId_o2r,
        'session': {
            'cookie': {
                'originalMaxAge': null,
                'expires': null,
                'secure': null,
                'httpOnly': true,
                'domain': null,
                'path': '/'
            },
            'passport': {
                'user': orcid_o2r
            }
        }
    }
    db.sessions.save(session_o2r, function (err, doc) {
        //console.log(doc);
        if (err) throw err;
    });
    var session_plain = {
        '_id': sessionId_plain,
        'session': {
            'cookie': {
                'originalMaxAge': null,
                'expires': null,
                'secure': null,
                'httpOnly': true,
                'domain': null,
                'path': '/'
            },
            'passport': {
                'user': orcid_plain
            }
        }
    }
    db.sessions.save(session_plain, function (err, doc) {
        //console.log(doc);
        if (err) throw err;
    });

    var o2ruser = {
        '_id': '57dc171b8760d15dc1864044',
        'orcid': orcid_o2r,
        'level': 100,
        'name': 'o2r-testuser'
    };
    db.users.save(o2ruser, function (err, doc) {
        if (err) throw err;
    });
    var plainuser = {
        '_id': '57b55ee700aee212007ac27f',
        'orcid': orcid_plain,
        'level': 0,
        'name': 'plain-testuser'
    };
    db.users.save(plainuser, function (err, doc) {
        if (err) throw err;
    });

    db.compendia.drop(function (err, doc) {
        //if (err) throw err;
    });

    db.jobs.drop(function (err, doc) {
        //if (err) throw err;
    });

    console.log('  Global test setup completed\n');
});
