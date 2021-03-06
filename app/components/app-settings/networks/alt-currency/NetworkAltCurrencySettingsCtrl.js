'use strict';

angular.module('owsWalletApp.controllers').controller('NetworkAltCurrencySettingsCtrl',
  function($scope, $log, $timeout, $ionicHistory, configService, rateService, lodash, profileService, walletService, storageService, networkService, $ionicScrollDelegate, $location) {

    var next = 10;
    var completeAlternativeList = [];
    var config = configService.getSync();

    $scope.$on("$ionicView.beforeEnter", function(event, data) {
      $scope.networkName = data.stateParams.networkName;
      if (!$scope.networkName) {
        return;
      }

      var network = networkService.getNetworkByName($scope.networkName);
      $scope.currentCurrency = config.networkPreferences[network.name].alternativeIsoCode;
      $scope.showSearch = false;

      storageService.getLastCurrencyUsed($scope.networkName, function(err, lastUsedAltCurrency) {
        $scope.lastUsedAltCurrencyList = lastUsedAltCurrency ? JSON.parse(lastUsedAltCurrency) : [];
        init();
      });
    });

    function init() {
      var unusedCurrencyList = [{
        isoCode: 'LTL'
      }];

      // Add all currency network standard units to the unused list.
      var networks = networkService.getNetworks();
      lodash.forEach(networks, function(n) {
        lodash.forEach(n.units, function(u) {
          if (u.kind == 'standard') {
            unusedCurrencyList.push({ isoCode: u.shortName});
          };
        });
      });

      rateService.whenAvailable(function() {
        $scope.listComplete = false;

        var idx = lodash.keyBy(unusedCurrencyList, 'isoCode');
        var idx2 = lodash.keyBy($scope.lastUsedAltCurrencyList, 'isoCode');

        completeAlternativeList = lodash.reject(rateService.listAlternatives($scope.networkName, true), function(c) {
          return idx[c.isoCode] || idx2[c.isoCode];
        });

        $scope.altCurrencyList = completeAlternativeList.slice(0, 10);
        $scope.allowSearch = completeAlternativeList.length > 10;

        $timeout(function() {
          $scope.$apply();
        });
      });
    }

    $scope.toggleSearch = function() {
      $scope.showSearch = !$scope.showSearch;
    };

    $scope.loadMore = function() {
      $timeout(function() {
        $scope.altCurrencyList = completeAlternativeList.slice(0, next);
        next += 10;
        $scope.listComplete = $scope.altCurrencyList.length >= completeAlternativeList.length;
        $scope.$broadcast('scroll.infiniteScrollComplete');
      }, 100);
    };

    $scope.findCurrency = function(search) {
      if (!search) {
        init();
      }
      $scope.altCurrencyList = lodash.filter(completeAlternativeList, function(item) {
        var val = item.name;
        return lodash.includes(val.toLowerCase(), search.toLowerCase());
      });
      $timeout(function() {
        $scope.$apply();
      });
    };

    $scope.save = function(newAltCurrency) {
      var opts = {
        networkPreferences: {}
      };

      opts.networkPreferences[$scope.networkName] = {
        alternativeName: newAltCurrency.name,
        alternativeIsoCode: newAltCurrency.isoCode,
      };

      configService.set(opts, function(err) {
        if (err) {
          $log.error(err);
        }

        $ionicHistory.goBack();
        saveLastUsed(newAltCurrency);
        walletService.updateRemotePreferences(profileService.getWallets());
      });

    };

    function saveLastUsed(newAltCurrency) {
      $scope.lastUsedAltCurrencyList.unshift(newAltCurrency);
      $scope.lastUsedAltCurrencyList = lodash.uniq($scope.lastUsedAltCurrencyList, 'isoCode');
      $scope.lastUsedAltCurrencyList = $scope.lastUsedAltCurrencyList.slice(0, 3);
      storageService.setLastCurrencyUsed(JSON.stringify($scope.lastUsedAltCurrencyList), $scope.networkName, function() {});
    };

  });
