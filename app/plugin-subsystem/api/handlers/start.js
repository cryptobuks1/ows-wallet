'use strict';

angular.module('owsWalletApp.pluginApi').service('start', function($rootScope, platformInfoService) {

	var root = {};

  root.respond = function(message, callback) {
    message.response = {
      statusCode: 200,
      statusText: 'OK',
      data: {
        isCordova: platformInfoService.isCordova        
      }
    };

    return callback(message);
  };

  return root;
});
