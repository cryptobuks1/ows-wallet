'use strict';

angular.module('owsWalletApp.pluginControllers').controller('ThemeDiscoveryPreviewCtrl',
  function($rootScope, $state, $log, go, themeService) {

  	var self = this;

    this.import = function(discoveredThemeId) {
      self.inProgress = true;
	    self.progressMessage = 'Importing theme...';
      var discoveredThemeName = $rootScope.discoveredThemeHeaders[discoveredThemeId].name;
      themeService.importTheme(discoveredThemeName, true, function() {
	      self.inProgress = false;
	      $state.go('preferencesThemeDiscovery');
      });
    };

});
