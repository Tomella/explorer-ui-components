/*!
 * Copyright 2015 Geoscience Australia (http://www.ga.gov.au/copyright.html)
 */

(function(angular) {
	
'use strict';

angular.module("explorer.config", ['explorer.httpdata', 'explorer.waiting'])

.provider("configService", function ConfigServiceProvider() {
	var baseUrl = "service/appConfig/config",
		dynamicConfigUrl = "service/appConfig/config?t=",
		persistedConfig,
		waiters,
        dynamicAttributes = [],
		now = Date.now() % 10000000;
	
	this.location = function(where) {
		baseUrl = where;
	};
	
	this.dynamicLocation = function(where) {
		dynamicConfigUrl = where;
	};

    this.dynamicAttributes = function(attrs) {
        dynamicAttributes = attrs;
    };

	this.$get = ['$q', 'httpData', 'waiting', function configServiceFactory($q, httpData, waiting) {
		var $config =  {
			getConfig : function(child) {
				var deferred; 
				if(child) {
					deferred = $q.defer();
					this._getConfig().then(function(config) {
						deferred.resolve(config[child]);
					});
					return deferred.promise;
				} else {
					return this._getConfig();
				}
			},
			_getConfig : function() {
				var deferred;

				if(!waiters) {
					waiters = waiting.wait();
				}
				
				if(persistedConfig) {
					return $q.when(persistedConfig);
				} else {
					deferred = waiters.waiter();					
					
					if(waiters.length < 2) {
						httpData.get(baseUrl, {cache:true}).then(function(response) {
                            var config = response && response.data;
							// Anon users don't have an id or version yet.
							if(!config.clientSessionId || !config.version) {
								httpData.get(dynamicConfigUrl + Date.now()).then(function(response) {
                                    var data = response && response.data;
                                    config.clientSessionId = data.clientSessionId;
                                    config.version = data.version;
                                    dynamicAttributes.forEach(function(attr) {
                                        config[attr] = data[attr];
                                    });
									decorateAndResolve();
								});								
							} else {
								decorateAndResolve();
							}
							
							function decorateAndResolve() {
								persistedConfig = config;
								config.localClientSessionId = config.clientSessionId + "-" + now;
								waiters.resolve(config);
								// Clean it up.
								waiters = null;
							}							
						});
					}
				}
				return deferred.promise;
			}
		};
		return $config;		
	}];
});

})(angular);