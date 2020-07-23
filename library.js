'use strict';

var user = module.parent.require('./user'),
  meta = module.parent.require('./meta'),
  db = module.parent.require('../src/database'),
  passport = module.parent.require('passport'),
  passportDingtalk = require('passport-dingding').Strategy,
  fs = module.parent.require('fs'),
  path = module.parent.require('path'),
  nconf = module.parent.require('nconf'),
  async = module.parent.require('async');


var Dingtalk = {};

Dingtalk.getStrategy = function(strategies, callback) {
  meta.settings.get('dingtalk-login', function (err, settings) {
    if (!err && settings.id && settings.secret) {
      passport.use('dingtalk', new passportDingtalk({
        clientID: settings.id,
        clientSecret: settings.secret,
        persistentTokenURL: nconf.get('url') + '/auth/dingtalk/callback',
        passReqToCallback: true
        // callbackURL: 'http://local.lcc.com/auth/dingtalk/callback'
      }, function(accessToken, refreshToken, profile, done) {
        console.log(profile)
          Dingtalk.login(profile.dingid, profile.nick, function(err, user) {
            if (err) {
              return done(err);
            }
            done(null, user);
          });
      
      }))
    }
  });

  strategies.push({
    name: 'dingtalk',
    url: '/auth/dingtalk',
    callbackURL: '/auth/dingtalk/callback',
    icon: 'fa-users',
    scope: ''
  });

  callback(null, strategies);
};

Dingtalk.login = function(wxid, handle, callback) {
  Dingtalk.getUidByDingtalkId(wxid, function(err, uid) {
    if (err) {
      return callback(err);
    }

    if (uid !== null) {
      // Existing User
      callback(null, {
        uid: uid
      });
    } else {
      // New User
      user.create({
        username: handle
      }, function(err, uid) {
        if (err) {
          return callback(err);
        }

        // Save Dingtalk-specific information to the user
        user.setUserField(uid, 'wxid', wxid);
        db.setObjectField('wxid:uid', wxid, uid);

        callback(null, {
          uid: uid
        });
      });
    }
  });
};
Dingtalk.init = function(data, callback) {
  function renderAdmin (req, res) {
    // res.render('admin/plugins/dingtalk-login', {
    //   callbackURL: nconf.get('url') + '/auth/dingtalk/callback'
    // })
    res.render('admin/plugins/dingtalk-login', {
      callbackURL: nconf.get('url') + '/auth/dingtalk/callback'
    })
  }
  function renderDingtalkLoginQr (req, res) {
    res.render('partials/dingtalk/loginqr')
  }

  function renderDingtalkLogin (req, res) {
    res.render('partials/dingtalk/login')
  }
  // DEV Router
  // data.router.get('/dingtalk/loginqr', data.middleware.buildHeader, renderDingtalkLoginQr);
  // data.router.get('/dingtalk/login', data.middleware.buildHeader, renderDingtalkLogin);

  data.router.get('/admin/plugins/dingtalk-login', data.middleware.admin.buildHeader, renderAdmin)
  data.router.get('/api/admin/plugins/dingtalk-login', renderAdmin)
  callback()
}

Dingtalk.getUidByDingtalkId = function(wxid, callback) {
  db.getObjectField('wxid:uid', wxid, function(err, uid) {
    if (err) {
      return callback(err);
    }
    callback(null, uid);
  });
};

Dingtalk.deleteUserData = function(uid, callback) {
  async.waterfall([
    async.apply(user.getUserField, uid, 'wxid'),
    function(oAuthIdToDelete, next) {
      db.deleteObjectField('wxid:uid', oAuthIdToDelete, next);
    }
  ], function(err) {
    if (err) {
      winston.error('[sso-dingtalk] Could not remove OAuthId data for uid ' + uid + '. Error: ' + err);
      return callback(err);
    }
    callback(null, uid);
  });
};

module.exports = Dingtalk;