'use strict';

angular.module('owsWalletApp.services').factory('derivationPathService', function(lodash, networkService) {
  var root = {};

  var defaultPath = "m/44'/0'/0'";
  var defaultTestnetPath = "m/44'/1'/0'";

  root.getPath = function(network) {
    if (networkService.isTestnet(network.getURI())) {
      return defaultTestnetPath;
    } else {
      return defaultPath;
    }
  };

  root.parse = function(str, network) {
    var arr = str.split('/');

    var ret = {};

    if (arr[0] != 'm')
      return false;

    switch (arr[1]) {
      case "44'":
        ret.derivationStrategy = 'BIP44';
        break;
      case "45'":
        return {
          derivationStrategy: 'BIP45',
          networkURI: networkService.getLivenetForCurrency(network.currency).getURI(),
          account: 0,
        }
        break;
      case "48'":
        ret.derivationStrategy = 'BIP48';
        break;
      default:
        return false;
    };

    switch (arr[2]) {
      case "0'":
          ret.networkURI = networkService.getLivenetForCurrency(network.currency).getURI();
        break;
      case "1'":
          ret.networkURI = networkService.getTestnetForCurrency(network.currency).getURI();
        break;
      default:
        return false;
    };

    var match = arr[3].match(/(\d+)'/);
    if (!match)
      return false;
    ret.account = +match[1]

    return ret;
  };

  return root;
});
