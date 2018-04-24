'use strict';

angular.module('owsWalletApp.controllers').controller('WalletHistorySettingsCtrl',
  function($rootScope, $scope, $log, $stateParams, $timeout, $ionicHistory, storageService, platformInfoService, profileService, lodash, appConfig, walletService, networkService, gettextCatalog, popupService) {
    $scope.wallet = profileService.getWallet($stateParams.walletId);
    $scope.csvReady = false;
    $scope.isCordova = platformInfoService.isCordova;
    $scope.appName = appConfig.nameCase;

    // TODO-AJP: move this to walletService.
    $scope.csvHistory = function(cb) {
      var allTxs = [];

      function getHistory(cb) {
        storageService.getTxHistory($scope.wallet.id, function(err, txs) {
          if (err) return cb(err);

          var txsFromLocal = [];
          try {
            txsFromLocal = JSON.parse(txs);
          } catch (ex) {
            $log.warn(ex);
          }

          allTxs.push(txsFromLocal);
          return cb(null, lodash.compact(lodash.flatten(allTxs)));
        });
      };

      $log.debug('Generating CSV from History');
      getHistory(function(err, txs) {
        if (err || lodash.isEmpty(txs)) {
          if (err) {
            $log.warn('Failed to generate CSV:', err);
            $scope.err = err;
          } else {
            $log.warn('Failed to generate CSV: no transactions');
            $scope.err = 'No transactions';
          }
          if (cb) return cb(err);
          return;
        }
        $log.debug('Wallet Transaction History Length:', txs.length);

        var standardUnit = networkService.getStandardUnit($scope.wallet.networkURI);
        var atomicToStandard = networkService.getASUnitRatio($scope.wallet.networkURI);

        var data = txs;
        $scope.csvContent = [];
        $scope.csvFilename = $scope.appName + '-' + $scope.wallet.name + '.csv';
        $scope.csvHeader = ['Date', 'Destination', 'Description', 'Amount', 'Currency', 'Txid', 'Creator', 'Copayers', 'Comment'];

        var _amount, _note, _copayers, _creator, _comment;
        data.forEach(function(it, index) {
          var amount = it.amount;

          if (it.action == 'moved')
            amount = 0;

          _copayers = '';
          _creator = '';

          if (it.actions && it.actions.length > 1) {
            for (var i = 0; i < it.actions.length; i++) {
              _copayers += it.actions[i].copayerName + ':' + it.actions[i].type + ' - ';
            }
            _creator = (it.creatorName && it.creatorName != 'undefined') ? it.creatorName : '';
          }
          _amount = (it.action == 'sent' ? '-' : '') + (amount * atomicToStandard).toFixed(standardUnit.decimals);
          _note = it.message || '';
          _comment = it.note ? it.note.body : '';

          if (it.action == 'moved')
            _note += ' Moved:' + (it.amount * atomicToStandard).toFixed(standardUnit.decimals)

          $scope.csvContent.push({
            'Date': formatDate(it.time * 1000),
            'Destination': it.addressTo || '',
            'Description': _note,
            'Amount': _amount,
            'Currency': standardUnit.shortName,
            'Txid': it.txid,
            'Creator': _creator,
            'Copayers': _copayers,
            'Comment': _comment
          });

          if (it.fees && (it.action == 'moved' || it.action == 'sent')) {
            var _fee = (it.fees * atomicToStandard).toFixed(standardUnit.decimals)
            $scope.csvContent.push({
              'Date': formatDate(it.time * 1000),
              'Destination': 'Network Fees',
              'Description': '',
              'Amount': '-' + _fee,
              'Currency': standardUnit.shortName,
              'Txid': '',
              'Creator': '',
              'Copayers': ''
            });
          }
        });

        $scope.csvReady = true;
        $timeout(function() {
          $scope.$apply();
        }, 100);

        if (cb)
          return cb();
        return;
      });

      function formatDate(date) {
        var dateObj = new Date(date);
        if (!dateObj) {
          $log.debug('Error formating a date');
          return 'DateError'
        }
        if (!dateObj.toJSON()) {
          return '';
        }

        return dateObj.toJSON();
      };
    };

    $scope.clearTransactionHistory = function() {
      $log.info('Removing Transaction history ' + $scope.wallet.id);

      walletService.clearTxHistory($scope.wallet, function(err) {
        if (err) {
          $log.error(err);
          return;
        }

        $log.info('Transaction history cleared for :' + $scope.wallet.id);
        popupService.showAlert(
          gettextCatalog.getString('Transaction History Cleared'),
          gettextCatalog.getString('Return to the wallet to reload transactions from the wallet service.'));
      });
    };

    $scope.$on("$ionicView.beforeEnter", function(event, data) {
      $scope.csvHistory();
    });

  });
