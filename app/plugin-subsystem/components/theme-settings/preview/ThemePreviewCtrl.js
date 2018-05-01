'use strict';

angular.module('owsWalletApp.pluginControllers').controller('ThemePreviewCtrl',
  function($scope, $state, $log, profileService, go, themeService) {

  this.save = function(themeId) {
    themeService.setTheme(themeId, true, function() {
      $state.go('preferencesTheme');
    });
  };

  this.canDeleteTheme = function(themeId) {
		return (themeService.getPublishedThemeId() != themeId) && themeService.getCatalogThemeById(themeId).canDelete();
  };

  this.delete = function(themeId) {
    themeService.deleteTheme(themeId, function() {
      $state.go('preferencesTheme');
    });
  };

  this.like = function(themeId) {
    themeService.likeTheme(themeId);
  };

});
