'use strict';

angular.module('owsWalletApp.pluginControllers').controller('ThemeDiscoveryCtrl',
  function($rootScope, $scope, $state, $log, go, themeService, configService) {

    var self = this;
    var config = configService.getSync();
    this.themeGalleryLayout = config.view.themeGalleryLayout;

    var nextLayout = {};
    nextLayout['grid'] = 'list';
    nextLayout['list'] = 'list-detail';
    nextLayout['list-detail'] = 'grid';

  	self.themesFound = true;
  	self.inProgress = true;
    self.progressMessage = 'Searching for themes...';
  	
    themeService.discoverThemes(function(discoveredThemeHeaders) {
    	self.inProgress = false;
 			self.themesFound = discoveredThemeHeaders.length > 0;
    });

    this.preview = function(discoveredThemeId) {
      $rootScope.discoveredThemeId = discoveredThemeId;
      $state.go('preferencesThemeDiscoveryPreview');
    };

    this.import = function(discoveredThemeId) {
      self.inProgress = true;
      self.progressMessage = 'Importing theme...';
      var discoveredThemeName = $rootScope.discoveredThemeHeaders[discoveredThemeId].name;
      themeService.importTheme(discoveredThemeName, true, function() {
        self.inProgress = false;
      });
    };

    // Listen for layout events from the topbar controller.
    var deregisterChangeLayout = $rootScope.$on('themeLayout', function(event) {
      if (!self.themesFound)
        return;

      var config = configService.getSync();
      self.themeGalleryLayout = nextLayout[self.themeGalleryLayout];

      var config = configService.getSync();
      var opts = {
        view: {
          themeGalleryLayout: {}
        }
      };

      opts.view.themeGalleryLayout = self.themeGalleryLayout;

      configService.set(opts, function(err) {
        if (err) {
          $log.error(err);
        }
      });
    });

    // Stop listening for change layout events when this page is destroyed.
    $scope.$on('$destroy', function() {
      deregisterChangeLayout();
    });

});
