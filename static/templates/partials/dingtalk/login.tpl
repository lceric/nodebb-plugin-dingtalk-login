<div class="dingtalk-info" id="dingtalkInfo">
  钉钉登录中...
</div>
<script>
  function parseQuery(query) {
    const res = {};
    query = query || '';
    query = query.trim().replace(/^(\?|#|&)/, '');

    if (!query) {
      return res;
    }

    query.split('&').forEach(param => {
      const parts = param.replace(/\+/g, ' ').split('=');
      const key = decodeURIComponent(parts.shift());
      const val = parts.length > 0 ? decodeURIComponent(parts.join('=')) : null;

      if (res[key] === undefined) {
        res[key] = val;
      } else if (Array.isArray(res[key])) {
        res[key].push(val);
      } else {
        res[key] = [res[key], val];
      }
    });

    return res;
  }
  window.onload = function() {
     let search = window.location.search
     var queryObj = parseQuery(search)
     console.log(queryObj.code, $)
     $.ajax({
       url:'/api/dingtalk/access',
       method: 'get',
       data: { code: queryObj.code },
       success: function (res) {
         console.log(res)
         //res.data.nick
       }
     })
     
  }
</script>