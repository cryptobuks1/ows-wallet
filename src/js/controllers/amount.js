'use strict';

angular.module('owsWalletApp.controllers').controller('amountController', function($scope, $filter, $timeout, $ionicScrollDelegate, $ionicHistory, gettextCatalog, platformInfo, lodash, configService, rateService, $stateParams, $window, $state, $log, txFormatService, ongoingProcess, popupService, walletClientError, payproService, profileService, nodeWebkitService, networkService) {
  var _id;
  var atomicUnitToUnit;
  var atomicUnitDecimals;
  var unitToAtomicUnit;
  var unitDecimals;
  var SMALL_FONT_SIZE_LIMIT = 10;
  var LENGTH_EXPRESSION_LIMIT = 19;
  var isNW = platformInfo.isNW;

  $scope.$on('$ionicView.leave', function() {
    angular.element($window).off('keydown');
  });

  $scope.$on("$ionicView.beforeEnter", function(event, data) {
    // Go to...
    _id = data.stateParams.id; // Optional wallet ID
    $scope.nextStep = data.stateParams.nextStep;
    $scope.currency = data.stateParams.currency;
    $scope.forceCurrency = data.stateParams.forceCurrency;

    $scope.allowOptionsMenu = $ionicHistory.backView() && $ionicHistory.backView().stateName == 'tabs.send';
    $scope.recipientType = data.stateParams.recipientType || null;
    $scope.walletId = data.stateParams.walletId;
    $scope.networkURI = data.stateParams.networkURI || configService.getSync().currencyNetworks.default;
    $scope.toAddress = data.stateParams.toAddress;
    $scope.toName = data.stateParams.toName;
    $scope.toEmail = data.stateParams.toEmail;
    $scope.showAlternativeAmount = !!$scope.nextStep;
    $scope.toColor = data.stateParams.toColor;
    $scope.showOptionsMenu = false;

    if (!$scope.nextStep && !data.stateParams.toAddress) {
      $log.error('Bad params at amount')
      throw ('bad params');
    }

    var reNr = /^[1234567890\.]$/;
    var reOp = /^[\*\+\-\/]$/;

    var disableKeys = angular.element($window).on('keydown', function(e) {
      if (!e.key) return;
      if (e.which === 8) { // you can add others here inside brackets.
        e.preventDefault();
        $scope.removeDigit();
      }

      if (e.key.match(reNr)) {
        $scope.pushDigit(e.key);
      } else if (e.key.match(reOp)) {
        $scope.pushOperator(e.key);
      } else if (e.keyCode === 86) {
        if (e.ctrlKey || e.metaKey)
          processClipboard();
      } else if (e.keyCode === 13)
        $scope.finish();

      $timeout(function() {
        $scope.$apply();
      });
    });

    var configNetwork = configService.getSync().currencyNetworks[$scope.networkURI];
    $scope.unitName = configNetwork.unitName;
    unitToAtomicUnit = configNetwork.unitToAtomicUnit;
    unitDecimals = configNetwork.unitDecimals;
    atomicUnitToUnit = 1 / unitToAtomicUnit;
    atomicUnitDecimals = networkService.getAtomicUnit($scope.networkURI);

    if (data.stateParams.currency) {
      $scope.alternativeIsoCode = data.stateParams.currency;
    } else {
      $scope.alternativeIsoCode = configNetwork.alternativeIsoCode;
    }
    $scope.specificAmount = $scope.specificAlternativeAmount = '';
    $scope.isCordova = platformInfo.isCordova;
    $scope.resetAmount();

    // in atomicUnit ALWAYS
    if ($stateParams.toAmount) {
      $scope.amount = (($stateParams.toAmount) * atomicUnitToUnit).toFixed(unitDecimals);
    }

    processAmount();

    $timeout(function() {
      $ionicScrollDelegate.resize();
    }, 10);
  });

  function paste(value) {
    $scope.amount = value;
    processAmount();
    $timeout(function() {
      $scope.$apply();
    });
  };

  function processClipboard() {
    if (!isNW) return;
    var value = nodeWebkitService.readFromClipboard();
    if (value && evaluate(value) > 0) paste(evaluate(value));
  };

  $scope.openOptionsMenu = function() {
    $scope.showOptionsMenu = true;
  };

  $scope.sendMax = function() {
    $scope.showOptionsMenu = false;
    $scope.useSendMax = true;
    $scope.finish();
  };

  $scope.toggleAlternative = function() {
    if ($scope.forceCurrency) return;
    $scope.showAlternativeAmount = !$scope.showAlternativeAmount;

    if ($scope.amount && isExpression($scope.amount)) {
      var amount = evaluate(format($scope.amount));
      $scope.globalResult = '= ' + processResult(amount);
    }
  };

  function checkFontSize() {
    if ($scope.amount && $scope.amount.length >= SMALL_FONT_SIZE_LIMIT) $scope.smallFont = true;
    else $scope.smallFont = false;
  };

  $scope.pushDigit = function(digit) {
    if ($scope.amount && $scope.amount.length >= LENGTH_EXPRESSION_LIMIT) return;
    if ($scope.amount.indexOf('.') > -1 && digit == '.') return;
    if ($scope.showAlternativeAmount && $scope.amount.indexOf('.') > -1 && $scope.amount[$scope.amount.indexOf('.') + 2]) return;

    $scope.amount = ($scope.amount + digit).replace('..', '.');
    checkFontSize();
    processAmount();
  };

  $scope.pushOperator = function(operator) {
    if (!$scope.amount || $scope.amount.length == 0) return;
    $scope.amount = _pushOperator($scope.amount);

    function _pushOperator(val) {
      if (!isOperator(lodash.last(val))) {
        return val + operator;
      } else {
        return val.slice(0, -1) + operator;
      }
    };
  };

  function isOperator(val) {
    var regex = /[\/\-\+\x\*]/;
    return regex.test(val);
  };

  function isExpression(val) {
    var regex = /^\.?\d+(\.?\d+)?([\/\-\+\*x]\d?\.?\d+)+$/;
    return regex.test(val);
  };

  $scope.removeDigit = function() {
    $scope.amount = ($scope.amount).toString().slice(0, -1);
    processAmount();
    checkFontSize();
  };

  $scope.resetAmount = function() {
    $scope.amount = $scope.alternativeResult = $scope.amountResult = $scope.globalResult = '';
    $scope.allowSend = false;
    checkFontSize();
  };

  function processAmount() {
    var formatedValue = format($scope.amount);
    var result = evaluate(formatedValue);
    $scope.allowSend = lodash.isNumber(result) && +result > 0;
    if (lodash.isNumber(result)) {
      $scope.globalResult = isExpression($scope.amount) ? '= ' + processResult(result) : '';
      $scope.amountResult = $filter('formatFiatAmount')(toFiat(result));
      $scope.alternativeResult = txFormatService.formatAmount($scope.networkURI, fromFiat(result) * unitToAtomicUnit, true);
    }
  };

  function processResult(val) {
    if ($scope.showAlternativeAmount)
      return $filter('formatFiatAmount')(val);
    else
      return txFormatService.formatAmount($scope.networkURI, val.toFixed(unitDecimals) * unitToAtomicUnit, true);
  };

  function fromFiat(val) {
    return parseFloat((rateService.fromFiat($scope.networkURI, val, $scope.alternativeIsoCode) * atomicUnitToUnit).toFixed(unitDecimals));
  };

  function toFiat(val) {
    return parseFloat((rateService.toFiat($scope.networkURI, val * unitToAtomicUnit, $scope.alternativeIsoCode)).toFixed(2));
  };

  function evaluate(val) {
    var result;
    try {
      result = $scope.$eval(val);
    } catch (e) {
      return 0;
    }
    if (!lodash.isFinite(result)) return 0;
    return result;
  };

  function format(val) {
    var result = val.toString();

    if (isOperator(lodash.last(val)))
      result = result.slice(0, -1);

    return result.replace('x', '*');
  };

  $scope.finish = function() {
    var _amount = evaluate(format($scope.amount));

    if ($scope.nextStep) {
      $state.transitionTo($scope.nextStep, {
        id: _id,
        amount: $scope.useSendMax ? null : _amount,
        currency: $scope.showAlternativeAmount ? $scope.alternativeIsoCode : $scope.unitName,
        useSendMax: $scope.useSendMax
      });
    } else {
      var amount = $scope.showAlternativeAmount ? fromFiat(_amount) : _amount;
      $state.transitionTo('tabs.send.confirm', {
        walletId: $scope.walletId,
        networkURI: $scope.networkURI,
        recipientType: $scope.recipientType,
        toAmount: $scope.useSendMax ? null : (amount * unitToAtomicUnit).toFixed(atomicUnitDecimals),
        toAddress: $scope.toAddress,
        toName: $scope.toName,
        toEmail: $scope.toEmail,
        toColor: $scope.toColor,
        useSendMax: $scope.useSendMax
      });
    }
    $scope.useSendMax = null;
  };
});
