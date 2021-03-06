'use strict';

angular.module('owsWalletApp.controllers').controller('AppletViewCtrl', function($rootScope, $scope, $timeout, $log, $ionicPopup, lodash, gettextCatalog, appletService, networkService, pluginSessionService, profileService) {

  var session;

  // Applet entrance/exit animation options.
  var animationMap = [
    {applet: 'zoomIn',       hostApp: 'zoom-out'},
    {applet: 'slideInRight', hostApp: 'slide-left'}
  ];

  initForPresentation();
  initForSettingsInteraction();
  initForWalletInteraction();

  /**
   * Applet presentation
   */

  function initForPresentation() {
    session = pluginSessionService.getActiveSession();
    var applet = session.plugin;

    // Setup splash screen.
    var splash = applet.launch.splash;
    $scope.splashEnabled = splash.enabled;
    $scope.splashImage = applet.uri + splash.image;
    $scope.splashDelay = splash.delay || -1;
  };

  function getAnimation(applet) {
    var animation = lodash.get(applet, 'launch.options.animation', 'none');
    if (animation == 'none') {
      return;
    }

    // Apply an animation to the host app view appropriate for the specified applet entrance animation.
    var anim = lodash.find(animationMap, function(anim) {
      return anim.applet == animation;
    });

    return (anim ? anim : null);
  };

  function getAppViewContainer() {
    return document.getElementsByClassName('view-container')[0];
  };

  function showAppViewContainer() {
    angular.element(getAppViewContainer()).removeClass('ng-hide');
  };

  function hideAppViewContainer() {
    angular.element(getAppViewContainer()).addClass('ng-hide');
  };

  function isMySession(sessionId) {
    return session.id == sessionId;
  };

  $scope.showBackButton = function() {
    // If the applet launches with slideInRight animation then show the header navbar back button.
    var applet = session.plugin;
    var animation = getAnimation(applet);

    if (animation) {
      return (animation.applet == 'slideInRight');
    } else {
      return false;
    }
  };

  var cancelShowAppletListener =
  $rootScope.$on('Local/ShowApplet', function(e, sessionId) {
    if (!isMySession(sessionId)) {
      return;
    }

    var applet = session.plugin;
    var animation = getAnimation(applet);

    if (animation && applet.launch.options.viewport == 'cover') {
      // Animate the host app during applet launch. Show the applet (initiates animation) by removing the 'ng-hide' class.
      // Provide some time for the DOM to update before starting animation.
      $timeout(function() {
        angular.element(getAppViewContainer()).addClass(animation.hostApp);
        applet.show();
      }, 100);

    } else {
      applet.show();      
    }
  });

  var cancelRemoveAppletListener =
  $rootScope.$on('Local/RemoveApplet', function(e, sessionId) {
    if (!isMySession(sessionId)) {
      return;
    }

    var applet = session.plugin;
    var animation = getAnimation(applet);

    if (animation) {
      // Resets host app view presentation and remove the applet from the DOM.
      angular.element(getAppViewContainer()).removeClass(animation.hostApp);
    }

    applet.remove();
  });

  var cancelAppletHideSplashListener =
  $rootScope.$on('Local/AppletHideSplash', function(e, sessionId) {
    if (!isMySession(sessionId)) {
      return;
    }

    $scope.splashDelay = 0;
    $scope.$apply();
  });

  var cancelModalActivateQrScannerListener =
  $rootScope.$on('Local/ModalActivateQrScanner', function(e, sessionId) {
    if (!isMySession(sessionId)) {
      return;
    }

    var applet = session.plugin;
    applet.hide();
    hideAppViewContainer();
  });

  var cancelModalDeactivateQrScannerListener =
  $rootScope.$on('Local/ModalDeactivateQrScanner', function(e, sessionId) {
    if (!isMySession(sessionId)) {
      return;
    }

    var applet = session.plugin;
    applet.show();
    showAppViewContainer();
  });

  $scope.closeApplet = function() {
    saveViewSettings();
    appletService.closeApplet(session.id, {
      confirm: $scope.viewSettings.confirmOnClose
    });
  };

  /**
   * Applet settings controls
   */

  function initForSettingsInteraction() {
    getViewSettings();
  };

  $scope.openSettings = function() {
    $ionicPopup.show({
      templateUrl: 'views/applet-view/settings/settings.html',
      cssClass: 'applet-view-settings',
      title: 'title',
      subTitle: 'subtitle',
      scope: $scope,
      buttons: [{
        text: 'Done',
        type: 'button-positive',
        onTap: function(e) {
          saveViewSettings();
        }
      }]
    });
  };

  $scope.onAppletMenuMove = function(draggable, droppable) {
    if (!draggable) {
      return;
    }

    $scope.menuPosition = {
      x: draggable.x,
      y: draggable.y
    };

    var physicalScreenWidth = ((window.innerWidth > 0) ? window.innerWidth : screen.width);
    var physicalScreenHeight = ((window.innerHeight > 0) ? window.innerHeight : screen.height);

    var lr = (draggable.midPoint[0] < physicalScreenWidth / 2 ? 'l' : 'r');
    var tb = (draggable.midPoint[1] < physicalScreenHeight / 2 ? 't' : 'b');
    var targetQuadrant = tb + lr;

    lodash.forEach(['tl', 'tr', 'br', 'bl'], function(q) {
      var elem = angular.element(document.getElementsByClassName('applet-menu mfb-component--' + q));
      if (elem[0] && q != targetQuadrant) {
        elem.removeClass('mfb-component--' + q);
        elem.addClass('mfb-component--' + targetQuadrant);
        return false;
      }
    });
  };

  function getViewSettings() {
    $scope.viewSettings = session.getValue('$viewSettings') || {
      // Default settings
      confirmOnClose: true,
      stickyMenu: true,
      menuPosition: {x: 0, y: 0}
    };

    $scope.menuPosition = $scope.viewSettings.menuPosition;

    $timeout(function() {
      $scope.$apply();
    });
  };

  function saveViewSettings() {
    if ($scope.viewSettings.stickyMenu) {
      $scope.viewSettings.menuPosition = $scope.menuPosition;
    }

    $scope.viewSettings = session.setValue('$viewSettings', $scope.viewSettings);
  };

  /**
   * Wallet interaction controls
   */

  function initForWalletInteraction() {
  };

  $scope.onWalletSelect = function(wallet) {
    $rootScope.$emit('Local/WalletForApplet', wallet);
    $scope.wallet = wallet;
  };

  $scope.onWalletSelectCancel = function() {
    $rootScope.$emit('Local/WalletForApplet', null);
  };

  var cancelChooseWalletForAppletListener =
  $rootScope.$on('Local/ChooseWalletForApplet', function(event, opts) {
    var defaultOptions = {
      filter: {},
      picker: 'action-sheet',
      title: gettextCatalog.getString('Select a wallet')
    };

    opts = opts || {};
    lodash.merge(opts, defaultOptions);

    var wallets = profileService.getWallets();
    $scope.filteredWallets = wallets;

    if (opts.filter.currencies && opts.filter.currencies.length > 0) {
      $scope.filteredWallets = lodash.filter(wallets, function(w) {
        var network = networkService.getNetworkByName(w.networkName);
        return opts.filter.currencies.includes(network.currency.toUpperCase());
      });
    }

    $scope.singleWallet = $scope.filteredWallets.length == 1;
    $scope.hasWallets = lodash.isEmpty($scope.filteredWallets) ? false : true;

    if ($scope.hasWallets) {
      // Select first wallet if no wallet selected previously.
      $scope.wallet = $scope.wallet || $scope.filteredWallets[0];

      if ($scope.singleWallet) {
        // Only one wallet, just return it.
        $rootScope.$emit('Local/WalletForApplet', $scope.wallet);
        return;
      }

    } else {
      // No wallets to choose.
      $rootScope.$emit('Local/WalletForApplet');
      return;
    }

    // Only one option available at the moment.
    if (opts.picker == 'action-sheet') {
      $scope.walletSelectorTitle = opts.title;
      $scope.showWallets = true;
    }

    $timeout(function() {
      $scope.$apply();
    });
  });

});
