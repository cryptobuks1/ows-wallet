'use strict';

var modules = [
  'angularMoment',
  'monospaced.qrcode',
  'gettext',
  'ionic',
  'ionic-toast',
  'angular-clipboard',
  'ngTouch',
  'ngLodash',
  'ngCsv',
  'angular-md5',
  'gridster',
  'angular-pattern-lock',
  'bchWalletClientModule',
  'btcWalletClientModule',
//  'ltcWalletClientModule',
  'bitauthModule',
  'owsWalletApp.filters',
  'owsWalletApp.services',
  'owsWalletApp.controllers',
  'owsWalletApp.directives'
];

var owsWalletApp = window.owsWalletApp = angular.module('owsWalletApp', modules);

angular.module('owsWalletApp.filters', []);
angular.module('owsWalletApp.services', []);
angular.module('owsWalletApp.controllers', []);
angular.module('owsWalletApp.directives', []);
