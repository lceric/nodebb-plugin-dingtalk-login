'use strict'
/*
 * passport-wechat
 * http://www.liangyali.com
 *
 * Copyright (c) 2014 liangyali
 * Licensed under the MIT license.
 */

var util = require('util')
var passport = require('passport-strategy')
var OAuth = require('wechat-oauth')
var extend = require('xtend')

function DingTalkStrategy(options, verify) {
  options = options || {}

  if (!verify) {
    throw new TypeError('DingTalkStrategy required a verify callback')
  }

  if (typeof verify !== 'function') {
    throw new TypeError('_verify must be function')
  }

  if (!options.appID) {
    throw new TypeError('DingTalkStrategy requires a appID option')
  }

  if (!options.appSecret) {
    throw new TypeError('DingTalkStrategy requires a appSecret option')
  }

  passport.Strategy.call(this, options, verify)

  this.name = options.name || 'wechat'
  this._client = options.client || 'wechat'
  this._verify = verify
  this._oauth = new OAuth(
    options.appID,
    options.appSecret,
    options.getToken,
    options.saveToken
  )
  this._callbackURL = options.callbackURL
  this._lang = options.lang || 'en'
  this._state = options.state
  this._scope = options.scope || 'snsapi_userinfo'
  this._passReqToCallback = options.passReqToCallback
}

/**
 * Inherit from 'passort.Strategy'
 */
util.inherits(DingTalkStrategy, passport.Strategy)

DingTalkStrategy.prototype.authenticate = function (req, options) {
  if (!req._passport) {
    return this.error(new Error('passport.initialize() middleware not in use'))
  }

  var self = this

  options = options || {}
  console.log(options)
  // 获取code,并校验相关参数的合法性
  // No code only state --> User has rejected send details. (Fail authentication request).
  if (req.query && req.query.state && !req.query.code) {
    return self.fail(401)
  }

  // Documentation states that if user rejects userinfo only state will be sent without code
  // In reality code equals "authdeny". Handle this case like the case above. (Fail authentication request).
  if (req.query && req.query.code === 'authdeny') {
    return self.fail(401)
  }

  // 获取code授权成功
  if (req.query && req.query.code) {
    function verified(err, user, info) {
      if (err) {
        return self.error(err)
      }
      if (!user) {
        return self.fail(info)
      }
      self.success(user, info)
    }
    getUserInfo(req.query.code, function(
      err,
      req,
      access_token,
      user_info,
      verified
    ) {
      if (err) {
        return self.error(error)
      }
      self._verify(
        req,
        params['access_token'],
        user_info,
        verified
      )
    })
  } else {
    console.log('------------------ strategy else')
    // var defaultURL = req.protocol + '://' + req.get('Host') + req.originalUrl
    // // 兼容web微信登陆和公众账号的微信登陆
    // var state = options.state || self._state,
    //   callbackURL = options.callbackURL || self._callbackURL || defaultURL,
    //   scope = options.scope || self._scope

    // var methodName =
    //   this._client === 'wechat'
    //     ? 'getAuthorizeURL'
    //     : 'getAuthorizeURLForWebsite'
    // var location = self._oauth[methodName](callbackURL, state, scope)

    // self.redirect(location, 302)
  }
}


async function getUserInfo(code, callback) {
  var queryCode = code

  try {
    let settings = await $promise
    // 1. gettoken
    // https://oapi.dingtalk.com/sns/gettoken?appid=APPID&appsecret=APPSECRET
    let tokenRes = await axios.get(`https://oapi.dingtalk.com/sns/gettoken?appid=${settings.id}&appsecret=${settings.secret}`)
    let { access_token, errcode, errmsg } = tokenRes.data
    if (errcode) {
      throw new Error(errmsg || '')
    }
    // let signature = ''
    // let userRes = await axios.post(`https://oapi.dingtalk.com/sns/getuserinfo_bycode?accessKey=${settings.id}&timestamp=${new Date().valueOf()}&signature=${signature}`, )
    // 2. 获取永久授权码
    let persistentRes = await axios.post(`https://oapi.dingtalk.com/sns/get_persistent_code?access_token=${access_token}`, {
      tmp_auth_code: queryCode
    })
    console.log(persistentRes)
    let { errmsg: perrmsg, openid, errcode: perrcode, persistent_code } = persistentRes.data
    if (perrcode) {
      throw new Error(perrmsg || '')
    }

    // 3. 获取用户授权的SNS_TOKEN
    let snsRes = await axios.post(`https://oapi.dingtalk.com/sns/get_sns_token?access_token=${access_token}`, {
      openid,
      persistent_code
    })
    let { errmsg: serrmsg, errcode: serrcode, sns_token } = snsRes.data
    if (serrcode) {
      throw new Error(serrmsg || '')
    }

    // 4. 那用户信息
    let userinfoRes = await axios.get(`https://oapi.dingtalk.com/sns/getuserinfo?sns_token=${sns_token}`)
    let { errmsg: uerrmsg, errcode: uerrcode, user_info, unionid } = userinfoRes.data
    // res.json({ code: 200, data: { access_token, queryCode, openid, persistent_code, sns_token, snsRes: snsRes.data, userinfoRes: userinfoRes.data }})
    if (uerrcode) {
      throw new Error(uerrmsg || '')
    }

    // 下面的接口都没有权限
    // 获取unionid
    // let unionidRes = await axios.get(`https://oapi.dingtalk.com/user/getUseridByUnionid?access_token=${access_token}&unionid=${user_info.unionid}`)
    // let { errmsg: unierrmsg, errcode: unierrcode, userid } = unionidRes.data
    // // res.json({ code: 200, data: { access_token, queryCode, openid, persistent_code, sns_token, snsRes: snsRes.data, userinfoRes: userinfoRes.data,  userid, unionidRes: unionidRes.data}})
    // if (unierrcode) {
    //   throw new Error(unierrmsg || '')
    // }

    // // 获取用户信息
    // let userRes = await axios.get(`https://oapi.dingtalk.com/user/get?access_token=${access_token}&userid=${userid}`)
    // let { errmsg: usererrmsg, errcode: usererrcode, ...user_data } = userRes.data
    // // res.json({ code: 200, data: { access_token, queryCode, openid, persistent_code, sns_token, snsRes: snsRes.data, userinfoRes: userinfoRes.data }})
    // if (usererrcode) {
    //   throw new Error(usererrmsg || '')
    // }

    // user_data的结构
    // dingId: "$:LWCP_v1:$pUvHunDQAYkBLYhkAAxkviV+3FBxHxe2"
    // nick: "Eric"
    // openid: "fuumyxdMFqFyygpZakODGwiEiE"
    // unionid: "TiPdSzu8HLMv7IPlQEUBYRwiEiE"

    // res.json({ code: 200, data: user_info})
    
    callback(0,
      req,
      params['access_token'],
      user_info,
      verified
    )
    // self._verify(
    //   req,
    //   params['access_token'],
    //   user_info,
    //   verified
    // )
    // res.redirect(nconf.get('relative_path') + '/' + user_info.nick)
  } catch (error) {
    console.log(error.message)
    // res.json({ code: 417, data: error.message})
    // return self.error(error)
    callback(100, error)
  }
} 
module.exports = DingTalkStrategy
