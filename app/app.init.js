'use strict';

angular.element(document).ready(function() {

  // Run owsWalletApp after device is ready.
  var startAngular = function() {
    angular.bootstrap(document, ['owsWalletApp']);
  };

  function handleOpenURL(url) {
    if ('cordova' in window) {
      console.log('DEEP LINK:' + url);
      cordova.fireDocumentEvent('handleopenurl', {
        url: url
      });
    } else {
      console.log("ERROR: Cannont handle open URL in non-cordova apps")
    }
  };

  /* Cordova specific Init */
  if ('cordova' in window) {
    window.handleOpenURL = handleOpenURL;

    document.addEventListener('deviceready', function() {
      window.open = cordova.InAppBrowser.open;

      // Create a sticky event for handling the app being opened via a custom URL
      cordova.addStickyDocumentEventHandler('handleopenurl');
      startAngular();
    }, false);

  } else {
    startAngular();
  }

});
