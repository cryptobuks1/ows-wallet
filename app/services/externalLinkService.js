'use strict';

angular.module('owsWalletApp.services').service('externalLinkService', function(platformInfoService, nodeWebkitService, popupService, gettextCatalog, $window, $log, $timeout) {

  var _restoreHandleOpenURL = function(old) {
    $timeout(function() {
      $window.handleOpenURL = old;
    }, 500);
  };

  this.open = function(url, optIn, title, message, okText, cancelText) {
    var old = $window.handleOpenURL;

    $window.handleOpenURL = function(url) {
      // Ignore external URLs
      $log.debug('Skip: ' + url);
    };

    if (platformInfoService.isNW) {
      nodeWebkitService.openExternalLink(url);
      _restoreHandleOpenURL(old);
    } else {
      if (optIn) {
        popupService.showConfirm(title, message, okText, cancelText, function(res) {
          if (res) {
            window.open(url, '_system');
          }
          _restoreHandleOpenURL(old);
        });
      } else {
        window.open(url, '_system');
        _restoreHandleOpenURL(old);
      }
    }
  };

});
