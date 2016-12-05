#!/usr/bin/env python
"""How can we get the user from a session cookie when in Python?"""

# http://stackoverflow.com/questions/1306550/calculating-a-sha-hash-with-a-string-secret-key-in-python

import hmac
import hashlib
import base64
import re
import pprint
from pymongo import MongoClient

orig_cookie = 's:kwkF6XLT9VCZSrBj8BUstscvfDn-H0g9.JBjAiXL9F+EO4MasRPP5v2M+cq2fPj2C0sga8j5maT0'

# before the . is the session ID ("val" in function below), after the . is the signature of the first part

# sign function in cookie-signature
#exports.sign = function(val, secret){
#  return val + '.' + crypto
#    .createHmac('sha256', secret)
#    .update(val)
#    .digest('base64')
#    .replace(/\=+$/, '');
#};


# sign the same session ID as above to createa a cookie string
def get_cookie(val, secret):
    """Create session cookie string for session ID."""
    # https://docs.python.org/3/library/hmac.html
    _signature = hmac.new(str.encode(secret),
                          msg=str.encode(val),
                          digestmod=hashlib.sha256).digest()
    _signature_enc = base64.b64encode(_signature)
    _cookie = 's:' + val + '.' + _signature_enc.decode()
    _cookie = re.sub(r'\=+$', '', _cookie)  # remove trailing = characters
    return _cookie


def verify_sign(cookie):
    _session = cookie.split('.')[0].split('s:')[1]
    return hmac.compare_digest(cookie, get_cookie(_session, 'o2r'))


def get_user(cookie):
    _session_id = cookie.split('.')[0].split('s:')[1]
    if verify_sign(cookie):
        # https://api.mongodb.com/python/current/tutorial.html
        client = MongoClient('localhost', 27017)

        _db = client['muncher']
        pprint.pprint(_db)
        _sessions = _db['sessions']
        pprint.pprint(_sessions)
        _session = _sessions.find_one({"_id": _session_id})
        _orcid = _session['session']['passport']['user']
        print(_orcid)
        _users = _db['users']
        return _users.find_one({"orcid": _orcid})
    else:
        return None


print(get_cookie('kwkF6XLT9VCZSrBj8BUstscvfDn-H0g9', 'o2r'))
print(hmac.compare_digest(
    orig_cookie, get_cookie('kwkF6XLT9VCZSrBj8BUstscvfDn-H0g9', 'o2r')))
pprint.pprint(get_user(orig_cookie))

# run with python3 decode_session.py
