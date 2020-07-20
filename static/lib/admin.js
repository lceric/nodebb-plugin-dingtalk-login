define('admin/plugins/dingtalk-login', ['settings'], function(Settings) {
    'use strict';
    /* globals $, app, socket, require */

    var ACP = {};

    ACP.init = function() {
        Settings.load('dingtalk-login', $('.dingtalk-login-settings'));

        $('#save').on('click', function() {
            Settings.save('dingtalk-login', $('.dingtalk-login-settings'), function() {
                app.alert({
                    type: 'success',
                    alert_id: 'dingtalk-login-saved',
                    title: 'Settings Saved',
                    message: 'Please reload your NodeBB to apply these settings',
                    clickfn: function() {
                        socket.emit('admin.reload');
                    }
                });
            });
        });

    };

    return ACP;
});
