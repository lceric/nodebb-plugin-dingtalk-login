<div class="row">
    <div class="col-sm-2 col-xs-12 settings-header">DingTalk (QRcode)</div>
    <div class="col-sm-10 col-xs-12">
        <div class="alert alert-info">
            <p>
                请先在DingTalk开放中心注册。
            </p>
        </div>
        <form class="dingtalk-login-settings">
            <div class="form-group">
                <label for="id">App ID</label>
                <input type="text" name="id" title="App ID" class="form-control" placeholder="App ID">
            </div>
            <div class="form-group">
                <label for="secret">App Secret</label>
                <input type="text" name="secret" title="App Secret" class="form-control" placeholder="App Secret" />
            </div>
            <div class="form-group">
                <label for="webhook">webhook</label>
                <input type="text" name="webhook" title="App webhook" class="form-control" placeholder="App webhook" />
            </div>
            <div class="form-group">
                <label for="msgtpl">推送消息模板 <small>markdown, actionCard, link</small>，默认markdown</label>
                <input type="text" name="msgtpl" title="App msgtpl" class="form-control" placeholder="App msgtpl" value="markdown"/>
            </div>
            <div class="form-group alert alert-warning">
                <label for="callback">Your NodeBB&apos;s "Authorization callback URL"</label>
                <input type="text" id="callback" title="Authorization callback URL" class="form-control" value="{callbackURL}" readonly />
            </div>
        </form>
    </div>
</div>

<button id="save" class="floating-button mdl-button mdl-js-button mdl-button--fab mdl-js-ripple-effect mdl-button--colored">
    <i class="material-icons">save</i>
</button>
