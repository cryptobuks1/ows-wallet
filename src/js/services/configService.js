'use strict';

angular.module('owsWalletApp.services').factory('configService', function(storageService, lodash, $log, $timeout, $rootScope, networkService, appConfigService) {
  var root = {};

  var defaultConfig = {
    // wallet limits
    limits: {
      totalCopayers: 6,
      mPlusN: 100,
    },

    // wallet default config
    wallet: {
      requiredCopayers: 2,
      totalCopayers: 3,
      spendUnconfirmed: false,
      reconnectDelay: 5000,
      idleDurationMin: 4,
      settings: {}
    },

    currencyNetworks: networkService.defaultConfig(),

    lock: {
      method: null,
      value: null,
      bannedUntil: null,
    },

    // External services
    recentTransactions: {
      enabled: true,
    },

    hideNextSteps: {
      enabled: false,
    },

    release: {
      url: appConfigService.gitHubRepoApiLatestReleases
    },

    pushNotificationsEnabled: true,

    confirmedTxsNotifications: {
      enabled: true,
    },

    emailNotifications: {
      enabled: false,
    },

    log: {
      filter: 'debug',
    },
  };

  var configCache = null;

  root.getSync = function() {
    if (!configCache)
      throw new Error('configService#getSync called when cache is not initialized');

    return configCache;
  };

  root._queue = [];
  root.whenAvailable = function(cb) {
    if (!configCache) {
      root._queue.push(cb);
      return;
    }
    return cb(configCache);
  };

  root.get = function(cb) {
    storageService.getConfig(function(err, localConfig) {
      if (localConfig) {
        configCache = JSON.parse(localConfig);

        //these ifs are to avoid migration problems
        if (!configCache.currencyNetworks) {
          configCache.currencyNetworks = defaultConfig.currencyNetworks;
        }
        if (!configCache.wallet) {
          configCache.wallet = defaultConfig.wallet;
        }
        if (!configCache.hideNextSteps) {
          configCache.hideNextSteps = defaultConfig.hideNextSteps;
        }
        if (!configCache.recentTransactions) {
          configCache.recentTransactions = defaultConfig.recentTransactions;
        }
        if (!configCache.pushNotifications) {
          configCache.pushNotifications = defaultConfig.pushNotifications;
        }

      } else {
        configCache = lodash.clone(defaultConfig);
      };

      configCache.walletServiceFor = configCache.walletServiceFor || {};
      configCache.colorFor = configCache.colorFor || {};
      configCache.aliasFor = configCache.aliasFor || {};
      configCache.emailFor = configCache.emailFor || {};

      $log.debug('Preferences read:', configCache)

      lodash.each(root._queue, function(x) {
        $timeout(function() {
          return x(configCache);
        }, 1);
      });
      root._queue = [];

      return cb(err, configCache);
    });
  };

  root.set = function(newOpts, cb) {
    var config = lodash.cloneDeep(defaultConfig);
    storageService.getConfig(function(err, oldOpts) {
      oldOpts = oldOpts || {};

      if (lodash.isString(oldOpts)) {
        oldOpts = JSON.parse(oldOpts);
      }
      if (lodash.isString(config)) {
        config = JSON.parse(config);
      }
      if (lodash.isString(newOpts)) {
        newOpts = JSON.parse(newOpts);
      }

      lodash.merge(config, oldOpts, newOpts);
      configCache = config;

      $rootScope.$emit('Local/SettingsUpdated');

      storageService.storeConfig(JSON.stringify(config), cb);
    });
  };

  root.reset = function(cb) {
    configCache = lodash.clone(defaultConfig);
    storageService.removeConfig(cb);
  };

  root.getDefaults = function() {
    return lodash.clone(defaultConfig);
  };


  return root;
});
