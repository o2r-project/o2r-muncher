/* eslint-env mocha */
var mongojs = require('mongojs');

// test parameters for local session authentication directly via fixed database entries
var orcid = '0000-0001-6021-1617';
var sessionId = 'C0LIrsxGtHOGHld8Nv2jedjL4evGgEHo';

before(function() {
    var db = mongojs('localhost/muncher', ['users', 'sessions', 'compendia']);

    var session = {
        '_id': sessionId,
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
                'user': orcid
            }
        }
    }
    db.sessions.drop(function (err, doc) {
        //if (err) throw err;
    });
    db.sessions.save(session, function (err, doc) {
        //console.log(doc);
        if (err) throw err;
    });

    var o2ruser = {
        '_id': '57dc171b8760d15dc1864044',
        'orcid': orcid,
        'level': 100,
        'name': 'o2r-testuser'
    };
    db.users.save(o2ruser, function (err, doc) {
        if (err) throw err;
    });

    db.compendia.drop(function (err, doc) {
        //if (err) throw err;
    });

    console.log('  Global test setup completed\n');
});
