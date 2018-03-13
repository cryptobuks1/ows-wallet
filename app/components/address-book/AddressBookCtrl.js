'use strict';

angular.module('owsWalletApp.controllers').controller('AddressBookCtrl', function($scope, $log, $timeout, $ionicScrollDelegate, $location, addressBookService, lodash) {
  
  var contacts;

  var initAddressbook = function() {
    addressBookService.list(function(err, ab) {
      if (err) {
        $log.error(err.message);
      }
      contacts = ab;

      $scope.isEmptyList = lodash.isEmpty(ab);
      $scope.showAddButton = !$scope.isEmptyList;
      $scope.addressbook = lodash.clone(ab);

      $timeout(function() {
        $scope.$apply();
      });
    });
  };

  $scope.findAddressbook = function(search) {
    if (!search || search.length < 2) {
      $scope.addressbook = contacts;
      $timeout(function() {
        $scope.$apply();
      }, 10);
      return;
    }

    var result = lodash.filter(contacts, function(item) {
      var val = item.name;
      return lodash.includes(val.toLowerCase(), search.toLowerCase());
    });

    $scope.addressbook = result;
  };

  $scope.$on("$ionicView.beforeEnter", function(event, data) {
    $scope.showAddButton = false;

    // Position to first entry
    $ionicScrollDelegate.scrollTo(0, 64);

    $scope.addrSearch = { value: null };
    initAddressbook();
  });

});
