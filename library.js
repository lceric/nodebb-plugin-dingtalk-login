'use strict'

const user = module.parent.require('./user')
const meta = module.parent.require('./meta')
const db = module.parent.require('../src/database')
const passport = module.parent.require('passport')
var LocalStrategy = require('passport-local').Strategy;
var DingTalkStrategy = require('./passport-dingtalk/strategy')

// const fs = module.parent.require('fs')
// const path = module.parent.require('path')
const nconf = module.parent.require('nconf')
const async = module.parent.require('async')
const winston = module.parent.require('winston')
const axios = require('axios')
const constants = Object.freeze({
  'name': '钉钉',
  'admin': {
    'icon': 'fa-weixin',
    'route': '/plugins/dingtalk-login'
  }
})
const authenticationController = module.parent.require('./controllers/authentication')
const DingTalk = {}

// function PassportDingTalkStrategy(optioins, verify) {
//   if (!options.returnURL) throw new Error('OpenID authentication requires a returnURL option');
//   if (!verify) throw new Error('OpenID authentication strategy requires a verify callback');

//   passport.Strategy.call(this);

//   this.name = 'dingtalk';
//   this._verify = verify;
//   this._profile = options.profile;
//   this._pape = options.pape;
//   this._passReqToCallback = options.passReqToCallback;
// }

DingTalk.appendUserHashWhitelist = function (data, callback) {
  data.whitelist.push('dingid')
  data.whitelist.push('wxpic')
  return setImmediate(callback, null, data)
}
DingTalk.getStrategy = function (strategies, callback) {
  console.log('-----------------------getStartegy')
  try {
    meta.settings.get('dingtalk-login', function (err, settings) {
      if (!err && settings.id && settings.secret) {
        passport.use(
          new DingTalkStrategy(
            {
              appID: settings.id,
              appSecret: settings.secret,
              getToken: function() {},
              saveToken: function() {}
            },
            function (done) {
              console.log(arguments)
              // User.findOne({ username: username }, function (err, user) {
              //   if (err) {
              //     return done(err)
              //   }
              //   if (!user) {
              //     return done(null, false)
              //   }
              //   if (!user.verifyPassword(password)) {
              //     return done(null, false)
              //   }
              //   return done(null, user)
              // })
            }
          )
        )

        passport.use('dingtalk', new PassportDingTalkStrategy({
          appID: settings.id,
          appSecret: settings.secret,
          client: 'web',
          callbackURL: nconf.get('url') + '/auth/dingding/callback',
          state: '',
          scope: 'snsapi_login',
          passReqToCallback: true
        }, function (req, accessToken, refreshToken, profile, expires, done) {
          if (req.hasOwnProperty('user') && req.user.hasOwnProperty('uid') && req.user.uid > 0) {
            // if user want to bind more than one NodeBB User , we refuse him/her.
            DingTalk.hasWeChatId(profile.openid, function (err, res) {
              if (err) {
                winston.error(err)
                return done(err)
              }
              if (res) {
                return done(new Error('You have binded a WeChat account.If you want to bind another one ,please unbind your account.'), false)
              } else {
                winston.info('[SSO-WeChat-web]User is logged.Binding.')
                user.setUserField(req.user.uid, 'dingid', profile.openid)
                db.setObjectField('dingid:uid', profile.openid, req.user.uid)
                winston.info(`[SSO-WeChat-web] ${req.user.uid} is binded.(openid is ${profile.openid} and nickname is ${profile.nickname}`)

                // Set Picture
                const picture = profile.headimgurl.replace('http://', 'https://')
                user.setUserField(req.user.uid, 'wxpic', picture)
                return done(null, req.user)
              }
            })
          } else {
            const email = (profile.nickname ? profile.nickname : profile.openid) + '@wx.qq.com'
            const picture = profile.headimgurl.replace('http://', 'https://')
            DingTalk.login(profile.openid, profile.nickname, email, picture, accessToken, refreshToken, function (err, user) {
              if (err) {
                return done(err)
              }
              // Require collection of email
              if (email.endsWith('@wx.qq.com')) {
                req.session.registration = req.session.registration || {}
                req.session.registration.uid = user.uid
                req.session.registration.dingid = profile.openid
              }
              authenticationController.onSuccessfulLogin(req, user.uid, function (err) {
                if (err) {
                  return done(err)
                } else {
                  winston.info('[dingtalk-login-web] user:' + user.uid + ' is logged via wechat.(openid is ' + profile.openid + ' and nickname is ' + profile.nickname + ')')
                  done(null, user)
                }
              })
            })
          }
        }))

        strategies.push({
          name: 'wechat',
          url: '/auth/wechat',
          callbackURL: '/auth/wechat/callback',
          icon: 'fa-weixin',
          scope: '',
          color: '#36bc67' // Try change color
        })
      }
      callback(null, strategies)
    })
  } catch (err) {
    winston.error(err)
  }
}

DingTalk.getAssociation = function (data, callback) {
  user.getUserField(data.uid, 'dingid', function (err, dingid) {
    if (err) {
      return callback(err, data)
    }

    if (dingid) {
      data.associations.push({
        associated: true,
        deauthUrl: nconf.get('url') + '/deauth/wechat',
        name: constants.name,
        icon: constants.admin.icon
      })
    } else {
      data.associations.push({
        associated: false,
        url: nconf.get('url') + '/auth/wechat',
        name: constants.name,
        icon: constants.admin.icon
      })
    }

    callback(null, data)
  })
}

DingTalk.addMenuItem = function (header, callback) {
  header.authentication.push({
    'route': constants.admin.route,
    'icon': constants.admin.icon,
    'name': constants.name
  })

  callback(null, header)
}

DingTalk.login = function (dingid, handle, email, avatar, accessToken, refreshToken, callback) {
  console.log('-----------------------login')
  DingTalk.getUidByWechatId(dingid, function (err, uid) {
    if (err) {
      return callback(err)
    }
    if (uid !== null) {
      // Existing User
      DingTalk.storeTokens(uid, accessToken, refreshToken)
      user.setUserField(uid, 'wxpic', avatar) // update avatar
      callback(null, {
        uid: uid
      })
    } else {
      const success = function (uid) {
        // Save wxchat-specific information to the user
        user.setUserField(uid, 'dingid', dingid)
        db.setObjectField('dingid:uid', dingid, uid)
        const autoConfirm = 1
        user.setUserField(uid, 'email:confirmed', autoConfirm)

        if (autoConfirm) {
          db.sortedSetRemove('users:notvalidated', uid)
        }

        // Save their photo, if present
        if (avatar) {
          user.setUserField(uid, 'wxpic', avatar)
          user.setUserField(uid, 'picture', avatar)
        }

        DingTalk.storeTokens(uid, accessToken, refreshToken)
        winston.info('[dingtalk-login-web]uid:' + uid + 'is created successfully.(openid is ' + dingid + ', nickname is ' + handle + ')')
        callback(null, {
          uid: uid
        })
      }
      // New User
      user.create({ username: handle, email: email }, function (err, uid) {
        if (err) {
          // If username is invalid , just use wx- + openid as user's username
          user.create({ username: 'wx-' + dingid, email: email }, function (err, uid) {
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
}

DingTalk.hasWeChatId = function (dingid, callback) {
  db.isObjectField('dingid:uid', dingid, function (err, res) {
    if (err) {
      return callback(err)
    }
    callback(null, res)
  })
}
DingTalk.getUidByWechatId = function (dingid, callback) {
  db.getObjectField('dingid:uid', dingid, function (err, uid) {
    if (err) {
      callback(err)
    } else {
      callback(null, uid)
    }
  })
}

DingTalk.deleteUserData = function (data, callback) {
  const uid = data.uid
  async.waterfall([
    async.apply(user.getUserField, uid, 'dingid'),
    function (oAuthIdToDelete, next) {
      db.deleteObjectField('dingid:uid', oAuthIdToDelete, next)
    },
    function (next) {
      db.deleteObjectField('user:' + uid, 'dingid', next)
    }
  ], function (err) {
    if (err) {
      winston.error('[dingtalk-login-web] Could not remove OAuthId data for uid ' + uid + '. Error: ' + err)
      return callback(err)
    }
    callback(null, uid)
  })
}

DingTalk.list = function (data, callback) {
  DingTalk.getWeChatPicture(data.uid, function (err, wechatPicture) {
    if (err) {
      winston.error(err)
      return callback(null, data)
    }
    if (wechatPicture == null) {
      winston.error('[dingtalk-login-web]uid:' + data.uid + 'is invalid,skipping...')
      return callback(null, data)
    }
    data.pictures.push({
      type: 'wechat',
      url: wechatPicture,
      text: '微信头像'
    })

    callback(null, data)
  })
}

DingTalk.get = function (data, callback) {
  if (data.type === 'wechat') {
    DingTalk.getWeChatPicture(data.uid, function (err, wechatPicture) {
      if (err) {
        winston.error(err)
        return callback(null, data)
      }
      if (wechatPicture == null) {
        winston.error('[dingtalk-login-web]uid:' + data.uid + 'is invalid,skipping...')
        return callback(null, data)
      }
      data.picture = wechatPicture
      callback(null, data)
    })
  } else {
    callback(null, data)
  }
}

DingTalk.getWeChatPicture = function (uid, callback) {
  user.getUserField(uid, 'wxpic', function (err, pic) {
    if (err) {
      return callback(err)
    }
    callback(null, pic)
  })
}

DingTalk.init = function (data, callback) {
  console.log('-----------------------init')

  const hostHelpers = require.main.require('./src/routes/helpers')

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
  data.router.get('/dingtalk/loginqr', data.middleware.buildHeader, renderDingtalkLoginQr);
  data.router.get('/dingtalk/login', data.middleware.buildHeader, renderDingtalkLogin);

  data.router.get('/admin/plugins/dingtalk-login', data.middleware.admin.buildHeader, renderAdmin)
  data.router.get('/api/admin/plugins/dingtalk-login', renderAdmin)
  

  hostHelpers.setupPageRoute(data.router, '/deauth/wechat', data.middleware, [data.middleware.requireUser], function (req, res) {
    res.render('partials/dingtalk-login/deauth', {
      service: '钉钉'
    })
  })
  data.router.post('/deauth/wechat', data.middleware.requireUser, function (req, res, next) {
    DingTalk.deleteUserData({
      uid: req.user.uid
    }, function (err, uid) {
      if (err) {
        return next(err)
      }
      user.getUserField(uid, 'userslug', function (err, userslug) {
        if (err) {
          return next(err)
        }
        res.redirect(nconf.get('relative_path') + '/user/' + userslug + '/edit')
      })
    })
  })
  data.router.get('/api/dingtalk/access', async function(req, res) {
    let queryCode = req.query.code
    let $resolve = null, $reject = null;
    let $promise = new Promise((resolve, reject) => {
      $reject = reject
      $resolve = resolve
    })
    meta.settings.get('dingtalk-login', function (err, settings) {
      if (!err && settings.id && settings.secret) {
        $resolve(settings)
      } else {
        $reject({ code: 404, text: '未找到配置'})
      }
    })
    console.log($promise)
    let settings = await $promise
    DingTalkStrategy.authenticate(req, settings)
    // try {
    //   let settings = await $promise
    //   // 1. gettoken
    //   // https://oapi.dingtalk.com/sns/gettoken?appid=APPID&appsecret=APPSECRET
    //   let tokenRes = await axios.get(`https://oapi.dingtalk.com/sns/gettoken?appid=${settings.id}&appsecret=${settings.secret}`)
    //   let { access_token, errcode, errmsg } = tokenRes.data
    //   if (errcode) {
    //     throw new Error(errmsg || '')
    //   }
    //   // let signature = ''
    //   // let userRes = await axios.post(`https://oapi.dingtalk.com/sns/getuserinfo_bycode?accessKey=${settings.id}&timestamp=${new Date().valueOf()}&signature=${signature}`, )
    //   // 2. 获取永久授权码
    //   let persistentRes = await axios.post(`https://oapi.dingtalk.com/sns/get_persistent_code?access_token=${access_token}`, {
    //     tmp_auth_code: queryCode
    //   })
    //   console.log(persistentRes)
    //   let { errmsg: perrmsg, openid, errcode: perrcode, persistent_code } = persistentRes.data
    //   if (perrcode) {
    //     throw new Error(perrmsg || '')
    //   }

    //   // 3. 获取用户授权的SNS_TOKEN
    //   let snsRes = await axios.post(`https://oapi.dingtalk.com/sns/get_sns_token?access_token=${access_token}`, {
    //     openid,
    //     persistent_code
    //   })
    //   let { errmsg: serrmsg, errcode: serrcode, sns_token } = snsRes.data
    //   if (serrcode) {
    //     throw new Error(serrmsg || '')
    //   }

    //   // 4. 那用户信息
    //   let userinfoRes = await axios.get(`https://oapi.dingtalk.com/sns/getuserinfo?sns_token=${sns_token}`)
    //   let { errmsg: uerrmsg, errcode: uerrcode, user_info, unionid } = userinfoRes.data
    //   // res.json({ code: 200, data: { access_token, queryCode, openid, persistent_code, sns_token, snsRes: snsRes.data, userinfoRes: userinfoRes.data }})
    //   if (uerrcode) {
    //     throw new Error(uerrmsg || '')
    //   }

    //   // 下面的接口都没有权限
    //   // 获取unionid
    //   // let unionidRes = await axios.get(`https://oapi.dingtalk.com/user/getUseridByUnionid?access_token=${access_token}&unionid=${user_info.unionid}`)
    //   // let { errmsg: unierrmsg, errcode: unierrcode, userid } = unionidRes.data
    //   // // res.json({ code: 200, data: { access_token, queryCode, openid, persistent_code, sns_token, snsRes: snsRes.data, userinfoRes: userinfoRes.data,  userid, unionidRes: unionidRes.data}})
    //   // if (unierrcode) {
    //   //   throw new Error(unierrmsg || '')
    //   // }

    //   // // 获取用户信息
    //   // let userRes = await axios.get(`https://oapi.dingtalk.com/user/get?access_token=${access_token}&userid=${userid}`)
    //   // let { errmsg: usererrmsg, errcode: usererrcode, ...user_data } = userRes.data
    //   // // res.json({ code: 200, data: { access_token, queryCode, openid, persistent_code, sns_token, snsRes: snsRes.data, userinfoRes: userinfoRes.data }})
    //   // if (usererrcode) {
    //   //   throw new Error(usererrmsg || '')
    //   // }

    //   // user_data的结构
    //   // dingId: "$:LWCP_v1:$pUvHunDQAYkBLYhkAAxkviV+3FBxHxe2"
    //   // nick: "Eric"
    //   // openid: "fuumyxdMFqFyygpZakODGwiEiE"
    //   // unionid: "TiPdSzu8HLMv7IPlQEUBYRwiEiE"

    //   // res.json({ code: 200, data: user_info})
    //   DingTalk.handleLogin(req, user_info)
    //   // res.redirect(nconf.get('relative_path') + '/' + user_info.nick)
    // } catch (error) {
    //   console.log(error.message)
    //   res.json({ code: 417, data: error.message})
    // }
  })
  callback()
}
DingTalk.handleLogin = function(req, profile) {

  const email = (profile.nick ? profile.nick : profile.openid) + '@kaike.la'
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
      winston.info('[dingtalk-login-web] user:' + user.uid + ' is logged via dingtalk.(openid is ' + profile.openid + ' and nickname is ' + profile.nick + ')')
      done(null, user)
    }
  })
}
DingTalk.prepareInterstitial = function (data, callback) {
  // Only execute if:
  //   - uid and dingid are set in session
  //   - email ends with "@wx.qq.com"
  if (data.userData.hasOwnProperty('uid') && data.userData.hasOwnProperty('dingid')) {
    user.getUserField(data.userData.uid, 'email', function (err, email) {
      if (err) {
        return callback(err)
      }
      if (email && email.endsWith('@wx.qq.com')) {
        data.interstitials.push({
          template: 'partials/dingtalk-login/email.tpl',
          data: {},
          callback: DingTalk.storeAdditionalData
        })
      }

      callback(null, data)
    })
  } else {
    callback(null, data)
  }
}

DingTalk.storeAdditionalData = function (userData, data, callback) {
  async.waterfall([
    // Reset email confirm throttle
    async.apply(db.delete, 'uid:' + userData.uid + ':confirm:email:sent'),
    async.apply(user.getUserField, userData.uid, 'email'),
    function (email, next) {
      email = email.toLowerCase()
      // Remove the old email from sorted set reference
      db.sortedSetRemove('email:uid', email, next)
    },
    async.apply(user.setUserField, userData.uid, 'email', data.email),
    async.apply(user.email.sendValidationEmail, userData.uid, data.email)
  ], callback)
}
DingTalk.storeTokens = function (uid, accessToken, refreshToken) {
  // JG: Actually save the useful stuff
  winston.info('Storing received WeChat access information for uid(' + uid + ') accessToken(' + accessToken + ') refreshToken(' + refreshToken + ')')
  user.setUserField(uid, 'wxaccesstoken', accessToken)
  user.setUserField(uid, 'wxrefreshtoken', refreshToken)
}

module.exports = DingTalk
