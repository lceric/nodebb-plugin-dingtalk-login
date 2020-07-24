'use strict';

var user = module.parent.require('./user'),
  meta = module.parent.require('./meta'),
  db = module.parent.require('../src/database'),
  passport = module.parent.require('passport'),
  passportDingtalk = require('./passport-dingtalk').Strategy,
  fs = module.parent.require('fs'),
  path = module.parent.require('path'),
  nconf = module.parent.require('nconf'),
  async = module.parent.require('async');

const winston = module.parent.require('winston')
const authenticationController = module.parent.require('./controllers/authentication')


var Dingtalk = {};

Dingtalk.appendUserHashWhitelist = function (data, callback) {
  data.whitelist.push('dingid')
  return setImmediate(callback, null, data)
}

Dingtalk.getStrategy = function(strategies, callback) {
  meta.settings.get('dingtalk-login', function (err, settings) {
    if (!err && settings.id && settings.secret) {
      passport.use('dingtalk', new passportDingtalk({
        clientID: settings.id,
        clientSecret: settings.secret,
        callbackURL: 'http://local.lcc.com/auth/dingtalk/callback',
        scope: 'snsapi_login',
        passReqToCallback: true
      }, function(req, accessToken, refreshToken, profile, done) {
        // nick: 'Eric',
        // unionid: 'TiPdSzu8HLMv7IPlQEUBYRwiEiE',
        // dingId: '$:LWCP_v1:$pUvHunDQAYkBLYhkAAxkviV+3FBxHxe2',
        // openid: 'fuumyxdMFqFyygpZakODGwiEiE'
        // Dingtalk.login(profile.dingid, profile.nick, function(err, user) {
        //   if (err) {
        //     return done(err);
        //   }
        //   done(null, user);
        // });
        console.log(profile, 'profile')
        if (req.hasOwnProperty('user') && req.user.hasOwnProperty('uid') && req.user.uid > 0) {
          // if user want to bind more than one NodeBB User , we refuse him/her.
          Dingtalk.hasDingtalkId(profile.openid, function (err, res) {
            if (err) {
              winston.error(err)
              return done(err)
            }
            if (res) {
              return done(new Error('You have binded a Dingtalk account.If you want to bind another one ,please unbind your account.'), false)
            } else {
              winston.info('[SSO-Dingtalk-web]User is logged.Binding.')
              user.setUserField(req.user.uid, 'dingid', profile.openid)
              db.setObjectField('dingid:uid', profile.openid, req.user.uid)
              winston.info(`[SSO-Dingtalk-web] ${req.user.uid} is binded.(openid is ${profile.openid} and nickname is ${profile.nick}`)

              // Set Picture
              // const picture = profile.headimgurl.replace('http://', 'https://')
              // user.setUserField(req.user.uid, 'dingpic', picture)
              return done(null, req.user)
            }
          })
        } else {
          const email = (profile.openid) + '@kaike.la'
          let headimgurl = profile.headimgurl || ''
          const picture = headimgurl.replace('http://', 'https://')
          Dingtalk.login(profile.openid, profile.nick, email, picture, accessToken, refreshToken, function (err, user) {
            if (err) {
              return done(err)
            }
            // Require collection of email
            if (email.endsWith('@kaike.la')) {
              req.session.registration = req.session.registration || {}
              req.session.registration.uid = user.uid
              req.session.registration.dingid = profile.openid
            }
            authenticationController.onSuccessfulLogin(req, user.uid, function (err) {
              if (err) {
                return done(err)
              } else {
                winston.info('[sso-Dingtalk-web] user:' + user.uid + ' is logged via Dingtalk.(openid is ' + profile.openid + ' and nickname is ' + profile.nick + ')')
                done(null, user)
              }
            })
          })
        }
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
Dingtalk.hasDingtalkId = function (dingid, callback) {
  db.isObjectField('dingid:uid', dingid, function (err, res) {
    if (err) {
      return callback(err)
    }
    callback(null, res)
  })
}

Dingtalk.getUidByDingtalkId = function (dingid, callback) {
  db.getObjectField('dingid:uid', dingid, function (err, uid) {
    if (err) {
      callback(err)
    } else {
      callback(null, uid)
    }
  })
}

Dingtalk.storeTokens = function (uid, accessToken, refreshToken) {
  // JG: Actually save the useful stuff
  winston.info('Storing received Dingtalk access information for uid(' + uid + ') accessToken(' + accessToken + ') refreshToken(' + refreshToken + ')')
  user.setUserField(uid, 'dingtalkaccesstoken', accessToken)
  user.setUserField(uid, 'dingtalkrefreshtoken', refreshToken)
}

Dingtalk.login = function(dingid, nick, email, avatar, accessToken, refreshToken, callback) {
  Dingtalk.getUidByDingtalkId(dingid, function (err, uid) {
    if (err) {
      return callback(err)
    }
    if (uid !== null) {
      // Existing User
      Dingtalk.storeTokens(uid, accessToken, refreshToken)
      // user.setUserField(uid, 'dingpic', avatar) // update avatar
      callback(null, {
        uid: uid
      })
    } else {
      const success = function (uid) {
        // Save dingchat-specific information to the user
        user.setUserField(uid, 'dingid', dingid)
        db.setObjectField('dingid:uid', dingid, uid)
        const autoConfirm = 1
        user.setUserField(uid, 'email:confirmed', autoConfirm)

        if (autoConfirm) {
          db.sortedSetRemove('users:notvalidated', uid)
        }

        // Save their photo, if present
        if (avatar) {
          user.setUserField(uid, 'dingpic', avatar)
          // user.setUserField(uid, 'picture', avatar)
        }

        Dingtalk.storeTokens(uid, accessToken, refreshToken)
        winston.info('[sso-dingtalk-web]uid:' + uid + 'is created successfully.(openid is ' + dingid + ', nickname is ' + nick + ')')
        callback(null, {
          uid: uid
        })
      }
      // New User
      user.create({ username: nick, email: email }, function (err, uid) {
        if (err) {
          // If username is invalid , just use ding- + openid as user's username
          user.create({ username: 'ding-' + dingid, email: email }, function (err, uid) {
            if (err) {
              return callback(err)
            } else {
              success(uid)
            }
          })
        }
        success(uid)
      })
    }
  })
  // Dingtalk.getUidByDingtalkId(dingid, function(err, uid) {
  //   if (err) {
  //     return callback(err);
  //   }

  //   if (uid !== null) {
  //     // Existing User
  //     callback(null, {
  //       uid: uid
  //     });
  //   } else {
  //     // New User
  //     user.create({
  //       username: handle
  //     }, function(err, uid) {
  //       if (err) {
  //         return callback(err);
  //       }

  //       // Save Dingtalk-specific information to the user
  //       user.setUserField(uid, 'dingid', dingid);
  //       db.setObjectField('dingid:uid', dingid, uid);

  //       callback(null, {
  //         uid: uid
  //       });
  //     });
  //   }
  // });
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
  // data.router.get('/auth/dingtalk/callback', data.middleware.authenticate, function(req, res) {
  //   console.log('-----------------------------')
  //   // Successful authentication, redirect home.
  //   // data.middleware.authenticate('dingtalk', { failureRedirect: '/login' })
  //   res.redirect('/');
  // });
  // data.router.get('/auth/dingtalk/callback', data.middleware.authenticate);
  data.router.get('/admin/plugins/dingtalk-login', data.middleware.admin.buildHeader, renderAdmin)
  data.router.get('/api/admin/plugins/dingtalk-login', renderAdmin)
  callback()
}

Dingtalk.getUidByDingtalkId = function(dingid, callback) {
  db.getObjectField('dingid:uid', dingid, function(err, uid) {
    if (err) {
      return callback(err);
    }
    callback(null, uid);
  });
};

Dingtalk.deleteUserData = function(uid, callback) {
  async.waterfall([
    async.apply(user.getUserField, uid, 'dingid'),
    function(oAuthIdToDelete, next) {
      db.deleteObjectField('dingid:uid', oAuthIdToDelete, next);
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