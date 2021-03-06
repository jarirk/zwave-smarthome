/**
 * @overview Controllers that handle management actions.
 * @author Martin Vach
 */

/**
 * The management root controller
 * @class ManagementController
 */
myAppController.controller('ManagementController', function ($scope, $interval, $q, $filter, cfg, dataFactory, dataService, myCache) {
    //Set elements to expand/collapse
    angular.copy({
        user: false,
        remote: false,
        licence: false,
        firmware: false,
        backup: false,
        restore: false,
        info: false,
        report: false,
        appstore: false
    }, $scope.expand);
    $scope.ZwaveApiData = false;
    $scope.controllerInfo = {
        uuid: null,
        isZeroUuid: false,
        softwareRevisionVersion: null,
        softwareLatestVersion: null,
        capabillities: null,
        scratchId: null,
        capsLimited: false

    };
    $scope.handleLicense = {
        show: false,
        disabled: false,
        replug: false
    };

    $scope.handleTimezone = {
        instance: {},
        show: false
    };

    $scope.zwaveDataInterval = null;
    // Cancel interval on page destroy
    $scope.$on('$destroy', function () {
        $interval.cancel($scope.zwaveDataInterval);
        angular.copy({}, $scope.expand);
    });

    /**
     * Load all promises
     */
    $scope.allSettled = function () {
        $scope.loading = {status: 'loading-spin', icon: 'fa-spinner fa-spin', message: $scope._t('loading')};
        var promises = [
            dataFactory.loadZwaveApiData()

        ];
        if($scope.isInArray(['jb'],cfg.app_type)){
            promises.push(dataFactory.getApi('instances', '/ZMEOpenWRT'));
        }
        $q.allSettled(promises).then(function (response) {
            var zwave = response[0];
            var timezone = response[1];
            $scope.loading = false;
            // Success - api data
            if (zwave.state === 'fulfilled') {
                $scope.ZwaveApiData = zwave.value;
                setControllerInfo(zwave.value);
            }
            if(timezone){
                // Success - timezone
                if (timezone.state === 'fulfilled' && timezone.value.data.data[0].active === true) {
                    $scope.handleTimezone.show = true;
                    $scope.handleTimezone.instance = timezone.value.data.data[0];
                }
            }

        });
    };
    $scope.allSettled();

    /// --- Private functions --- ///
    /**
     * Set controller info
     */
    function setControllerInfo(ZWaveAPIData) {
        var caps = function (arr) {
            var cap = '';
            if (angular.isArray(arr)) {
                cap += (arr[3] & 0x01 ? 'S' : 's');
                cap += (arr[3] & 0x02 ? 'L' : 'l');
                cap += (arr[3] & 0x04 ? 'M' : 'm');
            }
            return cap;

        };
        var nodeLimit = function (str) {
            return parseInt(str, 16) > 0x00 ? false : true;
        };
        $scope.controllerInfo.uuid = ZWaveAPIData.controller.data.uuid.value;
        $scope.controllerInfo.isZeroUuid = parseInt(ZWaveAPIData.controller.data.uuid.value, 16) === 0;
        $scope.controllerInfo.softwareRevisionVersion = ZWaveAPIData.controller.data.softwareRevisionVersion.value;
        $scope.controllerInfo.capabillities = caps(ZWaveAPIData.controller.data.caps.value);
        $scope.controllerInfo.capsLimited = nodeLimit($filter('dec2hex')(ZWaveAPIData.controller.data.caps.value[2]).slice(-2));
        setLicenceScratchId($scope.controllerInfo);
        //console.log(ZWaveAPIData.controller.data.caps.value);
        //console.log('Limited: ', $scope.controllerInfo.capsLimited);

    }
    ;
    /**
     * Set licence ID
     * @param {object} controllerInfo
     * @returns {undefined}
     */
    function  setLicenceScratchId(controllerInfo) {
        dataFactory.getRemoteData($scope.cfg.get_licence_scratchid + '?uuid=' + controllerInfo.uuid).then(function (response) {
            $scope.controllerInfo.scratchId = response.data.scratch_id;
            handleLicense($scope.controllerInfo)
        }, function (error) {
            handleLicense($scope.controllerInfo);
            alertify.alertError($scope._t('error_license_request'));
        });
    }
    ;
    /**
     * Show or hide licencese block
     * @param {object} controllerInfo
     * @returns {undefined}
     */
    function handleLicense(controllerInfo) {
        // Hide license if 
        // forbidden, mobile device, not uuid
        if ((cfg.license_forbidden.indexOf(cfg.app_type) > -1) || $scope.isMobile || !controllerInfo.uuid) {
            //console.log('Hide license if: forbidden, mobile device, not uuid')
            $scope.handleLicense.show = false;
            return;
        }

        // Hide license if
        // Controller UUID = string and scratchId  is NOT found  and cap unlimited
        if (!controllerInfo.scratchId && !controllerInfo.capsLimited) {
            //console.log('Hide license if: Controller UUID = string and scratchId  is NOT found  and cap unlimited')
            $scope.handleLicense.show = false;
            return;
        }

        // Show modal if
        // Controller UUID = string and scratchId  is NOT found  and cap limited
        if (!controllerInfo.scratchId && controllerInfo.capsLimited) {
            //console.log('Show modal if: Controller UUID = string and scratchId  is NOT found  and cap limited')
            alertify.alertWarning($scope._t('info_missing_licence'));
        }

        // Disable input and show unplug message
        if (controllerInfo.isZeroUuid) {
            //console.log('Disable input and show unplug message')
            $scope.handleLicense.disabled = true;
            $scope.handleLicense.replug = true;
        }
        $scope.handleLicense.show = true;
    }

});
/**
 * The controller that renders the list of users.
 * @class ManagementUserController
 */
myAppController.controller('ManagementUserController', function ($scope, $cookies, dataFactory, dataService, myCache) {
    $scope.userProfiles = {
        all: false,
        orderBy: ($cookies.usersOrderBy ? $cookies.usersOrderBy : 'titleASC')
    };
    /**
     * Load profiles
     */
    $scope.loadProfiles = function () {
        $scope.loading = {status: 'loading-spin', icon: 'fa-spinner fa-spin', message: $scope._t('loading')};
        dataFactory.getApi('profiles', null, true).then(function (response) {
            $scope.userProfiles.all = response.data.data;
            $scope.loading = false;
        }, function (error) {
            $scope.loading = false;
            alertify.alertError($scope._t('error_load_data'));
        });
    };
    $scope.loadProfiles();

    /**
     * Set order by
     */
    $scope.setOrderBy = function (key) {
        angular.extend($scope.userProfiles, {orderBy: key});
        $cookies.usersOrderBy = key;
        $scope.loadProfiles();
    };

    /**
     * Delete an user
     */
    $scope.deleteProfile = function (input, message, except) {
        if (input.id == except) {
            return;
        }
        alertify.confirm(message, function () {
            $scope.loading = {status: 'loading-spin', icon: 'fa-spinner fa-spin', message: $scope._t('deleting')};
            dataFactory.deleteApi('profiles', input.id).then(function (response) {
                myCache.remove('profiles');
                dataService.showNotifier({message: $scope._t('delete_successful')});
                $scope.loading = false;
                $scope.loadProfiles();
            }, function (error) {
                $scope.loading = false;
                alertify.alertError($scope._t('error_delete_data'));
            });
        });
    };


});
/**
 * The controller that handles user detail actions.
 * @class ManagementUserIdController
 */
myAppController.controller('ManagementUserIdController', function ($scope, $routeParams, $filter, $q, dataFactory, dataService, myCache) {
    $scope.id = $filter('toInt')($routeParams.id);
    $scope.rooms = {};
    $scope.show = true;
    $scope.input = {
        "id": 0,
        "role": 2,
        "login": "",
        "name": "",
        "lang": "en",
        "color": "#dddddd",
        "dashboard": [],
        "interval": 1000,
        "rooms": [],
        "expert_view": true,
        "hide_all_device_events": false,
        "hide_system_events": false,
        "hide_single_device_events": []
    };
    $scope.auth = {
        id: $routeParams.id,
        login: null,
        password: null

    };

    /**
     * Load all promises
     */
    $scope.allSettledUserId = function () {
        $scope.loading = {status: 'loading-spin', icon: 'fa-spinner fa-spin', message: $scope._t('loading')};
        var promises = [
            dataFactory.getApi('profiles', ($scope.id !== 0 ? '/' + $scope.id : ''), true),
            dataFactory.getApi('locations')
        ];

        $q.allSettled(promises).then(function (response) {
            var profile = response[0];
            var locations = response[1];
            $scope.loading = false;
            // Error message
            if (profile.state === 'rejected') {
                $scope.loading = false;
                alertify.alertError($scope._t('error_load_data'));
                $scope.show = false;
                return;
            }
            // Success - profile
            if (profile.state === 'fulfilled') {
                if ($scope.id !== 0) {
                    $scope.input = profile.value.data.data;
                    $scope.auth.login = profile.value.data.data.login;
                }
            }

            // Success - locations
            if (locations.state === 'fulfilled') {
                $scope.rooms = dataService.getRooms(locations.value.data.data)
                        .reject(function (v) {
                            return (v.id === 0);

                        })
                        .value();
            }
        });
    };
    $scope.allSettledUserId();

    /**
     * Watch for the role change
     */
    /*$scope.$watch('input.role', function () {
        //var globalRoomIndex = $scope.input.rooms.indexOf(0);
        if($scope.input.role === 1){
            $scope.input.rooms = [0];
        }else{
            $scope.input.rooms = $scope.input.rooms.length > 0  ? $scope.input.rooms : [];
            //$scope.input.rooms = []
        }
    });*/
    /**
     * Assign room to list
     */
    $scope.assignRoom = function (assign) {
        if($scope.input.role !== 1) {
            $scope.input.rooms.push(assign);
        }
    };

    /*$scope.prepareRooms = function () {
        return;
        var globalRoomIndex = $scope.input.rooms.indexOf(0);
        //var roomIds = _.map(locations.value.data.data, function(location){});

        if ($scope.input.role === 1 && globalRoomIndex === -1) {
            $scope.input.rooms = [0];
        } else if ($scope.input.role !== 1 && globalRoomIndex > -1){
            if ($scope.input.id === 0) {
                $scope.input.rooms = [];
            } else {
                $scope.input.rooms.splice(globalRoomIndex, 1);
            }
        }
        return;
    };*/

    /**
     * Remove room from the list
     */
    $scope.removeRoom = function (roomId) {
        var oldList = $scope.input.rooms;
        $scope.input.rooms = [];
        angular.forEach(oldList, function (v, k) {
            if (v != roomId) {
                $scope.input.rooms.push(v);
            }
        });
        return;
    };

    /**
     * Create/Update an item
     */
    $scope.store = function (form, input) {
        if (form.$invalid) {
            return;
        }
        var globalRoomIndex = input.rooms.indexOf(0);
        $scope.loading = {status: 'loading-spin', icon: 'fa-spinner fa-spin', message: $scope._t('updating')};
        if ($scope.id == 0) {
            input.password = input.password;
        }
        if (input.role === 1) {
            input.rooms = [0];
        }else if(globalRoomIndex > -1){
            input.rooms.splice(globalRoomIndex, 1);
        }
        //console.log(input);
        //return;
        dataFactory.storeApi('profiles', input.id, input).then(function (response) {
            var id = $filter('hasNode')(response, 'data.data.id');
            if (id) {
                myCache.remove('profiles');
                $scope.reloadData();
            }
            $scope.loading = false;
            dataService.showNotifier({message: $scope._t('success_updated')});
            window.location = '#/admin';

            //$window.location.reload();

        }, function (error) {
            var message = $scope._t('error_update_data');
            if (error.status == 409) {
                message = ($filter('hasNode')(error, 'data.error') ? $scope._t(error.data.error) : message);
            }
            alertify.alertError(message);
            $scope.loading = false;
        });

    };

    /**
     * Change auth data
     */
    $scope.changeAuth = function (form, auth) {
        if (form.$invalid) {
            return;
        }
        $scope.loading = {status: 'loading-spin', icon: 'fa-spinner fa-spin', message: $scope._t('updating')};
        dataFactory.putApi('profiles_auth_update', $scope.id, $scope.auth).then(function (response) {
            $scope.loading = false;
            var data = response.data.data;
            if (!data) {
                alertify.alertError($scope._t('error_update_data'));
                return;
            }
            dataService.showNotifier({message: $scope._t('success_updated')});

        }, function (error) {
            var message = $scope._t('error_update_data');
            if (error.status == 409) {
                message = ($filter('hasNode')(error, 'data.error') ? $scope._t(error.data.error) : message);
            }
            alertify.alertError(message);
            $scope.loading = false;
        });

    };

    /// --- Private functions --- ///


});
/**
 * The controller that renders and handles remote access data.
 * @class ManagementRemoteController
 */
myAppController.controller('ManagementRemoteController', function ($scope, dataFactory, dataService) {
    $scope.remoteAccess = false;
    /**
     * Load Remote access data
     */
    $scope.loadRemoteAccess = function () {
        if (!$scope.elementAccess($scope.cfg.role_access.remote_access)) {
            return;
        }
        $scope.loading = {status: 'loading-spin', icon: 'fa-spinner fa-spin', message: $scope._t('loading')};
        dataFactory.getApi('instances', '/RemoteAccess').then(function (response) {

            $scope.loading = false;
            var remoteAccess = response.data.data[0];
            if (Object.keys(remoteAccess).length < 1) {
                alertify.alertError($scope._t('error_load_data'));
            }
            if (!remoteAccess.active) {
                alertify.alertWarning($scope._t('remote_access_not_active'));
                return;
            }
            if (!remoteAccess.params.userId) {
                alertify.alertError($scope._t('error_remote_access_init'));
                return;
            }
            remoteAccess.params.pass = null;
            $scope.remoteAccess = remoteAccess;
        }, function (error) {
            $scope.loading = false;
            alertify.alertError($scope._t('remote_access_not_installed'));
        });
    };

    $scope.loadRemoteAccess();

    /**
     * PUT Remote access
     */
    $scope.putRemoteAccess = function (input) {
        $scope.loading = {status: 'loading-spin', icon: 'fa-spinner fa-spin', message: $scope._t('updating')};
        dataFactory.putApi('instances', input.id, input).then(function (response) {
            $scope.loading = false;
            dataService.showNotifier({message: $scope._t('success_updated')});
        }, function (error) {
            alertify.alertError($scope._t('error_update_data'));
            $scope.loading = false;
        });

    };
});
/**
 * The controller that renders and handles local access.
 * @class ManagementLocalController
 */
myAppController.controller('ManagementLocalController', function ($scope, dataFactory, dataService) {
    

     /**
     * Update instance
     */
    $scope.updateInstance = function (input) {
        //var input = $scope.handleTimezone.instance;
        if (input.id) {
            dataFactory.putApi('instances', input.id, input).then(function (response) {
                alertify.confirm($scope._t('timezone_alert'))
                        .setting('labels', {'ok': $scope._t('yes'),'cancel': $scope._t('lb_cancel')})
                        .set('onok', function (closeEvent) {//after clicking OK
                                $scope.systemReboot();
                        });

            }, function (error) {
                alertify.alertError($scope._t('error_update_data'));
            });
        }
    };
    
     /**
     * System rebboot
     */
    $scope.systemReboot = function () {
         $scope.loading = {status: 'loading-spin', icon: 'fa-spinner fa-spin', message: $scope._t('system_rebooting')};
            dataFactory.getApi('system_reboot').then(function (response) {
            }, function (error) {
                alertify.alertError($scope._t('error_system_reboot'));
            });

    };
});
/**
 * The controller that handles the licence key.
 * @class ManagementLicenceController
 */
myAppController.controller('ManagementLicenceController', function ($scope, dataFactory) {

    $scope.proccessLicence = false;
    $scope.proccessVerify = {
        'message': false,
        'status': 'is-hidden'
    };
    $scope.proccessUpdate = {
        'message': false,
        'status': 'is-hidden'
    };
    $scope.inputLicence = {
        "show": false,
        "scratch_id": $scope.controllerInfo.scratchId
    };

    /**
     * Get license key
     */
    $scope.getLicense = function (inputLicence) {
        // Clear messages
        $scope.proccessVerify.message = false;
        $scope.proccessUpdate.message = false;
        if (!inputLicence.scratch_id) {
            return;
        }
        $scope.loading = {status: 'loading-spin', icon: 'fa-spinner fa-spin', message: $scope._t('verifying_licence_key')};
        $scope.proccessVerify = {'message': $scope._t('verifying_licence_key'), 'status': 'fa fa-spinner fa-spin'};
        $scope.proccessLicence = true;
        var input = {
            'uuid': $scope.controllerInfo.uuid,
            'scratch': inputLicence.scratch_id
        };
        dataFactory.getLicense(input).then(function (response) {
            $scope.proccessVerify = {'message': $scope._t('success_licence_key'), 'status': 'fa fa-check text-success'};
            $scope.loading = false;
            // Update capabilities
            updateCapabilities(response);
        }, function (error) {
            var message = $scope._t('error_no_licence_key');
            if (error.status == 404) {
                var message = $scope._t('error_404_licence_key');
            }
            $scope.loading = false;
            alertify.alertError(message);
            $scope.proccessVerify = {'message': message, 'status': 'fa fa-exclamation-triangle text-danger'};
            $scope.proccessLicence = false;

        });
    };

    /**
     * Update capabilities
     */
    function updateCapabilities(data) {
        $scope.loading = {status: 'loading-spin', icon: 'fa-spinner fa-spin', message: $scope._t('upgrading_capabilities')};
        $scope.proccessUpdate = {'message': $scope._t('upgrading_capabilities'), 'status': 'fa fa-spinner fa-spin'};
        dataFactory.zmeCapabilities(data).then(function (response) {
            $scope.loading = false;
            $scope.proccessUpdate = {'message': $scope._t('success_capabilities'), 'status': 'fa fa-check text-success'};
            $scope.proccessLicence = false;
        }, function (error) {
            $scope.loading = false;
            alertify.alertError($scope._t('error_no_capabilities'));
            $scope.proccessUpdate = {'message': $scope._t('error_no_capabilities'), 'status': 'fa fa-exclamation-triangle text-danger'};
            $scope.proccessLicence = false;
        });
    }
    ;
});
/**
 * The controller that handles firmware update process.
 * @class ManagementFirmwareController
 */
myAppController.controller('ManagementFirmwareController', function ($scope, $sce, $timeout, dataFactory) {
    $scope.firmwareUpdateUrl = $sce.trustAsResourceUrl('http://' + $scope.hostName + ':8084/cgi-bin/main.cgi');
    $scope.firmwareUpdate = {
        show: false,
        loaded: false,
        url: $sce.trustAsResourceUrl('http://' + $scope.hostName + ':8084/cgi-bin/main.cgi')
    };
    /**
     * Set access
     */
    $scope.setAccess = function (param, loader) {
        if (loader) {
            $scope.loading = {status: 'loading-spin', icon: 'fa-spinner fa-spin', message: $scope._t('loading')};
        }
        dataFactory.getApi('firmwareupdate', param, true).then(function (response) {
            if (loader) {
                $scope.firmwareUpdate.show = true;
                $timeout(function () {
                    $scope.loading = false;
                    $scope.firmwareUpdate.loaded = true;
                }, 5000);
            }

        }, function (error) {
            $scope.loading = false;
            alertify.alertError($scope._t('error_load_data'));

        });
    };
    /**
     * Load latest version
     */
    $scope.loadRazLatest = function () {
        dataFactory.getRemoteData($scope.cfg.raz_latest_version_url).then(function (response) {
            $scope.controllerInfo.softwareLatestVersion = response;
        }, function (error) {
        });
    };
    //$scope.loadRazLatest();
});
/**
 * The controller that handles a backup to the cloud.
 * @class ManagementTimezoneController
 */
myAppController.controller('ManagementTimezoneController', function ($scope, $timeout, dataFactory, dataService) {
    $scope.managementTimezone = {
        labels: {},
        enums: {}
    };

    /**
     * Load module detail
     */
    $scope.loadModule = function (id) {
        $scope.loading = {status: 'loading-spin', icon: 'fa-spinner fa-spin', message: $scope._t('loading')};
        dataFactory.getApi('modules', '/ZMEOpenWRT').then(function (response) {
            $scope.loading = false;
            $scope.managementTimezone.enums = response.data.data.schema.properties.timezone.enum;
            $scope.managementTimezone.labels = response.data.data.options.fields.timezone.optionLabels;

            //console.log($scope.handleTimezone)
            //console.log($scope.managementTimezone)
        }, function (error) {
            $scope.loading = false;
            alertify.alertError($scope._t('error_load_data'));
        });
    };
    $scope.loadModule();

    /**
     * Update instance
     */
    $scope.updateInstance = function (input) {
        //var input = $scope.handleTimezone.instance;
        if (input.id) {
            dataFactory.putApi('instances', input.id, input).then(function (response) {
                alertify.confirm($scope._t('timezone_alert'))
                        .setting('labels', {'ok': $scope._t('yes'),'cancel': $scope._t('lb_cancel')})
                        .set('onok', function (closeEvent) {//after clicking OK
                                $scope.systemReboot();
                        });

            }, function (error) {
                alertify.alertError($scope._t('error_update_data'));
            });
        }
    };
    
     /**
     * System rebboot
     */
    $scope.systemReboot = function () {
         $scope.loading = {status: 'loading-spin', icon: 'fa-spinner fa-spin', message: $scope._t('system_rebooting')};
            dataFactory.getApi('system_reboot').then(function (response) {
            }, function (error) {
                alertify.alertError($scope._t('error_system_reboot'));
            });

    };

});
/**
 * The controller that handles restore process.
 * @class ManagementRestoreController
 */
myAppController.controller('ManagementRestoreController', function ($scope, $window, $timeout, dataFactory, dataService) {
    $scope.myFile = null;
    $scope.managementRestore = {
        confirm: false,
        alert: {message: false, status: 'is-hidden', icon: false},
        process: false
    };

    /**
     * Upload backup file
     */
    $scope.uploadFile = function () {
        $scope.loading = {status: 'loading-spin', icon: 'fa-spinner fa-spin', message: $scope._t('restore_wait')};
        $scope.managementRestore.alert = {message: $scope._t('restore_wait'), status: 'alert-warning', icon: 'fa-spinner fa-spin'};
        var cmd = $scope.cfg.api['restore'];
        var fd = new FormData();

        fd.append('backupFile', $scope.myFile);
        //fd.append('backupFile', files[0]); 
        dataFactory.uploadApiFile(cmd, fd).then(function (response) {
            $scope.loading = false;
            dataService.showNotifier({message: $scope._t('restore_done_reload_ui')});
            $scope.managementRestore.alert = {message: $scope._t('restore_done_reload_ui'), status: 'alert-success', icon: 'fa-check'};
            $timeout(function () {
                alertify.dismissAll();
                $window.location.reload();
            }, 2000);
        }, function (error) {
            $scope.loading = false;
            alertify.alertError($scope._t('restore_backup_failed'));
            $scope.managementRestore.alert = false;
        });

    };
});
/**
 * The controller that resets the system to factory default.
 * @class ManagementFactoryController
 */
myAppController.controller('ManagementFactoryController', function ($scope, $window, $cookies, $cookieStore, dataFactory, dataService) {
    $scope.factoryDefault = {
        model: {
            overwriteBackupCfg: true,
            resetZway: true,
            useDefaultConfig: 'ttyAMA0'
        }


    };
    /**
     * Reset to factory default
     */
    $scope.resetFactoryDefault = function (message) {
//        var params = '?useDefaultConfig=' + $scope.factoryDefault.model.overwriteBackupCfg
//                + '&resetZway=' + $scope.factoryDefault.model.resetZway
//                + '&useDefaultConfig=' + $scope.factoryDefault.model.useDefaultConfig;
        var params = false;
        alertify.confirm(message, function () {
            $scope.loading = {status: 'loading-spin', icon: 'fa-spinner fa-spin', message: $scope._t('returning_factory_default')};
            dataFactory.getApi('factory_default', params).then(function (response) {
                $scope.loading = false;
                dataService.showNotifier({message: $scope._t('factory_default_success')});
                angular.forEach($cookies, function (v, k) {
                    $cookieStore.remove(k);
                    //delete $cookies[k];
                });
                //dataService.setRememberMe(null);
                dataService.logOut();
                //$window.location.reload();
            }, function (error) {
                alertify.alertError($scope._t('factory_default_error'));
                $scope.loading = false;
            });
        });
    };

});
/**
 * The controller that renders and handles app store data.
 * @class ManagementAppStoreController
 */
myAppController.controller('ManagementAppStoreController', function ($scope, dataFactory, dataService) {
    $scope.appStore = {
        input: {
            token: ''
        },
        tokens: {}

    };

    /**
     * Load tokens
     */
    $scope.appStoreLoadTokens = function () {
        dataFactory.getApi('tokens', null, true).then(function (response) {
            angular.extend($scope.appStore.tokens, response.data.data.tokens);
        }, function (error) {
        });
    };
    $scope.appStoreLoadTokens();

    /**
     * Create/Update a token
     */
    $scope.appStoreAddToken = function () {
        if ($scope.appStore.input.token === '') {
            return;
        }
        dataFactory.putApiFormdata('tokens', $scope.appStore.input).then(function (response) {
            $scope.appStore.input.token = '';
            $scope.appStoreLoadTokens();
        }, function (error) {
            var message = $scope._t('error_update_data');
            if (error.status === 409) {
                message = $scope._t('notunique_token') + ' - ' + $scope.appStore.input.token;
            }
            alertify.alertError(message);
        });

    };

    /**
     * Remove token from the list
     */
    $scope.appStoreRemoveToken = function (token, message) {
        alertify.confirm(message, function () {
            dataFactory.deleteApiFormdata('tokens', {token: token}).then(function (response) {
                angular.extend($scope.appStore, response.data.data);
                ;
            }, function (error) {
                alertify.alertError($scope._t('error_delete_data'));
            });
        });
        return;
    };

    /// --- Private functions --- ///


});
/**
 * The controller that handles bug report info.
 * @class ManagementReportController
 */
myAppController.controller('ManagementReportController', function ($scope, $window, $route, dataFactory, dataService) {
    $scope.remoteAccess = false;
    $scope.input = {
        browser_agent: '',
        browser_version: '',
        browser_info: '',
        shui_version: '',
        zwave_vesion: '',
        controller_info: '',
        remote_id: '',
        remote_activated: 0,
        remote_support_activated: 0,
        zwave_binding: 0,
        email: null,
        content: null
    };
    /**
     * Load Remote access data
     */
    $scope.loadRemoteAccess = function () {
        if (!$scope.elementAccess($scope.cfg.role_access.remote_access)) {
            return;
        }
        dataFactory.getApi('instances', '/RemoteAccess').then(function (response) {
            $scope.remoteAccess = response.data.data[0];
        }, function (error) {});
    };

    $scope.loadRemoteAccess();

    /**
     * Send and save report
     */
    $scope.sendReport = function (form, input) {
        if (form.$invalid) {
            return;
        }
        $scope.loading = {status: 'loading-spin', icon: 'fa-spinner fa-spin', message: $scope._t('sending')};
        if ($scope.ZwaveApiData) {
            input.zwave_binding = 1;
            input.zwave_vesion = $scope.ZwaveApiData.controller.data.softwareRevisionVersion.value;
            input.controller_info = JSON.stringify($scope.ZwaveApiData.controller.data);
        }
        if (Object.keys($scope.remoteAccess).length > 0) {
            input.remote_activated = $scope.remoteAccess.params.actStatus ? 1 : 0;
            input.remote_support_activated = $scope.remoteAccess.params.sshStatus ? 1 : 0;
            input.remote_id = $scope.remoteAccess.params.userId;

        }
        input.browser_agent = $window.navigator.appCodeName;
        input.browser_version = $window.navigator.appVersion;
        input.browser_info = 'PLATFORM: ' + $window.navigator.platform + '\nUSER-AGENT: ' + $window.navigator.userAgent;
        input.shui_version = $scope.cfg.app_version;
        dataFactory.postReport(input).then(function (response) {
            $scope.loading = false;
            dataService.showNotifier({message: $scope._t('success_send_report') + ' ' + input.email});
            $route.reload();
        }, function (error) {
            alertify.alertError($scope._t('error_send_report'));
            $scope.loading = false;
        });

    };

});
/**
 * The controller that renders postfix data.
 * @class ManagementPostfixController
 */
myAppController.controller('ManagementPostfixController', function ($scope, dataFactory, _) {
    $scope.postfix = {
        all: {}
    };
    /**
     * Load postfix data
     */
    $scope.loadPostfix = function () {
        $scope.loading = {status: 'loading-spin', icon: 'fa-spinner fa-spin', message: $scope._t('loading')};
        dataFactory.getApi('postfix', null, true).then(function (response) {
            if (_.isEmpty(response.data)) {
                alertify.alertWarning($scope._t('no_data'));
            }
            $scope.loading = false;
            $scope.postfix.all = response.data;
        }, function (error) {
            $scope.loading = false;
            alertify.alertError($scope._t('error_load_data'));

        });
    };
    $scope.loadPostfix();

});
/**
 * The controller that renders info data.
 * @class ManagementInfoController
 */
myAppController.controller('ManagementInfoController', function ($scope, dataFactory, dataService) {

});
