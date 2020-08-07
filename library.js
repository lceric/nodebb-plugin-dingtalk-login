'use strict'

const user = module.parent.require('./user'),
  meta = module.parent.require('./meta'),
  db = module.parent.require('../src/database'),
  passport = module.parent.require('passport'),
  passportDingtalk = require('./passport-dingtalk').Strategy,
  nconf = module.parent.require('nconf'),
  async = module.parent.require('async'),
  winston = module.parent.require('winston'),
  authenticationController = module.parent.require(
    './controllers/authentication'
  )

// 配置管理界面的菜单信息
const constants = Object.freeze({
  name: '钉钉',
  admin: {
    icon: 'fa-users',
    route: '/plugins/dingtalk-login',
  },
})

const Dingtalk = {}

/**
 * 字段白名单，见钩子
 * @param {*} data
 * @param {*} callback
 */
Dingtalk.appendUserHashWhitelist = function (data, callback) {
  data.whitelist.push('openid')
  data.whitelist.push('staffid')
  return setImmediate(callback, null, data)
}

/**
 * passport策略初始化，见钩子
 * @param {*} strategies
 * @param {*} callback
 */
Dingtalk.getStrategy = function (strategies, callback) {
  meta.settings.get('dingtalk-login', function (err, settings) {
    if (!err && settings.id && settings.secret) {
      passport.use(
        'dingtalk',
        new passportDingtalk(
          {
            clientID: settings.id,
            clientSecret: settings.secret,
            callbackURL: nconf.get('url') + '/auth/dingtalk/callback',
            scope: 'snsapi_login',
            passReqToCallback: true,
          },
          async function (req, accessToken, refreshToken, profile, done) {
            if (
              req.hasOwnProperty('user') &&
              req.user.hasOwnProperty('uid') &&
              req.user.uid > 0
            ) {
              // if user want to bind more than one NodeBB User , we refuse him/her.
              Dingtalk.hasDingtalkId(profile.openid, function (err, res) {
                if (err) {
                  winston.error(err)
                  return done(err)
                }
                if (res) {
                  return done(
                    new Error(
                      'You have binded a Dingtalk account.If you want to bind another one ,please unbind your account.'
                    ),
                    false
                  )
                } else {
                  winston.info('[SSO-Dingtalk-web]User is logged.Binding.')
                  user.setUserField(req.user.uid, 'openid', profile.openid)
                  db.setObjectField('openid:uid', profile.openid, req.user.uid)
                  winston.info(
                    `[SSO-Dingtalk-web] ${req.user.uid} is binded.(openid is ${profile.openid} and nickname is ${profile.nick}`
                  )

                  // Set Picture
                  // const picture = profile.headimgurl.replace('http://', 'https://')
                  // user.setUserField(req.user.uid, 'dingpic', picture)
                  return done(null, req.user)
                }
              })
            } else {
              const email = profile.openid + '@kaike.la'
              let headimgurl = profile.headimgurl || ''
              const picture = headimgurl.replace('http://', 'https://')
              let staffid = ''
              // let { staff_id: staffid } = await Dingtalk.getProfile(
              //   profile.openid,
              //   profile.dingId
              // )
              Dingtalk.login(
                profile.openid,
                profile.nick,
                email,
                picture,
                accessToken,
                refreshToken,
                staffid,
                function (err, user) {
                  if (err) {
                    return done(err)
                  }
                  // Require collection of email
                  if (email.endsWith('@kaike.la')) {
                    req.session.registration = req.session.registration || {}
                    req.session.registration.uid = user.uid
                    req.session.registration.openid = profile.openid
                  }
                  authenticationController.onSuccessfulLogin(
                    req,
                    user.uid,
                    function (err) {
                      if (err) {
                        return done(err)
                      } else {
                        winston.info(
                          '[sso-Dingtalk-web] user:' +
                            user.uid +
                            ' is logged via Dingtalk.(openid is ' +
                            profile.openid +
                            ' and nickname is ' +
                            profile.nick +
                            ')'
                        )
                        done(null, user)
                      }
                    }
                  )
                }
              )
            }
          }
        )
      )
    }
  })

  strategies.push({
    name: 'dingtalk',
    url: '/auth/dingtalk',
    callbackURL: '/auth/dingtalk/callback',
    icon: 'fa-users',
    scope: '',
  })

  callback(null, strategies)
}

/**
 *  初始化见钩子
 * @param {*} data
 * @param {*} callback
 */
Dingtalk.init = function (data, callback) {
  function renderAdmin(req, res) {
    res.render('admin/plugins/dingtalk-login', {
      callbackURL: nconf.get('url') + '/auth/dingtalk/callback',
    })
  }
  data.router.get(
    '/admin/plugins/dingtalk-login',
    data.middleware.admin.buildHeader,
    renderAdmin
  )
  data.router.get('/api/admin/plugins/dingtalk-login', renderAdmin)
  callback()
}

/**
 * 添加菜单项，见钩子
 * @param {*} header
 * @param {*} callback
 */
Dingtalk.addMenuItem = function (header, callback) {
  header.authentication.push({
    route: constants.admin.route,
    icon: constants.admin.icon,
    name: constants.name,
  })

  callback(null, header)
}

/**
 * 删除用户(暂未接入)
 * @param {*} uid
 * @param {*} callback
 */
Dingtalk.deleteUserData = function (uid, callback) {
  async.waterfall(
    [
      async.apply(user.getUserField, uid, 'openid'),
      function (oAuthIdToDelete, next) {
        db.deleteObjectField('openid:uid', oAuthIdToDelete, next)
      },
    ],
    function (err) {
      if (err) {
        winston.error(
          '[sso-dingtalk] Could not remove OAuthId data for uid ' +
            uid +
            '. Error: ' +
            err
        )
        return callback(err)
      }
      callback(null, uid)
    }
  )
}

/**
 * 定制接口示例
 * @param {*} openid
 * @param {*} dingid
 */
Dingtalk.getProfile = async function (openid, dingid) {
  let $resolve = null,
    $reject = null,
    $promise = new Promise((resolve, reject) => {
      $resolve = resolve
      $reject = reject
    })
  // 这里可以定制一个接口
  setTimeout(function () {
    let obj = {
      avatar:
        'https://static-legacy.dingtalk.com/media/lADPDgQ9qhjNrE_NAg7NAg4_526_526.jpg',
      email: '',
      mobile: '',
      position: '前端开发工程师',
      realname: '',
      staff_id: '2536',
    }
    $resolve(obj)
  }, 2000)
  return $promise
}

/**
 * 登录处理方法
 * @param {*} openid
 * @param {*} nick
 * @param {*} email
 * @param {*} avatar
 * @param {*} accessToken
 * @param {*} refreshToken
 * @param {*} staffid
 * @param {*} callback
 */
Dingtalk.login = function (
  openid,
  nick,
  email,
  avatar,
  accessToken,
  refreshToken,
  staffid,
  callback
) {
  Dingtalk.getUidByDingtalkOpenId(openid, function (err, uid) {
    if (err) {
      return callback(err)
    }
    if (uid !== null) {
      // Existing User
      Dingtalk.storeTokens(uid, accessToken, refreshToken)
      // user.setUserField(uid, 'dingpic', avatar) // update avatar
      user.setUserField(uid, 'staffid', staffid) // update staffid
      user.setUserField(uid, 'username', nick) // update username
      callback(null, {
        uid: uid,
      })
    } else {
      const success = function (uid) {
        // Save dingchat-specific information to the user
        user.setUserField(uid, 'openid', openid)
        user.setUserField(uid, 'staffid', staffid)
        db.setObjectField('openid:uid', openid, uid)
        db.setObjectField('staffid:uid', staffid, uid)
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
        winston.info(
          '[sso-dingtalk-web]uid:' +
            uid +
            'is created successfully.(openid is ' +
            openid +
            ', nickname is ' +
            nick +
            ')'
        )
        callback(null, {
          uid: uid,
        })
      }
      // New User
      user.create({ username: nick, email: email }, function (err, uid) {
        if (err) {
          // If username is invalid , just use ding- + openid as user's username
          user.create({ username: 'ding-' + openid, email: email }, function (
            err,
            uid
          ) {
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

/**
 * 是否存在openid
 * @param {*} openid
 * @param {*} callback
 */
Dingtalk.hasDingtalkId = function (openid, callback) {
  db.isObjectField('openid:uid', openid, function (err, res) {
    if (err) {
      return callback(err)
    }
    callback(null, res)
  })
}

/**
 * openid获取uid
 * @param {*} openid
 * @param {*} callback
 */
Dingtalk.getUidByDingtalkOpenId = function (openid, callback) {
  db.getObjectField('openid:uid', openid, function (err, uid) {
    if (err) {
      callback(err)
    } else {
      callback(null, uid)
    }
  })
}

/**
 * 刷新token
 * @param {*} uid
 * @param {*} accessToken
 * @param {*} refreshToken
 */
Dingtalk.storeTokens = function (uid, accessToken, refreshToken) {
  // JG: Actually save the useful stuff
  winston.info(
    'Storing received Dingtalk access information for uid(' +
      uid +
      ') accessToken(' +
      accessToken +
      ') refreshToken(' +
      refreshToken +
      ')'
  )
  user.setUserField(uid, 'dingtalkaccesstoken', accessToken)
  user.setUserField(uid, 'dingtalkrefreshtoken', refreshToken)
}

module.exports = Dingtalk
