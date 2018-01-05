'use strict';

angular.module('owsWalletApp.directives')
  .directive('itemSelector', function($timeout) {
    return {
      restrict: 'E',
      templateUrl: 'views/includes/itemSelector.html',
      transclude: true,
      scope: {
        show: '=itemSelectorShow',
        onSelect: '=itemSelectorOnSelect'
      },
      link: function(scope, element, attrs) {
        scope.hide = function() {
          scope.show = false;
        };
      }
    };
  });
