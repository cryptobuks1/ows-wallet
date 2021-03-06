'use strict';

angular.module('owsWalletApp.controllers').controller('SendCtrl', function($scope, $rootScope, $log, $timeout, $ionicScrollDelegate, $ionicHistory, addressBookService, profileService, lodash, $state, walletService, incomingDataService, popupService, gettextCatalog, networkService) {

  var originalList;
  var CONTACTS_SHOW_LIMIT;
  var currentContactsPage;

  $scope.$on("$ionicView.beforeEnter", function(event, data) {
    $scope.walletId = data.stateParams.walletId;
    $scope.formData = {
      search: null
    };
    originalList = [];
    CONTACTS_SHOW_LIMIT = 10;
    currentContactsPage = 0;

    $scope.hasWallets = hasWallets();

    if ($scope.hasWallets) {
      profileService.hasFunds({}, function(hasFunds) {
        $scope.hasFunds = hasFunds;
        $timeout(function() {
          $scope.$apply();
        });

        updateWalletsList();
        updateContactsList(function() {
          updateList();
        });

      });
    }
  });

  $scope.openScanner = function() {
    $state.go($rootScope.sref('scan'));
  };

  $scope.showMore = function() {
    currentContactsPage++;
    updateWalletsList();
  };

  $scope.searchInFocus = function() {
    $scope.searchFocus = true;
  };

  $scope.searchBlurred = function() {
    if ($scope.formData.search == null || $scope.formData.search.length == 0) {
      $scope.searchFocus = false;
    }
  };

  $scope.findContact = function(search) {
    incomingDataService.process(search, {}, function(handled) {
      if (handled) {
        return;
      }

      if (!search || search.length < 2) {
        $scope.list = originalList;
        $timeout(function() {
          $scope.$apply();
        });
        return;
      }

      var result = lodash.filter(originalList, function(item) {
        var val = item.name;
        return lodash.includes(val.toLowerCase(), search.toLowerCase());
      });

      $scope.list = result;

    });
  };

  $scope.onContactAddressSelect = function(contact, index) {
    $scope.casSelected = index;

    // Create an item and transition to the amount view with it.
    $scope.goToAmount({
      recipientType: 'contact',
      contactId: contact.id,
      getAddress: function(cb) {
        return cb(null, contact.addresses[index]);
      }
    });
  };

  $scope.goToAmount = function(item) {
    $timeout(function() {
      if (item.recipientType == 'contact') {

        addressBookService.get(item.contactId, function(err, entry) {
          if (err) {
            return popupService.showAlert(err.title, err.message);
          }

          item.getAddress(function(err, addr) {
            if (lodash.isArray(addr)) {
              // Multiple addresses. Present UI to choose one.
              // Replace the contacts addresses with the filtered list.
              entry.addresses = addr;

              $scope.casTitle = entry.name + '\'s addresses';
              $scope.casContact = entry;
              $scope.casSelected = $scope.casSelected || 0; // Arbitrarily select the first entry if not set.

              $scope.showContactAddressSelector = true;

            } else {
              // Single address.  Just select it, no need to require user to select from UI.
              $log.debug('Got toAddress:' + addr.address + ' | ' + entry.name);
              return $state.transitionTo($rootScope.sref('send.amount'), {
                recipientType: item.recipientType,
                networkName: addr.networkName,
                toAddress: addr.address,
                toName: entry.name + (addr.label ? ' - ' + addr.label : ''),
                toEmail: entry.email
              });
            }
          });
        });

      } else {

        // Recipient is not a contact in our address book.
        item.getAddress(function(err, addr) {
          if (err || !addr) {
            return popupService.showAlert(err);
          }

          $log.debug('Got toAddress:' + addr + ' | ' + item.name);
          return $state.transitionTo($rootScope.sref('send.amount'), {
            recipientType: item.recipientType,
            walletId: $scope.walletId,
            networkName: item.networkName,
            toAddress: addr,
            toName: item.name + (item.label ? ' - ' + item.label : ''),
            toEmail: item.email,
            toColor: item.color
          });
        });
      };
    });
  };

  // This could probably be enhanced refactoring the routes abstract states
  $scope.createWallet = function() {
    $state.go($rootScope.sref('home')).then(function() {
      $state.go($rootScope.sref('add.create-personal'));
    });
  };

  function hasWallets() {
    $scope.wallets = profileService.getWallets({
      onlyComplete: true
    });
    return lodash.isEmpty($scope.wallets) ? false : true;
  };

  function updateWalletsList() {
    $scope.showTransferCard = $scope.hasWallets;

    if ($scope.showTransferCard) {
      var walletsToTransfer = $scope.wallets;

      // If a sending walletId is specified then filter the transfer list by sending wallet network.
      if ($scope.walletId) {
        var sendingWallet = profileService.getWallet($scope.walletId);
      }

      var walletList = [];
      lodash.each(walletsToTransfer, function(w) {
        walletList.push({
          networkName: w.networkName,
          color: w.color,
          name: w.name,
          recipientType: 'wallet',
          needsBackup: w.needsBackup,
          getAddress: function(cb) {
            walletService.getAddress(w, false, cb);
          },
        });
      });
      originalList = originalList.concat(walletList);
    }
  }

  function updateContactsList(cb) {
    addressBookService.list(function(err, ab) {
      if (err) {
        $log.error(err.message);
      }

      $scope.hasContacts = lodash.isEmpty(ab) ? false : true;
      if (!$scope.hasContacts) {
        return cb();
      }

      var sendingWallet = profileService.getWallet($scope.walletId);
      var completeContacts = [];

      lodash.forEach(ab, function(entry) {
        // If a sending wallet is specified then filter the contact list by sending wallet network, else include all contacts.
        var addresses = entry.addresses;

        if (sendingWallet) {
          addresses = lodash.filter(entry.addresses, function(address) {
            return address.networkName == sendingWallet.networkName;
          });
        }

        if (addresses.length > 1) {
          completeContacts.push({
            recipientType: 'contact',
            contactId: entry.id,
            name: entry.name,
            email: entry.email,
            getAddress: function(cb) {
              return cb(null, addresses);
            }
          });
        } else if (addresses.length == 1) {
          completeContacts.push({
            recipientType: 'contact',
            contactId: entry.id,
            name: entry.name,
            email: entry.email,
            getAddress: function(cb) {
              return cb(null, addresses[0]);
            }
          });
        }
      });

      var contacts = completeContacts.slice(0, (currentContactsPage + 1) * CONTACTS_SHOW_LIMIT);
      $scope.contactsShowMore = completeContacts.length > contacts.length;
      originalList = originalList.concat(contacts);
      return cb();
    });
  };

  function updateList() {
    $scope.list = lodash.clone(originalList);
    $timeout(function() {
      $ionicScrollDelegate.resize();
      $scope.$apply();
    }, 10);
  };

});
