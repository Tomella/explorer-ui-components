/*!
 * Copyright 2015 Geoscience Australia (http://www.ga.gov.au/copyright.html)
 */
(function(angular, indexedDB, localStorage, sessionStorage) {

'use strict';
var prefix = "mars.anon";

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

    this.prefix = function(name) {
        prefix = name;
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
        var db = -1, 
		  		store = "Store", 
		  		waiters = [];
		  
		  
        if (indexedDB) {
            var request = indexedDB.open("GAExplorer." + prefix);
            request.onupgradeneeded = function() {
                request.result.createObjectStore(store);
            };
            request.onsuccess = function() {
                db = request.result;
					 if(waiters.length) {
						waiters.forEach(function(waiter) { 
							waiter.resolve(db);
						});
					 }
            };
            request.onerror = function() {
                db = 0;
            };
        } else {
			  db = 0;
		  }

		  function doGetDb() {
			  var deferred;
			  if(db == -1) {
				  deferred = $q.defer();
				  waiters.push(deferred);
				  return deferred.promise;
			  }
			  return $q.when(db);
		  }

        function doGetItem(project, key) {
			  return doGetDb().then(function(db) {
				  return processGetItem(db);
			  });
			  
			  function processGetItem(db) {
            	key = project + "." + key;
            	$log.debug("Fetching state locally for key " + key);
            	if (!db) {
                	var item = localStorage.getItem(prefix + "." + key);
                	if (item) {
                   	try {
                        item = JSON.parse(item);
                    	} catch (e) {
                        // Do nothing as it will be a string
                    	}
                	}
                	return $q.when(item);
            	}

            	var req = db.transaction(store).objectStore(store).get(key), deferred = $q.defer();
            	req.onsuccess = function() {
               	deferred.resolve(req.result);
            	};
            	req.onerror = function() {
                	deferred.resolve(null);
            	};
            	return deferred.promise;
			  }
        }

        function doSetItem(project, key, value) {
            key = project + "." + key;
            $log.debug("Setting state for key locally" + key);
            if (!db)
                return localStorage.setItem(prefix + "." + key, JSON.stringify(value));

            var req = db.transaction(store, "readwrite").objectStore(store);
            if (value !== null)
                req.put(value, key);
            else
                req.delete(key);
        }

        return {
		setGlobalItem : function(key, value) {
            doSetItem("_system", key, value);
		},
		
		setItem : function(key, value) {
			projectsService.getCurrentProject().then(function(project) {
                doSetItem(project, key, value);
			});
		},
		
		getGlobalItem : function(key) {
			return doGetItem("_system", key);
		},
		
		getItem : function(key) {
			var deferred = $q.defer();
			projectsService.getCurrentProject().then(function(project) {
                doGetItem(project, key).then(function(response) {
					deferred.resolve(response);
				});
			});
			return deferred.promise;
		}
	};
}]);

})(angular, window.indexedDB || window.mozIndexedDB || window.webkitIndexedDB || window.msIndexedDB, localStorage, sessionStorage);