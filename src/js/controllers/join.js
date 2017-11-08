'use strict';

angular.module('owsWalletApp.controllers').controller('joinController',
  function($scope, $rootScope, $timeout, $state, $ionicHistory, $ionicScrollDelegate, profileService, configService, storageService, applicationService, gettextCatalog, lodash, ledger, trezor, derivationPathHelper, ongoingProcess, walletService, $log, $stateParams, popupService, appConfigService, networkService) {

    var configNetwork = configService.getSync().currencyNetworks;

    $scope.$on("$ionicView.beforeEnter", function(event, data) {
      var defaults = configService.getDefaults();
      $scope.formData = {};

      var defaultNetwork = networkService.getNetworkByURI(configNetwork.default);
      $scope.formData.network = defaultNetwork;
      $scope.availableNetworks = networkService.getLiveNetworks();
      $scope.formData.walletServiceUrl = configNetwork[$scope.formData.network.getURI()].walletService.url;

      $scope.formData.derivationPath = derivationPathHelper.getPath($scope.formData.network);

      $scope.formData.account = 1;
      $scope.formData.secret = null;
      resetPasswordFields();
      updateSeedSourceSelect();
    });

    $scope.showAdvChange = function() {
      $scope.showAdv = !$scope.showAdv;
      $scope.encrypt = null;
      $scope.resizeView();
    };

    $scope.checkPassword = function(pw1, pw2) {
      if (pw1 && pw1.length > 0) {
        if (pw2 && pw2.length > 0) {
          if (pw1 == pw2) $scope.result = 'correct';
          else {
            $scope.formData.passwordSaved = null;
            $scope.result = 'incorrect';
          }
        } else
          $scope.result = null;
      } else
        $scope.result = null;
    };

    $scope.resizeView = function() {
      $timeout(function() {
        $ionicScrollDelegate.resize();
      }, 10);
      resetPasswordFields();
    };

    function resetPasswordFields() {
      $scope.formData.passphrase = $scope.formData.createPassphrase = $scope.formData.passwordSaved = $scope.formData.repeatPassword = $scope.result = null;
      $timeout(function() {
        $scope.$apply();
      });
    };

    $scope.onQrCodeScannedJoin = function(data) {
      $scope.formData.secret = data;
      $scope.$apply();
    };

    if ($stateParams.url) {
      var data = $stateParams.url;
      data = data.replace('owswallet:', '');
      $scope.onQrCodeScannedJoin(data);
    }

    $scope.onNetworkChange = function() {
      $scope.formData.derivationPath = derivationPathHelper.getPath($scope.formData.network);
      $scope.formData.walletServiceUrl = configNetwork[$scope.formData.network.getURI()].walletService.url;
    };

    function updateSeedSourceSelect() {
      $scope.seedOptions = [{
        id: 'new',
        label: gettextCatalog.getString('Random'),
      }, {
        id: 'set',
        label: gettextCatalog.getString('Specify Recovery Phrase...'),
      }];

      $scope.formData.seedSource = $scope.seedOptions[0];

      if (walletService.externalSource.ledger.supported) {
        $scope.seedOptions.push({
          id: walletService.externalSource.ledger.id,
          label: walletService.externalSource.ledger.longName
        });
      }

      if (walletService.externalSource.trezor.supported) {
        $scope.seedOptions.push({
          id: walletService.externalSource.trezor.id,
          label: walletService.externalSource.trezor.longName
        });
      }
    };

    $scope.join = function() {

      var opts = {
        secret: $scope.formData.secret,
        myName: $scope.formData.myName,
        walletServiceUrl: $scope.formData.walletServiceUrl
      }

      var setSeed = $scope.formData.seedSource.id == 'set';
      if (setSeed) {
        var words = $scope.formData.privateKey;
        if (words.indexOf(' ') == -1 && words.indexOf('prv') == 1 && words.length > 108) {
          opts.extendedPrivateKey = words;
        } else {
          opts.mnemonic = words;
        }
        opts.passphrase = $scope.formData.passphrase;

        var pathData = derivationPathHelper.parse($scope.formData.derivationPath, $scope.formData.network);
        if (!pathData) {
          popupService.showAlert(gettextCatalog.getString('Error'), gettextCatalog.getString('Invalid derivation path'));
          return;
        }
        opts.account = pathData.account;
        opts.networkURI = pathData.networkURI;
        opts.derivationStrategy = pathData.derivationStrategy;
      } else {
        opts.passphrase = $scope.formData.createPassphrase;
      }

      opts.walletPrivKey = $scope._walletPrivKey; // Only for testing


      if (setSeed && !opts.mnemonic && !opts.extendedPrivateKey) {
        popupService.showAlert(gettextCatalog.getString('Error'), gettextCatalog.getString('Please enter the wallet recovery phrase'));
        return;
      }

      if ($scope.formData.seedSource.id == walletService.externalSource.ledger.id || $scope.formData.seedSource.id == walletService.externalSource.trezor.id) {
        var account = $scope.formData.account;
        if (!account || account < 1) {
          popupService.showAlert(gettextCatalog.getString('Error'), gettextCatalog.getString('Invalid account number'));
          return;
        }

        if ($scope.formData.seedSource.id == walletService.externalSource.trezor.id)
          account = account - 1;

        opts.account = account;
        opts.isMultisig = true;
        ongoingProcess.set('connecting' + $scope.formData.seedSource.id, true);

        var src;
        switch ($scope.formData.seedSource.id) {
          case walletService.externalSource.ledger.id:
            src = ledger;
            break;
          case walletService.externalSource.trezor.id:
            src = trezor;
            break;
          default:
            popupService.showAlert(gettextCatalog.getString('Error'), 'Invalid seed source id');
            return;
        }

        src.getInfoForNewWallet(true, account, 'livenet/btc', function(err, lopts) {
          ongoingProcess.set('connecting' + $scope.formData.seedSource.id, false);
          if (err) {
            popupService.showAlert(gettextCatalog.getString('Error'), err);
            return;
          }
          opts = lodash.assign(lopts, opts);
          _join(opts);
        });
      } else {

        _join(opts);
      }
    };

    function _join(opts) {
      ongoingProcess.set('joiningWallet', true);
      $timeout(function() {
        profileService.joinWallet(opts, function(err, client) {
          ongoingProcess.set('joiningWallet', false);
          if (err) {
            popupService.showAlert(gettextCatalog.getString('Error'), err);
            return;
          }

          walletService.updateRemotePreferences(client);
          $ionicHistory.removeBackView();

          if (!client.isComplete()) {
            $ionicHistory.nextViewOptions({
              disableAnimate: true
            });
            $state.go('tabs.home');
            $timeout(function() {
              $state.transitionTo('tabs.copayers', {
                walletId: client.credentials.walletId
              });
            });
          } else $state.go('tabs.home');
        });
      });
    };
  });
