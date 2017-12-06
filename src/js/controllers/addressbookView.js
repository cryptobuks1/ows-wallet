'use strict';

angular.module('owsWalletApp.controllers').controller('addressbookViewController', function($scope, $state, $timeout, $stateParams, lodash, addressbookService, popupService, $ionicHistory, gettextCatalog, networkService) {
  $scope.addressbookEntry = {};
  $scope.addressbookEntry.name = $stateParams.name;
  $scope.addressbookEntry.email = $stateParams.email;
  $scope.addressbookEntry.networkURI = $stateParams.networkURI;
  $scope.addressbookEntry.address = $stateParams.address;

  $scope.sendTo = function() {
    $ionicHistory.removeBackView();
    $state.go('tabs.send');
    $timeout(function() {
      $state.transitionTo('tabs.send.amount', {
        networkURI: $scope.addressbookEntry.networkURI,
        toAddress: $scope.addressbookEntry.address,
        toName: $scope.addressbookEntry.name,
        toEmail: $scope.addressbookEntry.email
      });
    }, 100);
  };

  $scope.remove = function(addr) {
    var title = gettextCatalog.getString('Warning!');
    var message = gettextCatalog.getString('Are you sure you want to delete this contact?');
    popupService.showConfirm(title, message, null, null, function(res) {
      if (!res) return;
      addressbookService.remove(addr, function(err, ab) {
        if (err) {
          popupService.showAlert(gettextCatalog.getString('Error'), err);
          return;
        }
        $ionicHistory.goBack();
      });
    }); 
  };

  $scope.currencyFor = function(networkURI) {
    return networkService.parseCurrency(networkURI);
  };

});
