/*!
 * Copyright 2015 Geoscience Australia (http://www.ga.gov.au/copyright.html)
 */
(function(angular, sessionStorage) {

'use strict';

angular.module("explorer.persist", ['explorer.projects'])

.provider("persistService", function PersistServiceProvider() { 
	var handle = null;

	this.$get = ['persistLocalService', 'persistRemoteService', function(persistLocalService, persistRemoteService) {
		if(handle == "local") {
			return persistLocalService;
		} else {
			return persistRemoteService;
		}
	}];
		
	this.handler = function(name) {
		handle = name;
	};
})

.factory("persistRemoteService", ['$log', '$q', 'projectsService', 'serverPersistService', 'userService', function($log, $q, projectsService, serverPersistService, userService) {
	return {
		setGlobalItem : function(key, value) {
			this._setItem("_system", key, value);
		},
		
		setItem : function(key, value) {
			projectsService.getCurrentProject().then(function(project) {
				this._setItem(project, key, value);
			}.bind(this));
		},
		
		_setItem : function(project, key, value) {
			$log.debug("Fetching state for key " + key);
			userService.getUsername().then(function(userName) {
				sessionStorage.setItem("mars." + userName + "." + project + "." + key, JSON.stringify(value));
				serverPersistService.persist(project, key, value);
			});
		},

		getGlobalItem : function(key) {
			return this._getItem("_system", key);
		},
		
		getItem : function(key) {
			var deferred = $q.defer();
			projectsService.getCurrentProject().then(function(project) {
				this._getItem(project, key).then(function(response) {
					deferred.resolve(response);
				});
			}.bind(this));
			return deferred.promise;
		},
		
		_getItem : function(project, key) {
			$log.debug("Fetching state for key " + key);
			var deferred = $q.defer();
			userService.getUsername().then(function(userName) {
				var item = sessionStorage.getItem("mars." + userName + "." + project + "." + key);
				if(item) {
					try {
						item = JSON.parse(item);
					} catch(e) {
						// Do nothing as it will be a string
						//console.log("It wasn't good JSON");
					}
					deferred.resolve(item);
				} else {
					serverPersistService.retrieve(project, key).then(function(data) {
						deferred.resolve(data);
					},
					function(err) {
						//console.log("err" + err);
					});
				}
			});
			return deferred.promise;			
		}		
	};
}])

.factory("serverPersistService", ['$log', 'httpData', 'projectsService', 'userService', '$q', function($log, httpData, projectsService, userService, $q) {
	function parse(item) {
		if(!item) {
			// return falsy stuff
			return item;
		}
		try {
			if(!angular.isString(item)) {
				return item;
			}
			return JSON.parse(item);
		} catch(e) {
			$log.debug("Returning original item: " + item);
			return item;
		}		
	}	
	
	return {
		persist : function(project, key, obj) {
			if(angular.isString()) {
				try {
					JSON.parse(obj);
				} catch(e) {
					obj = '"' + obj + '"';
				}
			}
			return httpData.post("service/state/item/" + project + "/" + key, obj).then(function(response) {
                return response && response.data;
            });
		},
		
		retrieve : function(project, key) {
			return httpData.get("service/state/item/" + project + "/" + key).then(function(response) {
                return response && response.data;
            });
		}
	};
}])

.factory("persistLocalService", ['$log', '$q', 'projectsService', function($log, $q, projectsService) {
	return {
		setGlobalItem : function(key, value) {
			this._setItem("_system", key, value);
		},
		
		setItem : function(key, value) {
			projectsService.getCurrentProject().then(function(project) {
				this._setItem(project, key, value);
			}.bind(this));
		},
		
		_setItem : function(project, key, value) {
			$log.debug("Fetching state for key locally" + key);
			localStorage.setItem("mars.anon." + project + "." + key, JSON.stringify(value));
		},

		getGlobalItem : function(key) {
			return this._getItem("_system", key);
		},
		
		getItem : function(key) {
			var deferred = $q.defer();
			projectsService.getCurrentProject().then(function(project) {
				this._getItem(project, key).then(function(response) {
					deferred.resolve(response);
				});
			}.bind(this));
			return deferred.promise;
		},
		
		_getItem : function(project, key) {
			$log.debug("Fetching state locally for key " + key);
			var item = localStorage.getItem("mars.anon." + project + "." + key);
			if(item) {
				try {
					item = JSON.parse(item);
				} catch(e) {
					// Do nothing as it will be a string
				}
			}
			return $q.when(item);			
		}		
	};
}]);

})(angular, localStorage, sessionStorage);