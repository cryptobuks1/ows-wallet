'use strict';
angular.module('owsWalletApp.services')
  .factory('profileService', function profileServiceFactory($rootScope, $timeout, $log, lodash, storageService, configService, gettextCatalog, walletClientError, uxLanguage, platformInfo, txFormatService, appConfigService, networkService, walletService) {


    var isCordova = platformInfo.isCordova;
    var isIOS = platformInfo.isIOS;

    var root = {};
    var usePushNotifications = isCordova;

    var UPDATE_PERIOD = 15;

    root.profile = null;

    Object.defineProperty(root, "focusedClient", {
      get: function() {
        throw "focusedClient is not used any more"
      },
      set: function() {
        throw "focusedClient is not used any more"
      }
    });


    root.wallet = {}; // decorated version of client

    root.updateWalletSettings = function(wallet) {
      var defaults = configService.getDefaults();
      configService.whenAvailable(function(config) {
        wallet.usingCustomWalletService = config.walletServiceFor && config.walletServiceFor[wallet.id] && (config.walletServiceFor[wallet.id] != defaults.currencyNetworks[defaults.currencyNetworks.default].walletService.url);
        wallet.name = (config.aliasFor && config.aliasFor[wallet.id]) || wallet.credentials.walletName;
        wallet.color = (config.colorFor && config.colorFor[wallet.id]);
        wallet.email = config.emailFor && config.emailFor[wallet.id];
      });
    }

    root.setBackupFlag = function(walletId) {
      storageService.setBackupFlag(walletId, function(err) {
        if (err) $log.error(err);
        $log.debug('Backup flag stored');
        root.wallet[walletId].needsBackup = false;
      });
    };

    function _requiresBackup(wallet) {
      if (wallet.isPrivKeyExternal()) return false;
      if (!wallet.credentials.mnemonic) return false;
      if (networkService.isTestnet(wallet.networkURI)) return false;

      return true;
    };

    function _needsBackup(wallet, cb) {
      if (!_requiresBackup(wallet))
        return cb(false);

      storageService.getBackupFlag(wallet.credentials.walletId, function(err, val) {
        if (err) $log.error(err);
        if (val) return cb(false);
        return cb(true);
      });
    };

    function _balanceIsHidden(wallet, cb) {
      storageService.getHideBalanceFlag(wallet.credentials.walletId, function(err, shouldHideBalance) {
        if (err) $log.error(err);
        var hideBalance = (shouldHideBalance == 'true') ? true : false;
        return cb(hideBalance);
      });
    };

    function _getNetworkURI(credentials) {
      return credentials.network + '/' + credentials.currency;
    };

    // Adds a wallet client to profileService
    root.bindWalletClient = function(wallet, opts) {
      var opts = opts || {};
      var walletId = wallet.credentials.walletId;

      if ((root.wallet[walletId] && root.wallet[walletId].started) && !opts.force) {
        return false;
      }

      // INIT WALLET VIEWMODEL
      wallet.id = walletId;
      wallet.started = true;
      wallet.doNotVerifyPayPro = false;
      wallet.network = wallet.credentials.network;
      wallet.currency = wallet.credentials.currency;
      wallet.networkURI = _getNetworkURI(wallet.credentials);
      wallet.copayerId = wallet.credentials.copayerId;
      wallet.m = wallet.credentials.m;
      wallet.n = wallet.credentials.n;

      root.updateWalletSettings(wallet);
      root.wallet[walletId] = wallet;

      _needsBackup(wallet, function(val) {
        wallet.needsBackup = val;
      });

      _balanceIsHidden(wallet, function(val) {
        wallet.balanceHidden = val;
      });

      wallet.removeAllListeners();

      wallet.on('report', function(n) {
        $log.info('Wallet Client Report (' + wallet.networkURI + '):' + n);
      });

      wallet.on('notification', function(n) {
        $log.debug('Wallet Client Notification (' + wallet.networkURI + '):', n);

        if (n.type == "NewBlock" && networkService.isTestnet(n.data.network)) {
          throttledWalletServiceEvent(n, wallet);
        } else newWalletServiceEvent(n, wallet);
      });

      wallet.on('walletCompleted', function() {
        $log.debug('Wallet completed (' + wallet.networkURI + ')');

        root.updateCredentials(JSON.parse(wallet.export()), function() {
          $rootScope.$emit('Local/WalletCompleted', walletId);
        });
      });

      wallet.initialize({
        notificationIncludeOwn: true,
      }, function(err) {
        if (err) {
          $log.error('Could not init notifications err:', err);
          return;
        }
        wallet.setNotificationsInterval(UPDATE_PERIOD);
        wallet.openWallet(function(err) {
          if (wallet.status !== true)
            $log.debug('Wallet + ' + walletId + ' status:' + wallet.status)
        });
      });

      $rootScope.$on('Local/SettingsUpdated', function(e, walletId) {
        if (!walletId || walletId == wallet.id) {
          $log.debug('Updating settings for wallet:' + wallet.id);
          root.updateWalletSettings(wallet);
        }
      });

      return true;
    };

    var throttledWalletServiceEvent = lodash.throttle(function(n, wallet) {
      newWalletServiceEvent(n, wallet);
    }, 10000);

    var newWalletServiceEvent = function(n, wallet) {
      if (wallet.cachedStatus)
        wallet.cachedStatus.isValid = false;

      if (wallet.completeHistory)
        wallet.completeHistory.isValid = false;

      if (wallet.cachedActivity)
        wallet.cachedActivity.isValid = false;

      if (wallet.cachedTxps)
        wallet.cachedTxps.isValid = false;

      $rootScope.$emit('walletServiceEvent', wallet.id, n.type, n);
    };

    var validationLock = false;

    root.runValidation = function(client, delay, retryDelay) {

      delay = delay || 500;
      retryDelay = retryDelay || 50;

      if (validationLock) {
        return $timeout(function() {
          $log.debug('ValidatingWallet Locked: Retrying in: ' + retryDelay);
          return root.runValidation(client, delay, retryDelay);
        }, retryDelay);
      }
      validationLock = true;

      // IOS devices are already checked
      var skipDeviceValidation = isIOS || root.profile.isDeviceChecked(platformInfo.ua);
      var walletId = client.credentials.walletId;

      $log.debug('ValidatingWallet: ' + walletId + ' skip Device:' + skipDeviceValidation);
      $timeout(function() {
        client.validateKeyDerivation({
          skipDeviceValidation: skipDeviceValidation,
        }, function(err, isOK) {
          validationLock = false;

          $log.debug('ValidatingWallet End:  ' + walletId + ' isOK:' + isOK);
          if (isOK) {
            root.profile.setChecked(platformInfo.ua, walletId);
          } else {
            $log.warn('Key Derivation failed for wallet:' + walletId);
            storageService.clearLastAddress(walletId, function() {});
          }

          root.storeProfileIfDirty();
        });
      }, delay);
    };

    var shouldSkipValidation = function(walletId) {
      return root.profile.isChecked(platformInfo.ua, walletId) || isIOS;
    }

    var getWalletServiceUrl = function(credentials) {
      var config = configService.getSync();
      var defaults = configService.getDefaults();
      var networkURI = _getNetworkURI(credentials);
      return ((config.walletServiceFor && config.walletServiceFor[credentials.walletId]) || defaults.currencyNetworks[networkURI].walletService.url);
    };

    // Used when reading wallets from the profile
    root.bindWallet = function(credentials, cb) {
      if (!credentials.walletId || !credentials.m)
        return cb('bindWallet should receive credentials JSON');

      // Create the client
      var networkURI = _getNetworkURI(credentials);
      var client = networkService.walletClientFor(networkURI).getClient(JSON.stringify(credentials), {
        walletServiceUrl: getWalletServiceUrl(credentials)
      });

      var skipKeyValidation = shouldSkipValidation(credentials.walletId);
      if (!skipKeyValidation)
        root.runValidation(client, 500);

      $log.info('Binding wallet:' + credentials.walletId + ' Validating?:' + !skipKeyValidation);
      return cb(null, root.bindWalletClient(client));
    };

    root.bindProfile = function(profile, cb) {
      root.profile = profile;

      configService.get(function(err) {
        $log.debug('Preferences read');
        if (err) return cb(err);

        function bindWallets(cb) {
          var l = root.profile.credentials.length;
          var i = 0,
            totalBound = 0;

          if (!l) return cb();

          lodash.each(root.profile.credentials, function(credentials) {
            root.bindWallet(credentials, function(err, bound) {
              i++;
              totalBound += bound;
              if (i == l) {
                $log.info('Bound ' + totalBound + ' out of ' + l + ' wallets');
                return cb();
              }
            });
          });
        }

        bindWallets(function() {
          root.isBound = true;

          lodash.each(root._queue, function(x) {
            $timeout(function() {
              return x();
            }, 1);
          });
          root._queue = [];



          root.isDisclaimerAccepted(function(val) {
            if (!val) {
              return cb(new Error('NONAGREEDDISCLAIMER: Non agreed disclaimer'));
            }
            return cb();
          });
        });
      });
    };

    root._queue = [];
    root.whenAvailable = function(cb) {
      if (!root.isBound) {
        root._queue.push(cb);
        return;
      }
      return cb();
    };

    root.loadAndBindProfile = function(cb) {
      storageService.getProfile(function(err, profile) {
        if (err) {
          $rootScope.$emit('Local/DeviceError', err);
          return cb(err);
        }
        if (!profile) {
          return cb(new Error('NOPROFILE: No profile'));
        } else {
          $log.debug('Profile read');
          return root.bindProfile(profile, cb);
        }
      });
    };

    var seedWallet = function(opts, cb) {
      var config = configService.getSync();
      opts = opts || {};
      var walletClient = networkService.walletClientFor(opts.network.getURI()).getClient(null, opts);

      if (opts.mnemonic) {
        try {
          opts.mnemonic = root._normalizeMnemonic(opts.mnemonic);
          walletClient.seedFromMnemonic(opts.mnemonic, {
            network: opts.network.net,
            passphrase: opts.passphrase,
            account: opts.account || 0,
            derivationStrategy: opts.derivationStrategy || 'BIP44',
          });

        } catch (ex) {
          $log.info(ex);
          return cb(gettextCatalog.getString('Could not create: Invalid wallet recovery phrase'));
        }
      } else if (opts.extendedPrivateKey) {
        try {
          walletClient.seedFromExtendedPrivateKey(opts.extendedPrivateKey);
        } catch (ex) {
          $log.warn(ex);
          return cb(gettextCatalog.getString('Could not create using the specified extended private key'));
        }
      } else if (opts.extendedPublicKey) {
        try {
          walletClient.seedFromExtendedPublicKey(opts.extendedPublicKey, opts.externalSource, opts.entropySource, {
            account: opts.account || 0,
            derivationStrategy: opts.derivationStrategy || 'BIP44',
          });
          walletClient.credentials.hwInfo = opts.hwInfo;
        } catch (ex) {
          $log.warn("Creating wallet from Extended Public Key Arg:", ex, opts);
          return cb(gettextCatalog.getString('Could not create using the specified extended public key'));
        }
      } else {
        var lang = uxLanguage.getCurrentLanguage();
        try {
          walletClient.seedFromRandomWithMnemonic({
            network: opts.network.net,
            passphrase: opts.passphrase,
            language: lang,
            account: 0,
          });
        } catch (e) {
          $log.info('Error creating recovery phrase: ' + e.message);
          if (e.message.indexOf('language') > 0) {
            $log.info('Using default language for recovery phrase');
            walletClient.seedFromRandomWithMnemonic({
              network: opts.network.net,
              passphrase: opts.passphrase,
              account: 0,
            });
          } else {
            return cb(e);
          }
        }
      }

      return cb(null, walletClient);
    };

    // Creates a wallet on the walletService
    var doCreateWallet = function(opts, cb) {
      var showOpts = lodash.clone(opts);
      if (showOpts.extendedPrivateKey) showOpts.extendedPrivateKey = '[hidden]';
      if (showOpts.mnemonic) showOpts.mnemonic = '[hidden]';

      $log.debug('Creating Wallet:', showOpts);
      
      $timeout(function() {
        seedWallet(opts, function(err, walletClient) {
          if (err) return cb(err);

          var name = opts.name || gettextCatalog.getString('Personal Wallet');
          var myName = opts.myName || gettextCatalog.getString('me');

          walletClient.createWallet(name, myName, opts.m, opts.n, {
            network: opts.network.net,
            singleAddress: opts.singleAddress,
            walletPrivKey: opts.walletPrivKey,
          }, function(err, secret) {
            if (err) return walletClientError.cb(err, gettextCatalog.getString('Error creating wallet'), cb);
            return cb(null, walletClient, secret);
          });
        });
      }, 50);
    };

    // create and store a wallet
    root.createWallet = function(opts, cb) {
      doCreateWallet(opts, function(err, walletClient, secret) {
        if (err) return cb(err);

        addAndBindWalletClient(walletClient, {
          walletServiceUrl: opts.walletServiceUrl
        }, cb);
      });
    };

    // joins and stores a wallet
    root.joinWallet = function(opts, cb) {
      var config = configService.getSync();
      opts = opts || {};
      opts.walletServiceUrl = config.currencyNetworks[opts.networkURI].walletService.url;
      var walletClient = networkService.walletClientFor(opts.networkURI).getClient(null, opts);
      $log.debug('Joining Wallet:', opts);

      try {
        var walletData = networkService.walletClientFor(opts.networkURI).parseSecret(opts.secret);

        // check if exist
        if (lodash.find(root.profile.credentials, {
            'walletId': walletData.walletId
          })) {
          return cb(gettextCatalog.getString('Cannot join the same wallet more that once'));
        }
      } catch (ex) {
        $log.debug(ex);
        return cb(gettextCatalog.getString('Bad wallet invitation'));
      }
      opts.networkURI = walletData.network;
      $log.debug('Joining Wallet:', opts);

      seedWallet(opts, function(err, walletClient) {
        if (err) return cb(err);

        walletClient.joinWallet(opts.secret, opts.myName || 'me', {}, function(err) {
          if (err) return walletClientError.cb(err, gettextCatalog.getString('Could not join wallet'), cb);
          addAndBindWalletClient(walletClient, {
            walletServiceUrl: opts.walletServiceUrl
          }, cb);
        });
      });
    };

    root.getWallet = function(walletId) {
      return root.wallet[walletId];
    };

    root.deleteWalletClient = function(client, cb) {
      var walletId = client.credentials.walletId;

      var config = configService.getSync();

      $log.debug('Deleting Wallet:', client.credentials.walletName);
      client.removeAllListeners();

      root.profile.deleteWallet(walletId);

      delete root.wallet[walletId];

      storageService.removeAllWalletData(walletId, function(err) {
        if (err) $log.warn(err);
      });

      storageService.storeProfile(root.profile, function(err) {
        if (err) return cb(err);
        return cb();
      });
    };

    root.setMetaData = function(walletClient, addressBook, cb) {
      storageService.getAddressbook(function(err, localAddressBook) {
        var localAddressBook1 = {};
        try {
          localAddressBook1 = JSON.parse(localAddressBook);
        } catch (ex) {
          $log.warn(ex);
        }
        var mergeAddressBook = lodash.merge(addressBook, localAddressBook1);
        storageService.setAddressbook(JSON.stringify(addressBook), function(err) {
          if (err) return cb(err);
          return cb(null);
        });
      });
    }

    // Adds and bind a new client to the profile
    var addAndBindWalletClient = function(client, opts, cb) {
      if (!client || !client.credentials)
        return cb(gettextCatalog.getString('Could not access wallet'));

      var walletId = client.credentials.walletId

      if (!root.profile.addWallet(JSON.parse(client.export())))
        return cb(gettextCatalog.getString("Wallet already in {{appName}}", {
          appName: appConfigService.nameCase
        }));


      var skipKeyValidation = shouldSkipValidation(walletId);
      if (!skipKeyValidation)
        root.runValidation(client);

      root.bindWalletClient(client);

      var saveWalletServiceUrl = function(cb) {
        var defaults = configService.getDefaults();
        var walletServiceFor = {};
        walletServiceFor[walletId] = opts.walletServiceUrl || defaults.currencyNetworks[client.networkURI].walletService.url;

        // Dont save the default
        if (walletServiceFor[walletId] == defaults.currencyNetworks[client.networkURI].walletService.url)
          return cb();

        configService.set({
          walletServiceFor: walletServiceFor,
        }, function(err) {
          if (err) $log.warn(err);
          return cb();
        });
      };

      saveWalletServiceUrl(function() {
        storageService.storeProfile(root.profile, function(err) {
          return cb(err, client);
        });
      });
    };

    root.storeProfileIfDirty = function(cb) {
      if (root.profile.dirty) {
        storageService.storeProfile(root.profile, function(err) {
          $log.debug('Saved modified Profile');
          if (cb) return cb(err);
        });
      } else {
        if (cb) return cb();
      };
    };

    root.importWallet = function(str, opts, cb) {
      // opts.walletServiceUrl should be set by according to network.
      var walletClient = networkService.walletClientFor(opts.networkURI).getClient(null, opts);

      $log.debug('Importing Wallet:', opts);

      try {
        var c = JSON.parse(str);

        if (c.xPrivKey && c.xPrivKeyEncrypted) {
          $log.warn('Found both encrypted and decrypted key. Deleting the encrypted version');
          delete c.xPrivKeyEncrypted;
          delete c.mnemonicEncrypted;
        }

        str = JSON.stringify(c);

        walletClient.import(str, {
          compressed: opts.compressed,
          password: opts.password
        });
      } catch (err) {
        return cb(gettextCatalog.getString('Could not import. Check input file and spending password'));
      }

      str = JSON.parse(str);

      if (!str.n) {
        return cb("Backup format not recognized.");
      }

      var addressBook = str.addressBook || {};

      addAndBindWalletClient(walletClient, {
        walletServiceUrl: opts.walletServiceUrl
      }, function(err, walletId) {
        if (err) return cb(err);
        root.setMetaData(walletClient, addressBook, function(error) {
          if (error) $log.warn(error);
          return cb(err, walletClient);
        });
      });
    };

    root.importExtendedPrivateKey = function(xPrivKey, opts, cb) {
      // opts.walletServiceUrl should be set by according to network.
      var walletClient = networkService.walletClientFor(opts.networkURI).getClient(null, opts);

      $log.debug('Importing Wallet xPrivKey');

      walletClient.importFromExtendedPrivateKey(xPrivKey, opts, function(err) {
        if (err) {
          var errors = networkService.walletClientFor(opts.networkURI).getErrors();
          if (err instanceof errors.NOT_AUTHORIZED)
            return cb(err);

          return walletClientError.cb(err, gettextCatalog.getString('Could not import'), cb);
        }

        addAndBindWalletClient(walletClient, {
          walletServiceUrl: opts.walletServiceUrl
        }, cb);
      });
    };

    root._normalizeMnemonic = function(words) {
      if (!words || !words.indexOf) return words;
      var isJA = words.indexOf('\u3000') > -1;
      var wordList = words.split(/[\u3000\s]+/);

      return wordList.join(isJA ? '\u3000' : ' ');
    };

    root.importMnemonic = function(words, opts, cb) {
      // opts.walletServiceUrl should be set by according to network.
      var walletClient = networkService.walletClientFor(opts.networkURI).getClient(null, opts);

      $log.debug('Importing Wallet Mnemonic');

      words = root._normalizeMnemonic(words);
      walletClient.importFromMnemonic(words, {
        network: networkService.parseNet(opts.networkURI),
        passphrase: opts.passphrase,
        entropySourcePath: opts.entropySourcePath,
        derivationStrategy: opts.derivationStrategy || 'BIP44',
        account: opts.account || 0,
      }, function(err) {
        if (err) {
          var errors = networkService.walletClientFor(opts.networkURI).getErrors();
          if (err instanceof errors.NOT_AUTHORIZED)
            return cb(err);

          return walletClientError.cb(err, gettextCatalog.getString('Could not import'), cb);
        }

        addAndBindWalletClient(walletClient, {
          walletServiceUrl: opts.walletServiceUrl
        }, cb);
      });
    };

    root.importExtendedPublicKey = function(opts, cb) {
      // opts.walletServiceUrl should be set by according to network.
      var walletClient = networkService.walletClientFor(opts.networkURI).getClient(null, opts);
      $log.debug('Importing Wallet XPubKey');

      walletClient.importFromExtendedPublicKey(opts.extendedPublicKey, opts.externalSource, opts.entropySource, {
        account: opts.account || 0,
        derivationStrategy: opts.derivationStrategy || 'BIP44',
      }, function(err) {
        if (err) {
          var errors = networkService.walletClientFor(opts.networkURI).getErrors();

          // in HW wallets, req key is always the same. They can't addAccess.
          if (err instanceof errors.NOT_AUTHORIZED)
            err.name = 'WALLET_DOES_NOT_EXIST';

          return walletClientError.cb(err, gettextCatalog.getString('Could not import'), cb);
        }

        addAndBindWalletClient(walletClient, {
          walletServiceUrl: opts.walletServiceUrl
        }, cb);
      });
    };

    root.createProfile = function(cb) {
      $log.info('Creating profile');
      var defaults = configService.getDefaults();

      configService.get(function(err) {
        if (err) $log.debug(err);

        var p = Profile.create();
        storageService.storeNewProfile(p, function(err) {
          if (err) return cb(err);
          root.bindProfile(p, function(err) {
            // ignore NONAGREEDDISCLAIMER
            if (err && err.toString().match('NONAGREEDDISCLAIMER')) return cb();
            return cb(err);
          });
        });
      });
    };

    root.createDefaultWallet = function(cb) {
      var config = configService.getSync();
      var defaultNetwork = config.currencyNetworks.default;

      var opts = {};
      opts.m = 1;
      opts.n = 1;
      opts.network = networkService.getNetworkByURI(defaultNetwork);
      opts.walletServiceUrl = config.currencyNetworks[defaultNetwork].walletService.url;

      root.createWallet(opts, cb);
    };

    root.setDisclaimerAccepted = function(cb) {
      root.profile.disclaimerAccepted = true;
      storageService.storeProfile(root.profile, function(err) {
        return cb(err);
      });
    };

    root.isDisclaimerAccepted = function(cb) {
      var disclaimerAccepted = root.profile && root.profile.disclaimerAccepted;
      if (disclaimerAccepted)
        return cb(true);

      // OLD flag
      storageService.getDisclaimerFlag(function(err, val) {
        if (val) {
          root.profile.disclaimerAccepted = true;
          return cb(true);
        } else {
          return cb();
        }
      });
    };

    root.updateCredentials = function(credentials, cb) {
      root.profile.updateWallet(credentials);
      storageService.storeProfile(root.profile, cb);
    };

    root.getLastKnownBalance = function(wid, cb) {
      storageService.getBalanceCache(wid, cb);
    };

    root.addLastKnownBalance = function(wallet, cb) {
      var now = Math.floor(Date.now() / 1000);
      var showRange = 600; // 10min;

      root.getLastKnownBalance(wallet.id, function(err, data) {
        if (data) {
          data = JSON.parse(data);
          wallet.cachedBalance = data.balance;
          wallet.cachedBalanceUpdatedOn = (data.updatedOn < now - showRange) ? data.updatedOn : null;
        }
        return cb();
      });
    };

    root.setLastKnownBalance = function(wid, balance, cb) {
      storageService.setBalanceCache(wid, {
        balance: balance,
        updatedOn: Math.floor(Date.now() / 1000),
      }, cb);
    };

    root.getWallets = function(opts) {

      if (opts && !lodash.isObject(opts))
        throw "bad argument";

      opts = opts || {};

      var ret = lodash.values(root.wallet);

      if (opts.networkURI) {
        ret = lodash.filter(ret, function(w) {
          return (w.networkURI == opts.networkURI);
        });
      }

      if (opts.n) {
        ret = lodash.filter(ret, function(w) {
          return (w.credentials.n == opts.n);
        });
      }

      if (opts.m) {
        ret = lodash.filter(ret, function(w) {
          return (w.credentials.m == opts.m);
        });
      }

      if (opts.hasFunds) {
        ret = lodash.filter(ret, function(w) {
          if (!w.status) return;
          return (w.status.availableBalanceSat > 0);
        });
      }

      if (opts.minAmount) {
        ret = lodash.filter(ret, function(w) {
          if (!w.status) return;
          return (w.status.availableBalanceSat > opts.minAmount);
        });
      }

      if (opts.onlyComplete) {
        ret = lodash.filter(ret, function(w) {
          return w.isComplete();
        });
      } else {}

      // Add cached balance async
      lodash.each(ret, function(w) {
        root.addLastKnownBalance(w, function() {});
      });


      return lodash.sortBy(ret, [
        function(w) {
          return w.isComplete();
        }, 'createdOn'
      ]);
    };

    root.toggleHideBalanceFlag = function(walletId, cb) {
      root.wallet[walletId].balanceHidden = !root.wallet[walletId].balanceHidden;
      storageService.setHideBalanceFlag(walletId, root.wallet[walletId].balanceHidden.toString(), cb);
    };

    root.getNotifications = function(opts, cb) {
      opts = opts || {};

      var TIME_STAMP = 60 * 60 * 6;
      var MAX = 30;

      var typeFilter = {
        'NewOutgoingTx': 1,
        'NewIncomingTx': 1
      };

      var w = root.getWallets();
      if (lodash.isEmpty(w)) return cb();

      var l = w.length,
        j = 0,
        notifications = [];


      function isActivityCached(wallet) {
        return wallet.cachedActivity && wallet.cachedActivity.isValid;
      };


      function updateNotifications(wallet, cb2) {
        if (isActivityCached(wallet) && !opts.force) return cb2();

        wallet.getNotifications({
          timeSpan: TIME_STAMP,
          includeOwn: true,
        }, function(err, n) {
          if (err) return cb2(err);

          wallet.cachedActivity = {
            n: n.slice(-MAX),
            isValid: true,
          };

          return cb2();
        });
      };

      function process(notifications, networkURI) {
        if (!notifications) return [];

        var shown = lodash.sortBy(notifications, 'createdOn').reverse();

        shown = shown.splice(0, opts.limit || MAX);

        lodash.each(shown, function(x) {
          x.txpId = x.data ? x.data.txProposalId : null;
          x.txid = x.data ? x.data.txid : null;
          x.types = [x.type];

          if (x.data && x.data.amount)
            x.amountStr = txFormatService.formatAmountStr(networkURI, x.data.amount);

          x.action = function() {
            // TODO?
            // $state.go('tabs.wallet', {
            //   walletId: x.walletId,
            //   txpId: x.txpId,
            //   txid: x.txid,
            // });
          };
        });

        var finale = shown; // GROUPING DISABLED!

        var finale = [],
          prev;


        // Item grouping... DISABLED.

        // REMOVE (if we want 1-to-1 notification) ????
        lodash.each(shown, function(x) {
          if (prev && prev.walletId === x.walletId && prev.txpId && prev.txpId === x.txpId && prev.creatorId && prev.creatorId === x.creatorId) {
            prev.types.push(x.type);
            prev.data = lodash.assign(prev.data, x.data);
            prev.txid = prev.txid || x.txid;
            prev.amountStr = prev.amountStr || x.amountStr;
            prev.creatorName = prev.creatorName || x.creatorName;
          } else {
            finale.push(x);
            prev = x;
          }
        });

        lodash.each(finale, function(x) {
          var u = networkService.walletClientFor(x.wallet.networkURI).getUtils();
          if (x.data && x.data.message && x.wallet && x.wallet.credentials.sharedEncryptingKey) {
            // TODO TODO TODO => Wallet Client
            x.message = u.decryptMessage(x.data.message, x.wallet.credentials.sharedEncryptingKey);
          }
        });

        return finale;
      };

      lodash.each(w, function(wallet) {
        updateNotifications(wallet, function(err) {
          j++;
          if (err) {
            $log.warn('Error updating notifications:' + err);
          } else {

            var n;

            n = lodash.filter(wallet.cachedActivity.n, function(x) {
              return typeFilter[x.type];
            });

            var idToName = {};
            if (wallet.cachedStatus) {
              lodash.each(wallet.cachedStatus.wallet.copayers, function(c) {
                idToName[c.id] = c.name;
              });
            }

            lodash.each(n, function(x) {
              x.wallet = wallet;
              if (x.creatorId && wallet.cachedStatus) {
                x.creatorName = idToName[x.creatorId];
              };
            });

            notifications.push(n);
          }
          if (j == l) {
            notifications = lodash.sortBy(notifications, 'createdOn');
            notifications = lodash.compact(lodash.flatten(notifications)).slice(0, MAX);
            var total = notifications.length;
            return cb(null, process(notifications, wallet.networkURI), total);
          };
        });
      });
    };

    root.getTxps = function(opts, cb) {
      var MAX = 100;
      opts = opts || {};

      var w = root.getWallets();
      if (lodash.isEmpty(w)) return cb();

      var txps = [];

      lodash.each(w, function(x) {
        if (x.pendingTxps)
          txps = txps.concat(x.pendingTxps);
      });
      var n = txps.length;
      txps = lodash.sortBy(txps, 'pendingForUs', 'createdOn');
      txps = lodash.compact(lodash.flatten(txps)).slice(0, opts.limit || MAX);
      return cb(null, txps, n);
    };

    // Check to see if at least one wallet has funds.
    root.hasFunds = function() {
      var hasFunds = false;
      var index = 0;
      lodash.each(Object.keys(root.wallet), function(walletId) {
        walletService.getStatus(root.wallet[walletId], {}, function(err, status) {
          ++index;
          if (err && !status) {
            $log.error(err);
            // Error updating the wallet. Probably a network error, do not show starter message
            hasFunds = false;
          } else if (status.availableBalanceAtomic > 0) {
            hasFunds = true;
          }
        });
      });
      return hasFunds;
    };

    return root;
  });
