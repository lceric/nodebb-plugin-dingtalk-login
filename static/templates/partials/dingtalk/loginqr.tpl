<script type="text/javascript" src="https://g.alicdn.com/dingding/dinglogin/0.0.5/ddLogin.js"></script>
<div class="dingtalk-qrcode" id="dingtalk"></div>
<script>
  window.onload = function() {
      let { origin,  pathname} = window.location
      let site = origin
      let dappid = 'dingoabmgeqqtsyb60x1qr'
      // let dappsecret = 'YympGAks2WuMTCTr-v59OrQ2-eHVxs7bPSCmneZ89gAyX2jnL9H0gDfiO52qB3iF'
      let gotoUrl = encodeURIComponent('https://oapi.dingtalk.com/connect/oauth2/sns_authorize?appid=' + dappid + '&response_type=code&scope=snsapi_login&state=2&redirect_uri=' + site + '/dingtalk/login');
        console.log(gotoUrl, dappid);
        var obj = window.DDLogin({
          id: "dingtalk",
          goto: gotoUrl,
          style: "border:none;background-color:#FFFFFF;",
          width: "363",
          height: "295"
        });
        var hanndleMessage = function(event) {
          var loginTmpCode = event.data; //拿到loginTmpCode后就可以在这里构造跳转链接进行跳转了
          var origin = event.origin;
          console.log(event);
          var url = 'https://oapi.dingtalk.com/connect/oauth2/sns_authorize?appid=' + dappid + '&response_type=code&scope=snsapi_login&state=2&redirect_uri=' + site + '/dingtalk/login&loginTmpCode=' + loginTmpCode;
          window.location.href = url;
        };
        if (typeof window.addEventListener != 'undefined') {
          window.addEventListener('message', hanndleMessage, false);
        } else if (typeof window.attachEvent != 'undefined') {
          window.attachEvent('onmessage', hanndleMessage);
        }
      }
</script>