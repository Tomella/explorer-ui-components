/*!
 * Copyright 2015 Geoscience Australia (http://www.ga.gov.au/copyright.html)
 */

(function(angular) {

'use strict';

angular.module('explorer.assets', ['explorer.projects'])

.factory('assetsService', ['$log', '$q', 'httpData', 'projectsService', '$timeout', function($log, $q, httpData, projectsService, $timeout) {
	var assets,
	promises = [],
	baseUrl = "service/asset/assets/",
	sessionTime = Date.now();
	
	function afterProject(project) {	
        httpData.get(baseUrl + project + "?t=" + sessionTime, {cache:true}).then(function(response) {
			assets = response && response.data;
			promises.forEach(function(promise) {
				promise.resolve(assets);
			});
		});
	}
	
	projectsService.getCurrentProject().then(afterProject);

	return {
		getAsset : function(key) {
			return assets[key];
		},
	
		getAssets : function() {
			var deferred;
			if(assets) {
				return $q.when(assets);
			}
			
			deferred = $q.defer();
			promises.push(deferred);
			return deferred.promise;
		},
	
		getReferenceFeatureClasses : function() {
			var deferred = $q.defer();
			this.getAssets().then(function(assets) {
				var response = [];
				angular.forEach(assets, function(asset, key) {
					if(asset.assetType == "REFERENCE_FEATURE_CLASS") {
						this.push(asset);
					}
				}, response); 
			
				deferred.resolve(response);
			});
			return deferred.promise;
		},
	
		// A resource can be either a cartographic component or an asset.
		getResourceKey : function(resource) {
			return resource.assetId;
		},
	
		getResource : function(key) {
			return this.getAsset(key);
		}
	};
}]);

})(angular);
/*!
 * Copyright 2015 Geoscience Australia (http://www.ga.gov.au/copyright.html)
 */
(function(angular) {
	

'use strict';

angular.module("explorer.asynch", [])

/**
 * @ngdoc service
 * @name asynch
 *
 * @description
 * A service that allows the calling of a partner service end point hosted on a server.
 * There are some expectations of the service.
 * 
 * The service expects the following two end points.
 * 1) The endPoint is the URL to send the job to
 * 2) The statusEndPoint checks on the status of outstanding jobs (and any other messages that might arrive).
 *	
 * 
 */

.provider('asynch', function AsynchProvider() {
	// Identify the stuff here (not really necessary in CIAP but it means anyone can use it)
	var endpoint = "process/initiateJob",
		statusEndpoint = "process/checkStatus",
		// Just in case we have someone else sending data we poll every 10 seconds.
		slowPoll = 9000,
		// When we know we are waiting on something poll faster. 
		fastPoll = 3000,
		pollRate = "slow",
		// Each job has a key and a promise attached to it. Resolve the promise on complete and delete entry.
		jobs = {},
		jobCount = 0,
		expectCount = 0,
		timeout = null,
		brokerHandler = null,
		namedParameters = {};	
	
	// Change the url here
	this.url = function(where) {
		endpoint = where;
	};

	this.statusUrl = function(where) {
		statusEndpoint = where;
	};
	
	this.broker = function(handler) {
		brokerHandler = handler;
	};
	
	this.idlePoll = function(millis) {
		slowPoll = millis;
	};

	this.waitingPoll = function(millis) {
		fastPoll = millis;
	};
	
	this.$get = ['$log', '$q', '$timeout', 'httpData', function($log, $q, $timeout, httpData) {
		// Get the polling running
		timeout = $timeout(checkStatus, pollRate == "slow"?slowPoll:fastPoll);
		function checkStatus(){
			httpData.post(statusEndpoint, encodeParameters(namedParameters), {
				headers : {
					"Content-Type" : 'application/x-www-form-urlencoded'
				}
            }).then(function(response) {
				var messages = (response && response.data && response.data.messages) || [];
				
				expectCount--;
				
				messages.forEach(function(message) {
					var job = jobs[message.processkey];
					if(job && job.promise) {
						jobCount -= 1;
						job.promise.resolve(message);
						delete jobs[message.processkey];
					} else {
						$log.debug("Delegate to broker. Message received for non-existant processKey = " + message.processkey);
						// We can have a fall over handler for unknown messages.
						if(brokerHandler) {
							brokerHandler.route(message);
						}
					}
				});

				if(jobCount < 1 && expectCount < 1) {
					pollRate = "slow";
					expectCount = jobCount = 0;
				} 
				$timeout.cancel(timeout);
				timeout = $timeout(checkStatus, pollRate == "slow"?slowPoll:fastPoll);
			}, function(err) {
				expectCount--;
				$timeout.cancel(timeout);
				timeout = $timeout(checkStatus, slowPoll);
				$log.debug("We have an error in the asynch provider:" + JSON.stringify(err));
			});	
			
			if(jobCount < 1 && expectCount < 1) {
				pollRate = "slow";
			} else {
				// Expire off old jobs.
				var now = Date.now();
				angular.forEach(jobs, function(job, processKey) {
					if(job.expires < now) {
						jobCount -= 1;
						delete jobs[processKey];
						job.promise.reject({
							error:"expired job"
						});
					}
				});
			}
		}		
		
		function $asynch(job, data, options) {
			var deferred = $q.defer(),
				headers = {job:job},
				postData = angular.extend({}, namedParameters, data),
				urlEncoded = options?options.urlEncoded:false,
				noWait = options?options.noWait:false,
				now = Date.now(),
				timeToLive = options.timeToLive?options.timeToLive:600, // 10 minutes.
				killTime = now + timeToLive * 1000;
			
			if(urlEncoded) {
				headers["Content-Type"] = 'application/x-www-form-urlencoded';
				postData = encodeParameters(postData);
			}
				
			httpData.post(endpoint, postData, {
				headers : headers
			}).then(function(response) {
					var headers = response.headers;
					
					if(noWait) {
						deferred.resolve(response.data);
					} else {
						jobs[headers.processkey] = {
								promise: deferred,
								expires:killTime
						};
						if(pollRate == "slow") {
							$timeout.cancel(timeout);
							pollRate = "fast";
							timeout = $timeout(checkStatus, fastPoll);
						}
						++jobCount;
						
					}
				}, function(err) {
					$log.debug(JSON.stringify(err));
				}
			);	
			return deferred.promise;
		}
		
		$asynch.setBroker = function(handler) {
			brokerHandler = handler;
		};
		
		$asynch.addParameter = function(name, value) {
			namedParameters[name] = value;
		};
		
		$asynch.expect = function() {
			expectCount = 5;
			pollRate = "fast";
		};
				
		return $asynch;
	}];	
	
	function encodeParameters(params) {
		var buffer = [];
		angular.forEach(params, function(value, key) {
			buffer.push(key + "=" + encodeURIComponent(value));
		});
		return buffer.join("&");
	}
});
	
})(angular);
/*!
 * Copyright 2015 Geoscience Australia (http://www.ga.gov.au/copyright.html)
 */

(function(angular) {
	
'use strict';

angular.module("explorer.broker", [])

.factory("brokerService", ['$log', function($log) {
	var listeners = {};
	
	return {
		register : function(name, handler) {
			if(!(name in listeners)) {
				listeners[name] = {};
			}
			listeners[name][handler] = handler;
		},
		
		deregister : function(name, handler) {
			if(name in listeners && handler in listeners[name]) {
				delete listeners[name][handler];
			}
		},
		
		route : function(message) {
			if(message.jobName && listeners[message.jobName]) {
				angular.forEach(listeners[message.jobName], function(handler) {
					handler.process(message);
				});
			} else {
				$log.debug("No handler found for " + message.jobName);
			}
		}
	};
}]);

})(angular);
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
/*!
 * Copyright 2015 Geoscience Australia (http://www.ga.gov.au/copyright.html)
 */

(function(angular) {
'use strict';

angular.module("explorer.confirm", ['ui.bootstrap', 'explorer.focusme'])

.directive("expConfirm", ['confirmService', function(confirmService) {
	return {
		scope : {
			success : "&",
			cancel : "&",
			expConfirm : "="
		},
		link : function(scope, element) {			
			element.on("click", function(event) {
				confirmService.confirm(scope);
			});
		}
	};	
}])

.factory("confirmService", ['$log', '$modal', function($log, $modal) {
	return {
		confirm : function(details) {
			var modalInstance;

			details.confirmed = false;
			modalInstance = $modal.open({
				templateUrl: 'components/confirm/confirm.html',
				size: "sm",
				backdrop : "static",
				keyboard : false,
				controller : ['$scope', '$modalInstance', 'message', function ($scope, $modalInstance, message) {
					$scope.message = message;

					$scope.accept = function () {
					   $modalInstance.close(true);
					};
					  
					$scope.reject = function () {
					   $modalInstance.close(false);
					};
				}],
				resolve: {
					message : function() {
						return details.expConfirm;
					}
				}
			}); 

			modalInstance.opened.then(function() {
				// Maybe do something about the focus here
			});
			
		    modalInstance.result.then(function (confirmed) {
		    	$log.info("Confirmed : " + confirmed);
		        if(confirmed) {
		        	details.success();
		        } else if(details.cancel){
		        	details.cancel();
		        }
		    });
		}
	};
}]);

})(angular);
/*!
 * Copyright 2015 Geoscience Australia (http://www.ga.gov.au/copyright.html)
 */

(function(angular) {
	
'use strict';

angular.module('explorer.drag', [])

.directive('dragParent', ['$document', '$timeout', function($document, $timeout) {
    return {
    	link : function(scope, element, attr) {
    		var container = null, offsetX, offsetY, bounds, timeout;
        	element.css({
        		cursor: 'pointer'
        	});

        	element.on('mousedown', function(event) {
        		// Prevent default dragging of selected content
        		event.preventDefault();
        		if(!container) {
        			container = element;
                	if(attr.parentclass) {
                		container = element.closest("." + attr.parentclass);
                	}
        		}

        		
        		timeout = $timeout(mouseup, 2000);
        		
            	bounds = container[0].getBoundingClientRect();
            	offsetY = event.pageY - bounds.top;
            	offsetX = event.pageX - bounds.left;
        		$document.on('mousemove', mousemove);
        		$document.on('mouseup', mouseup);
        	});

        	function mousemove(event) {
        		var x = event.pageX - offsetX, 
        			y = event.pageY - offsetY,
        			rect = document.body.getBoundingClientRect();
        			
        		if(x < 10 - bounds.width ) {
        			x = 10 -bounds.width;
        		} else if(x > rect.width - 10) {
        			x = rect.width - 10;
        		}
    			
        		if(y < 0) {
        			y = 0;
        		} else if(y > rect.height - 25) {
        			y = rect.height - 25;
        		}
        		
        		container.css({
        			top: y + 'px',
        			left:  x + 'px',
        			right: '',
        			bottom:''
        		});	
        		$timeout.cancel(timeout);
        		timeout = $timeout(mouseup, 2000);
        	}

        	function mouseup() {
        		$document.off('mousemove', mousemove);
        		$document.off('mouseup', mouseup);
        	}
    	}
    };
}]);

})(angular);
/*!
 * Copyright 2015 Geoscience Australia (http://www.ga.gov.au/copyright.html)
 */

(function(angular) {
	
'use strict';

angular.module("explorer.enter", [])

.directive('expEnter', [function () {
    return {
    	scope : {
    		expEnter : "&"
    	},
    	link : function (scope, element, attrs) {
            element.on("keydown keypress", function (event) {
            	if(event.which === 13) {
            		scope.$apply(function (){
            			scope.expEnter();
            		});
            		event.preventDefault();
            	}
            });
    	}
    };
}]);

})(angular);
/*!
 * Copyright 2015 Geoscience Australia (http://www.ga.gov.au/copyright.html)
 */
(function(angular, JSON) {

'use strict';

angular.module('explorer.feature.indicator', ['explorer.projects'])

.factory('indicatorService', ['$log', '$q', '$rootScope', 'httpData', 'projectsService', 'assetsService', function($log, $q, $rootScope, httpData, projectsService, assetsService) {
	// Maybe we should set up a configuration service
	var url = "service/asset/counts",
		lastPromise = null,
		md5 = null,
		lastTime = null;
	return {		
		
		checkImpact : function(extents) {
			var deferred, startTime;
			
			startTime = lastTime = new Date();
			
			if(lastPromise) {
				// Get rid of the last one as it is usurped. 
				lastPromise.resolve(null);
			}
			deferred = lastPromise = $q.defer(); 
			projectsService.getCurrentProject().then(function(project) {
				httpData.post(url, {
						wkt:extents,
						md5:md5,
						project:project
				}).then(function (response) {
                    var data = response.data, status = response.status;
					// If a subsequent request has come in we don't want to update
					// the counts but there is no cancel on a http request.
					if(startTime == lastTime && data.refreshRequired) {
						if(status == 200) {
							assetsService.getAssets().then(function(assets) {
								var countMap = data.countMap;
								md5 = data.md5;
								angular.forEach(assets, function(asset, key) {
									if(countMap[key]) {
										asset.count = countMap[key];
									} else {
										asset.count = 0;
									}
								});
							});
						} else {
							var message = "We have problem checking indicators.";
							if(data) {
								if(angular.isString(data)) {
									message = JSON.parse(data);
								}
								if(data.error) {
									message = data.error;
								}
							}
							// $log.debug(message);
						}
					} else {
						// $log.debug("This check does not need applying.");
					}
					deferred.resolve(data);
					lastPromise = null;
				});
			});
			return deferred.promise;
		}
	};
}]);

})(angular, JSON);
/*!
 * Copyright 2015 Geoscience Australia (http://www.ga.gov.au/copyright.html)
 */

(function(angular) {

'use strict';

angular.module("explorer.flasher", [])

.factory('flashService', ['$timeout', function($timeout) {
	var data = {
			items:[]
	};
	return {
		getData : function() {
			return data;
		},
		
		add : function(message, duration, spinner) {
			if(typeof spinner == "undefined") {
				spinner = false;
			}
			
			var item = {
					text:message,
					spinner:spinner,
					service:this,
					remove:function() {
						this.service.remove(this);
					}
			}, self = this;
			// Set a sane timeout in milliseconds
			duration = duration?duration:10000;
			
			data.items.push(item);
			item.timer = $timeout(function() {
				item.timer = null;
				self.remove(item);
			}, duration);
			
			return item;
		},
	
		remove : function(item) {
			if(!item) {
				// Nothing to do here.
				return;
			}
			if(item.timer) {
				$timeout.cancel(item.timer);
			}
			var index = data.items.indexOf(item);
			if(index > -1) {
				data.items.splice(index, 1);
			}
		}
	};
}])

.directive('explorerFlash', ['flashService', '$timeout', function(flashService, $timeout) {
	return {
		restrict : "AE",
		controller : ['$scope', 'flashService', function($scope, flashService) {
			$scope.messages = flashService.getData();			
		}],
		templateUrl: "components/flasher/flash.html",
		link : function(scope, element, attrs){
			element.addClass("marsFlash");
		}
	};
}]);

})(angular);
/*!
 * Copyright 2015 Geoscience Australia (http://www.ga.gov.au/copyright.html)
 */

(function(angular) {
	
'use.strict';

angular.module("explorer.focusme", [])

.directive("focusMe", ['$log', '$timeout', function($log, $timeout){
	return {
		link: function(scope, element, attrs) {
            attrs.$observe("focusMe", function(newValue) {
                if (newValue === "true") {
                    $timeout(function(){
                    	element.focus();
                    });
                }
            });
		}
	};
}]);

})(angular);
/*!
 * Copyright 2015 Geoscience Australia (http://www.ga.gov.au/copyright.html)
 */
(function(angular) {

'use strict';

angular.module('page.footer', [])

.directive('pageFooter', [function() {
	return {
		restrict:'EA',
		templateUrl:"components/footer/footer.html"
	};
}])

.directive('explorerFooter', ['$timeout', function($timeout) {
	return {
		restrict:'EA',
		controller:['$scope', function($scope) {}],
		link : function(scope, element, attrs) {
			scope.originalHeight = element.height();
			function hide(millis) {
				element.delay(millis).animate({bottom: - scope.originalHeight + 7}, 1000, function() {
					scope.hidden = true;
				});			
			}
			
			function show() {
				element.animate({bottom:0}, 1000, function() {
					scope.hidden = false;
				});			
			}
			
			element.on("mouseenter", function(event) {
				if(scope.timeout) {
					$timeout.cancel(scope.timeout);
					scope.timeout = null;
				}
				scope.timeout = $timeout(function() {
					show();
					scope.timeout = null;
				}, 300);
			});

			element.on("mouseleave", function() {
				if(scope.timeout !== null) {
					$timeout.cancel(scope.timeout);
					scope.timeout = null;
				} else {
					hide(0);
				}
			});
			hide(3000);
		}
	};
}]);


})(angular);
/*!
 * Copyright 2015 Geoscience Australia (http://www.ga.gov.au/copyright.html)
 */
(function(angular) {

'use strict';

angular.module('explorer.googleanalytics', [])

.directive('expGa', ['$window', 'ga', function($window, ga) {
	return {
		restrict: 'A',
		replace : false,
		scope: {
			expGa : "="
		},
		link: function(scope, element, attrs) {
			var event = attrs.gaOn || 'click';
			
 		    if (event == 'init') {
 			    send(scope.ga);
 		    } else {
 		    	element.on(event, send);
 		    }
    	   
    	    function send() {
    	    	ga(scope.expGa);
    		}
		}
    };
}])

.factory('ga', ['$log', '$window', function ($log, $window) {
    return function() {
        if ($window.ga) {
            $window.ga.apply(this, arguments);
        } else {
    		$log.warn("No Google Analytics");
    		$log.warn(scope.expGa);
    	}
    };
}]);

})(angular);
/*!
 * Copyright 2015 Geoscience Australia (http://www.ga.gov.au/copyright.html)
 */
(function(angular, d3) {

'use strict';

angular.module("graph", [])

.directive("explorerGraph", function() {
	var WIDTH = 1000,
	HEIGHT = 90;

	return {
		templateUrl : "components/graph/lineGraph.html",
		scope:{
			data : "=",
			config : "=",
			enter : "&",
			leave : "&",
			move : "&",
			click : "&",
			showZeroLine : "="
		},
		controller : ['$scope', function($scope) {	
			$scope.round = function(val) {
				return Math.round(val);
			};
			
			$scope.showZeroLine = !!$scope.showZeroLine;
		}],
	
		link : function(scope, element) {

			scope.mouseLeave = function(event) {
				scope.position = null;
				if(scope.leave) {
					scope.leave({event:event});
				}
			};
			
			scope.mouseEnter = function(event) {
				if(scope.enter) {
					scope.enter({event:event});
				}
			};
			
			scope.mouseMove = function(event) {
				calculatePosition(event);
				event.position = scope.position;
				if(scope.move) {
					scope.move({event:event});
				}
			};
			
			scope.mouseClick = function(event) {
				event.preventDefault();
				if(scope.click) {
					event.position = scope.position;
					scope.click({event:event});
				}	
			};
			
			scope.$watch("data", processData);
			processData();

			function calculatePosition(event) {
				var svgContainer = element.find("svg")[0],
					point, points, graphY, graphX,
	            	rect = svgContainer.getBoundingClientRect(),
	                ratio = 1050/rect.width,
	                index = Math.floor((event.pageX - rect.left) * ratio - 48); 	            

	            if(scope.lastIndex == index) {
	            	return;
	            } 
				
	        	scope.lastIndex = index;
	            if(index > -1 && index < 1000) {
	            	// TODO: We want to get a collection of points and call the event handler 
	            	// point = scope.points[index];
					points = [];
					
					scope.data.forEach(function(dataset) {
						var key = Math.round(index * dataset.data.length/1000),
							thisPoint = dataset.data[key];
						points.push({
							index:key,
							point: thisPoint
						});
					});
					
	            	graphX = index;
	            	
	            	scope.position = {
	            		index : index,
	            		percentX : (index + 1)/10,
	            		rangeY : scope.rangeY,
	            		y : {
	            			range : scope.rangeY,
	            			max: scope.maxY,
		            		min : scope.minY,    			
	            		},
	            		graphX: graphX,
	            		graphY: event.pageY - rect.top,
	            		pageX : event.pageX,
	            		pageY : event.pageY,
	            		points : points,
	            		point : points.length > 0?points[0].point:null
	            	};
	            } else {
	            	scope.position = null;
	            }
			}
			
			function dummyResponse() {
				return "";
			}
		
			function processData(data) {
				
				if(!data) {
					data = [[]];
				}
				var points = [];
				data.forEach(function(parts) {
					if(parts.data) {
						points.push.apply(points, parts.data);
					}
				});

				scope.minY = d3.min(points, function(d) { return d.z; });
				scope.maxY = d3.max(points, function(d) { return d.z; });
				scope.rangeY = scope.maxY - scope.minY;
				scope.yTicks = ticks(scope.minY, scope.maxY);
				
				scope.y = d3.scale.linear().range([HEIGHT, 0]);
				scope.y.domain(d3.extent(points, function(d) {return d.z;}));
			
				function ticks(min, max, count) {
					var step, range = max - min;
					if(!count) {
						count = 5;
					}
				
					// TODO make this a bit nicer or see if D3 can do it for us
					if(range < 5) {
						step = 1;
					} else if(range < 12) {
						step = 2;
					} else if(range < 24) {
						step = 5;
					} else if(range < 60) {
						step = 10;
					} else if(range < 120) {
						step = 20;
					} else if(range < 240) {
						step = 50;
					} else if(range < 600) {
						step = 100;
					} else if(range < 1200) {
						step = 200;
					} else if(range < 2400) {
						step = 500;
					} else if(range < 6000) {
						step = 1000;
					} else if(range < 12000) {
						step = 2000;
					} else if(range < 24000) {
						step = 5000;
					} else if(range < 60000) {
						step = 10000;
					} else {
						step = 20000;
					}
					return d3.range(Math.floor(min/step) * step + step, Math.floor(max/step) * step + step, step);
					//return d3.range(min - Math.abs(min % step) + step, max + (step - Math.abs(max % step)), step);			
				}
			}
		}
	};	
})

.directive("explorerLine", [function() {
	var WIDTH = 1000,
		HEIGHT = 90;
	
	return {
		restrict :"AE",
		controller : ["$scope", function($scope) {
			function processPoints(data) {
				var points = data.data;
				if(!points || !points.length) {
					$scope.calculateLines = $scope.calculatePath = dummyResponse;
					return;
				}
				
				$scope.minX = 0;
				$scope.maxX = points.length;
				$scope.rangeX = points.length;
				$scope.deltaLength = 1;
				
				var x = d3.time.scale().range([0, WIDTH]),
					y = $scope.y;
				
				x.domain(d3.extent(points, function(d, index) {return index;}));
			
				
				$scope.calculatePath = d3.svg.area().
					interpolate("monotone").
					x(function(d, index) { return x(index);}).
					y0(HEIGHT).
					y1(function(d){
						return y((d.z !== null)?d.z:$scope.minY);
					});
			
				$scope.calculateLine = d3.svg.line().
					interpolate("monotone").
					x(function(d, index) { return x(index);}).
					y(function(d){
						return y((d.z !== null)?d.z:$scope.minY);
					});

				$scope.line = $scope.calculateLine(points);
				$scope.path = $scope.calculatePath(points);
			}

			function dummyResponse() {
				return "";
			}
			
			$scope.$watch("points", processPoints); 
		}]
	};
}]);

})(angular, d3);
/*!
 * Copyright 2015 Geoscience Australia (http://www.ga.gov.au/copyright.html)
 */
(function(angular) {

'use strict';

angular.module('explorer.header', [])

.controller('headerController', [ '$scope', '$q', '$timeout', function ($scope, $q, $timeout) {

    var modifyConfigSource = function (headerConfig) {
        return headerConfig;
    };

    $scope.$on('headerUpdated', function (event, args) {
        $scope.headerConfig = modifyConfigSource(args);
    });
}])

.directive('explorerHeader', [function() {
	var defaults = {
		heading:"Geoscience Australia",
		headingtitle:"Geoscience Australia",
		helpurl:"help.html",
		helptitle:"Get help about Geoscience Australia",
		helpalttext:"Get help about Geoscience Australia",
		skiptocontenttitle:"Skip to content",
		skiptocontent:"Skip to content",
		quicklinksurl:"/search/api/quickLinks/json?lang=en-US"
	};
	return {
		transclude:true,
		restrict:'EA',
		templateUrl:"components/header/header.html",
		scope : {
			breadcrumbs: "=",
			heading: "=",
			headingtitle:"=",
			helpurl:"=",
			helptitle:"=",
			helpalttext:"=",
			skiptocontenttitle:"=",
			skiptocontent:"=",
			quicklinksurl:"="
		},
		link:function(scope, element, attrs) {
			var data = angular.copy(defaults);
			angular.forEach(defaults, function(value, key) {
				if(!(key in scope)) {
					scope[key] = value;
				}
			});
		}
	};
}]);

})(angular);
/*!
 * Copyright 2015 Geoscience Australia (http://www.ga.gov.au/copyright.html)
 */
(function(angular) {

'use strict';

angular.module('exp.web.login.header', [])

.controller('loginHeaderController', [ '$scope', '$q', '$timeout', function ($scope, $q, $timeout) {

    var modifyConfigSource = function (headerConfig) {
        return headerConfig;
    };

    $scope.$on('headerUpdated', function (event, args) {
        $scope.headerConfig = modifyConfigSource(args);
    });
}])

.directive('explorerLoginHeader', [function() {
	var defaults = {
		heading:"Geoscience Australia",
		headingtitle:"Geoscience Australia",
		helpurl:"help.html",
		helptitle:"Get help about Geoscience Australia",
		helpalttext:"Get help about Geoscience Australia",
		skiptocontenttitle:"Skip to content",
		skiptocontent:"Skip to content",
		quicklinksurl:"/search/api/quickLinks/json?lang=en-US"
	};
	return {
		transclude:true,
		restrict:'EA',
		templateUrl:"components/header/loginheader.html",
		scope : {
			heading: "=",
			headingtitle:"=",
			helpurl:"=",
			helptitle:"=",
			helpalttext:"=",
			skiptocontenttitle:"=",
			skiptocontent:"=",
			quicklinksurl:"="
		},
		link:function(scope, element, attrs) {
			var data = angular.copy(defaults);
			angular.forEach(defaults, function(value, key) {
				if(!(key in scope)) {
					scope[key] = value;
				}
			});
		}
	};
}]);

})(angular);
/*!
 * Copyright 2015 Geoscience Australia (http://www.ga.gov.au/copyright.html)
 */
(function($, window, angular) {

'use strict';

angular.module("explorer.height.delta", [])

.directive('heightDelta', ['$timeout', function($timeout) {
	return {
		link : function(scope, element, attrs) {
			function resize(force) {
				var obj, height, newHeight,
					data = attrs.heightDelta;
				if(data) {
					obj = JSON.parse(data);
					height = $(obj.selector).height();
					newHeight = height + obj.delta;
					if(!obj.min || newHeight > obj.min) {
						element.height(newHeight);
					}
				}
			}		
			$(window).on("resize", function() {
				resize(false); 
			});
			$timeout(function() {
				resize(true);
			});
		}
	};
}]);

})($, window, angular);
/*!
 * Copyright 2015 Geoscience Australia (http://www.ga.gov.au/copyright.html)
 */
(function (angular) {

    'use strict';

    angular.module("explorer.httpdata", [])

        .provider('httpData', function HttpDataProvider() {
            var _redirects = [];

            function fixUrl(url) {
                for (var i = _redirects.length; --i >= 0; ) {
                    var prefixes = _redirects[i].prefixes;
                    for (var j = prefixes.length; --j >= 0; ) {
                        if (url.indexOf(prefixes[j]) === 0)
                            return _redirects[i].where + url;
                    }
                }

                return url;
            }

            this.redirect = function (where, prefixes) {
                _redirects.push({
                    where: where,
                    prefixes: prefixes
                });
            };

            this.$get = ['$http', '$q', function ($http, $q) {
                return {
                    baseUrlForPkg: function(pkg) {
                        var regexp = new RegExp('((?:.*\/)|^)' + pkg + '[\w-]*\.js(?:\W|$)', 'i');
                        var scripts = document.getElementsByTagName('script');
                        for ( var i = 0, len = scripts.length; i < len; ++i) {
                            var result = regexp.exec(scripts[i].getAttribute('src'));
                            if (result !== null) return result[1];
                        }
                    },
                    fixUrl: fixUrl,
                    get: function (url, options) {
                        return $http.get(fixUrl(url), options);
                    },

                    post: function (url, data, options) {
                        return $http.post(fixUrl(url), data, options);
                    },

                    put: function (url, data, options) {
                        return $http.put(fixUrl(url), data, options);
                    }
                };
            }];
        });

})(angular);
/*!
 * Copyright 2015 Geoscience Australia (http://www.ga.gov.au/copyright.html)
 */
(function(angular, window) {

'use strict';

/**
 * @description
 * Aggregate the message and authentication interceptors
 */
angular.module('explorer.httpinterceptors', ['explorer.httpinterceptors.message', 'explorer.httpinterceptors.authentication']);


/**
 * @description
 * The message interceptor looks at data payload and if it has the attributes of a message displays it as such.
 */
angular.module('explorer.httpinterceptors.message', [])

.factory('messageHttpInterceptor', ['$q', '$log', 'messageService', function ($q, $log, messageService) {
    var setMessage = function (response) {
    	var message, data = response?response.data:null; 
    	
        //if the response has a text, code and a type (or severity) property, it is a message to be shown
        if (angular.isObject(data) && "text" in data && "code" in data && ("type" in data || "severity" in data)) {
            message = {
                text: response.data.text,
                type: (response.data.type?response.data.type:response.data.severity).toLowerCase(),
                show: true
            };
            messageService[message.type](message.text);
        }
    };
    
    return {
    	response : function(response) {
            setMessage(response);
            return response;
    	},
    	
    	responseError : function(response) {
            setMessage(response);
            return $q.reject(response);
        }
    };
}])
.config(['$httpProvider', function($httpProvider) {	
    //configure $http to catch message responses and show them
	$httpProvider.interceptors.push('messageHttpInterceptor');
}]);

/**
 * @description 
 * An authentication interceptor. Handles 401 and 403 errors and 302 redirects.
 * Notice it looks for a status of 0 as some browsers report redirects as 0.
 */
angular.module('explorer.httpinterceptors.authentication', [])

.factory('expHttpInterceptor', ['$rootScope', '$q', function ($rootScope, $q) {
	return {
		responseError : function (response) {
            if (!response || response.status === 401 || response.status === 0 || response.status === 302) {
               	// This forces a redirect to the index.html which means it will 
               	// get a redirect with a 302 that will take them to the authentication page.
              	window.location.reload();
            } else if (response.status === 403) {
                $rootScope.$broadcast('unauthorized');
            } else {
              	// Let the application handle it
            	return response;
            }
        }
	};
}])
.config(['$httpProvider', function($httpProvider) {	
    //configure $http to show a login dialog whenever a 401 unauthorized response arrives
	$httpProvider.interceptors.push('expHttpInterceptor');
}]);

})(angular, window);
/*!
 * Copyright 2015 Geoscience Australia (http://www.ga.gov.au/copyright.html)
 */
(function(angular) {

'use strict';

angular.module("explorer.info", [])

.directive("expInfo", ['$document', '$animate', function($document, $animate) {
	return {
		restrict: 'EA',
	    transclude: true,
	    replace:true,
	    scope: { 
	    	title: '@',  
	    	isOpen: '=',
			showClose: "="
	    },
	    templateUrl: 'components/info/info.html',
	    link: function( scope, element ) {
    		function keyupHandler(keyEvent) {
    			if(keyEvent.which == 27) {
    				keyEvent.stopPropagation();
    				keyEvent.preventDefault();
    				scope.$apply(function() {
        				scope.isOpen = false;
    				});
    			}
    		}
			
    		scope.$watch("isOpen", function(newValue) {
    			if(newValue) {
    				$document.on('keyup', keyupHandler);
    			} else {
    				$document.off('keyup', keyupHandler);
    			}
	    		scope.$on('$destroy', function () {
	    		    $document.off('keyup', keyupHandler);
	    		});
	    	});
	    }
	};
}]);

})(angular);
/*!
 * Copyright 2015 Geoscience Australia (http://www.ga.gov.au/copyright.html)
 */
(function(angular) {

'use strict';

angular.module("knob", [])

.directive("knob", ['$document', function($document){
	var defaultConfig = {
			circleColor : "#A33F1F",
			min : 0,
			max : 10,
			startAngle: 0,
			pointerColor:'#72C7E7',
			degrees:30,
			label : ""
		},
		index = 1;
		
	return {
		templateUrl : "components/knob/knob.html",
		restrict : "AE",
		scope : {
			knob : "=",
			value : "=",
			disabled : "=?",
			mapToPercentage : "=?",
			mapFromPercentage : "=?"
		},
		
		link : function(scope, element) {
			var i,
				events = {
					keydown: handleKeyEvents.bind(this),
					mousewheel: handleWheelEvents.bind(this),
					DOMMouseScroll: handleWheelEvents.bind(this),
					touchstart: handleMove.bind(this, 'touchmove', 'touchend'),
					mousedown: handleMove.bind(this, 'mousemove', 'mouseup')
				};

			
			// Need a unique ID.
			scope.knobShadow = "knobshadow_" + (index++);
			element[0].tabIndex = 0;
			
			for (var event in events) {
			    element.on(event, events[event]);
			}	
			
			if(!scope.knob.ticks && !scope.knob.step && angular.isNumber(scope.knob.min) && angular.isNumber(scope.knob.max)) {
				scope.knob.steps = scope.knob.max - scope.knob.min;
				scope.knob.step = 1;
			}
			
			scope.config = angular.extend({}, defaultConfig, scope.knob);
			
			if(scope.knob && scope.knob.ticks) {
				scope.ticks = scope.config.ticks = scope.knob.ticks;
			} else {
				scope.ticks = [];
				for(i = 0; i <= scope.config.steps; i++) {
					scope.ticks[i] = scope.config.min + i * scope.config.step;
				}
				scope.config.ticks = scope.ticks;
			}			

			scope.range = (scope.ticks.length - 1) * scope.config.degrees; 
			
			scope.checkDisabled = function() {
				if(scope.disabled) {
					return "opacity:0.5;cursor:auto";
				} else {
					return "cursor:grab";
				}
			};
			
			// Use linear mapper if none provided
			if(!scope.mapToPercentage) {
				scope.mapToPercentage = function(value) {
					var range = this.max - this.min;				
					return (value - this.min) / range * 100;
				};
			}

			// Use linear mapper if none provided
			if(!scope.mapFromPercentage) {
				scope.mapFromPercentage = function(percent) {
					return this.min + (this.max - this.min) * percent / 100;
				};
			}
			
			scope.$watch("value", function(value) {
				scope.percentage = scope.mapToPercentage.bind(scope.config)(value);
				scope.angle = scope.config.startAngle + scope.range * scope.percentage / 100;
			});						
			
			function handleKeyEvents(e) {	
			   var keycode = e.keyCode;
			   
			   if(!scope.disabled && keycode >= 37 && keycode <= 40) {
				   scope.$apply(function() {
					      e.preventDefault();
					      var f = 1 + e.shiftKey * 9;
					      changed({37: -1, 38: 1, 39: 1, 40: -1}[keycode] * f);
				   });
			   }
			}			
			
			function handleWheelEvents(e) {
				if(scope.disabled) {
					return;
				}
				scope.$apply(function() {
					var deltaX = -e.detail || e.wheelDeltaX,
						deltaY = -e.detail || e.wheelDeltaY,
						val = deltaX > 0 || deltaY > 0 ? 1 : deltaX < 0 || deltaY < 0 ? -1 : 0;
						
					e.preventDefault();
					changed(val);
				});
			}
			
			function handleMove(onMove, onEnd) {
				var bounder = element[0].getBoundingClientRect();
				if(scope.disabled) {
					return;
				}
				
			    scope.centerX = bounder.left + bounder.width / 2;
			    scope.centerY = bounder.top + bounder.height / 2;
			    
			    $document.on(onMove, updateWhileMoving);
			    $document.on(onEnd, function() {
			    	$document.off(onMove, updateWhileMoving);
			    });
			}
			
			function updateWhileMoving(event) {
			    var e = event.changedTouches ? event.changedTouches[0] : event,
			        x = scope.centerX - e.pageX,
			        y = scope.centerY - e.pageY,
			        deg = Math.atan2(-y, -x) * 180 / Math.PI + 90 - scope.config.startAngle,
			        percent, value, step;
			    
			    event.preventDefault();
			    
			    if (deg < 0) {
			      deg += 360;
			    }
			    deg = deg % 360;
			    
			    
			    if (deg <= scope.range) {
			      percent = Math.max(Math.min(1, deg / scope.range), 0);
			    } else {
			      percent = +(deg - scope.range < (360 - scope.range) / 2);
			    }
			    percent = percent * 100;
			    
			    scope.value = scope.mapFromPercentage.bind(scope.config)(percent);			    
			    scope.$apply();
			}
			
			function changed(direction) {
				var percentage;
			    scope.angle = limit(scope.angle + (scope.config.degrees * direction));
			    percentage = (scope.angle - scope.config.startAngle) / scope.range * 100;
			    scope.value = scope.mapFromPercentage.bind(scope.config)(percentage);
			}
			
			function limit(value) {
				var max = scope.config.startAngle + scope.range;
				return value < scope.config.startAngle?scope.config.startAngle : value > max?max : value; 
			}
		}
	};
}]);

})(angular);
/*!
 * Copyright 2015 Geoscience Australia (http://www.ga.gov.au/copyright.html)
 */
(function(angular) { 

'use strict'; 

angular.module("explorer.legend", [])

.directive("explorerLegend", ['$modal', function($modal){
	return {
		scope : {
			legend : "=",
			heading:"=?"
		},
		controller : ['$scope', function($scope) {
			if(!$scope.heading) {
				$scope.heading = "Legend";
			}
			$scope.showing = false;
		}],
		link : function(scope, element) {
			var modalInstance;
			element.on('click', function() {
				if(scope.showing) {
					modalInstance.close(null);
					return;
				}
				modalInstance = $modal.open({
					templateUrl: 'components/legend/legend.html',
					windowClass: 'legendContainer',
					size:'sm',
					controller : ['$scope', '$modalInstance', 'legend', 'heading', function($scope, $modalInstance, legend, heading) {
						$scope.legend = legend;
						$scope.heading = heading;
					}],
					backdrop:false,
					resolve: {
						legend: function () {
							return scope.legend;
						},
						heading : function() {
							return scope.heading;
						}
					}
				});
				modalInstance.result.then(function() {scope.showing = false;}, function() {scope.showing = false;});
				scope.showing = true;
			});
		}
	};
}]);

})(angular);
/*!
 * Copyright 2015 Geoscience Australia (http://www.ga.gov.au/copyright.html)
 */

(function(angular, window) {
'use strict';

/**
 * @ngdoc object
 * @name exp.web.login
 * @description
 *
 * <p>Handles user login</p>
 * 
 * 
 */

angular.module("exp.web.login", [])

.directive('expWebLogin', ['loginService', function(loginService) {
	return {
		restrict : 'EA',
		templateUrl : 'components/login/login.html',
		link : function(scope, element, attrs) {
			scope.login = function() {
				loginService.login();
			};
		}
	};
}])

/**
 * @ngdoc service
 * @name loginService
 * @description 
 * Allows a user to login but not logout. It works by calling a service behinde a security
 * filter that identifies that the user is not logged in and redirects the user to the
 * CAS login page. This is standards procedure for the Spring filter that is used to 
 * isolate GA applications. Once the user is verified CAS then redirects the user back to 
 * the same end point and now the code at that endpoint redirects to the application 
 * nominated in the application parm. If the parm is not set then there are defaults
 * in the servcie endpoint to send the application to, 
 * 
 *
 * Example usage: 
 * 
<pre>
loginServiceProvider.url("my/end/point/forRedirect");
loginServiceProvider.application("rock-properties.html");
...
loginService.login();
</pre>
 *
 *
 *
 */

.provider("loginService", function LoginServiceProvider() {	
	// By default it returns to / but you can give it a full path in your config 
	var application = "",
		baseUrl = 'service/loginState/login';
	
	// Change the url here
	this.url = function(where) {
		baseUrl = where;
	};

	this.application = function(path) {
		if(!path) {
			path = "";
		}
		application = "?application=" + encodeURIComponent(path); 
	};
	
	this.$get = [function() {
		return {
			login : function() {
				window.location.href = baseUrl + application;
			}
		};
	}];
});

})(angular, window);
/*!
 * Copyright 2015 Geoscience Australia (http://www.ga.gov.au/copyright.html)
 */
(function(angular) {

'use strict';

angular.module("explorer.message", [])

.directive('explorerMessages', ['messageService', function(messageService) {
	return {
		restrict:'AE',
		controller : 'MessageController',
		templateUrl : 'components/message/messages.html',
		link : function(scope, element, attrs, controller) {
		}
	};	
}])

.factory("messageService", ["$rootScope", function($rootScope) {
    return {
    	warn : function(message) {
    		this._message("warn", message);
    	},
    	success : function(message) {
    		this._message("success", message);
    	},
    	info : function(message) {
    		this._message("info", message);
    	},
    	error : function(message) {
    		this._message("error", message);
    	},
    	clear : function() {
    		$rootScope.$broadcast('message.clear');
    	},    	
    	_message : function(type, message) {
    		$rootScope.$broadcast('message.posted', {
    			type : type,
    			text : message,
    			time : new Date()
    		});
    	}
    };
}])

.controller('MessageController', ['$scope', '$timeout', '$rootScope', function($scope, $timeout, $rootScope) {
	$scope.controller = "MessageController";
	$scope.persistDuration = 12000;
	$scope.historicCount = 10;
	$scope.message = null;
	$scope.historic = [];
	
	$rootScope.$on('message.posted', function(event, message) {
		var phase = $scope.$root.$$phase;
		if(phase == '$apply' || phase == '$digest') {
			$scope.message = message;
		} else {
		   this.$apply(function() {
				$scope.message = message;
			});
		}
		
		$timeout.cancel($scope.timeout);
		$scope.timeout = $timeout(function() {
			$scope.$apply(function() {
				$scope.removeMessage();
			});
		}, $scope.persistDuration);
	});
	
	$rootScope.$on("message.cleared", $scope.removeMessage);
	
	$scope.removeMessage = function() {
		$scope.timeout = null;
		$scope.historic.splice(0, 1, $scope.message);
		while($scope.historic.length > 10) {
			$scope.historic.pop();
		}
		$scope.message = null;
	};	
}])

.run(['$rootScope', 'messageService',  
         function($rootScope, messageService) {
	//make current message accessible to root scope and therefore all scopes
    $rootScope.$on("message:info", function (event, message) {
        messageService.info(message);
    });
    $rootScope.$on("message:error", function (event, message) {
        messageService.error(message);
    });
    $rootScope.$on("message:success", function (event, message) {
        messageService.success(message);
    });
    $rootScope.$on("message:warn", function (event, message) {
        messageService.warn(message);
    });
    $rootScope.$on("message:clear", function (message) {
        messageService.warn(message);
    });
    $rootScope.$on("messages", function (event, messages) {
    	messages = messages?angular.isArray(messages)?messages:[messages]:[];
    	angular.forEach(messages, function(message) {
    		$rootScope.$broadcast("message:" + message.type.toLowerCase(), message.text);
    	}); 
    });
}]);

})(angular);
/*!
 * Copyright 2015 Geoscience Australia (http://www.ga.gov.au/copyright.html)
 */
(function(angular) {

'use strict';

/**
 * Explorer 
 */
angular.module("explorer.modal", [])

.directive("expModal", ['$document', '$animate', 'modalService', function($document, $animate, modalService) {
	return {
		restrict: 'EA',
	    transclude: true,
	    replace:true,
	    scope: { 
	    	iconClass : '@',
	    	title: '@',
	    	containerStyle : '@',
	    	template: '=', 
	    	placement: '@', 
	    	animation: '&', 
	    	onClose : "&",
	    	isOpen: '=',
	    	isModal: '='
	    },
		templateUrl:"components/modal/modal.html",
	    link: function( scope, element ) {    		
    		scope.$watch("isOpen", function(newValue, oldValue) {
    			var extent;
    			if(newValue) {
    				element.css("zIndex", modalService.index());
    				element.on('keyup', keyupHandler);
    			} else {
    				element.off('keyup', keyupHandler);
    				if(newValue != oldValue) {
    					modalService.closed();
    					scope.onClose();
    				}
    			}
	    		scope.$on('$destroy', function () {
	    		    element.off('keyup', keyupHandler);
	    		});
	    	});

    		function keyupHandler(keyEvent) {
    			if(keyEvent.which == 27) {
    				keyEvent.stopPropagation();
    				keyEvent.preventDefault();
    				scope.$apply(function() {
        				scope.isOpen = false;
    				});
    			}
    		}
	    }
	};
}])

.directive("expModalUp", ['$document', '$animate', 'modalService', function($document, $animate, modalService) {
	return {
		link : function(scope, element) {
			element.on("mousedown", function(event) {
				if(scope.isModal) {
					scope.modalIndex = modalService.index();
				}
				element.css("zIndex", modalService.index());
			});
		}
	};
}])

.factory("modalService", [function() {
	// Bootstrap modal backdrop id z-index = 1040 in bootstrap so start modals from here.
	var COUNT_START = 1030,
		count = COUNT_START,
		opened = 0;
	
	return {
		index : function() {
			if(opened === 0) {
				count = COUNT_START;
			}
			opened++;
			return count++;
		},
		closed : function() {
			opened--;
			if(opened < 0) {
				opened = 0;
			}
		}
	};
}]);

})(angular);
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
/*!
 * Copyright 2015 Geoscience Australia (http://www.ga.gov.au/copyright.html)
 */

(function(angular) {
	

'use strict';

angular.module("explorer.ping", [])

.provider("pingService", function pingServiceProvider() {
	var url = "service/ping/keepalive",
		delaySeconds = 600,
		enabled = true,
		timeout = null;

	this.location = function(where) {
		url = where;
	};

	this.enable = function(value) {
		enabled = value;
	};
	
	this.$get = ['httpData', '$timeout', function pingServiceFactory(httpData, $timeout) {
		var $ping = {
			enable :function(value) {
				enabled = value;
			},
			
			period : function(delay) { 
				delaySeconds = delay;
			},
			start : function() {
				// Bootstrap it
			}
		};
		ping();
		return $ping;
		
		function ping() {
			if(enabled) {
                httpData.post(url);
			}
			timeout = $timeout(ping, delaySeconds * 1000);
		}
	}];
	
});

})(angular);
/*!
 * Copyright 2015 Geoscience Australia (http://www.ga.gov.au/copyright.html)
 */
(function(angular) {

'use strict';

angular.module('explorer.popover', [])

.directive('expPopover', [function() {
	return {
		templateUrl : "components/popover/popover.html",
		restrict : 'A',
		transclude : true,
		scope : {
			closeOnEscape : "@",
			show : "=",
			containerClass : "=",
			direction : "@"
		},
		link : function(scope, element) {
			if(!scope.direction) {
				scope.direction = "bottom";
			}
			
			if(scope.closeOnEscape && (scope.closeOnEscape === true || scope.closeOnEscape === "true")) {
				element.on('keyup', keyupHandler);
			}
			
    		function keyupHandler(keyEvent) {
    			if(keyEvent.which == 27) {
    				keyEvent.stopPropagation();
    				keyEvent.preventDefault();
    				scope.$apply(function() {
        				scope.show = false;
    				});
    			}
    		}
		}
	
	};
}]);

})(angular);
/*!
 * Copyright 2015 Geoscience Australia (http://www.ga.gov.au/copyright.html)
 */
(function(angular, window) {

'use strict';

angular.module('mars.print', [])

.directive('marsPrintMap', [function() {
	return {
		template : '<i class="fa fa-print"></i>',
		link : function(scope, element) {	
			element.on("click", function() {
				window.print();
			});
		}
	};
}]);

})(angular, window);
/*!
 * Copyright 2015 Geoscience Australia (http://www.ga.gov.au/copyright.html)
 */
(function(angular) {

	
'use strict';

angular.module("explorer.projects", [])

.provider('projectsService', function ProjectsServiceProvider() { 
	var currentProject = "<NONE>";

	this.$get =  ['$q', '$timeout', 'httpData', function ($q, $timeout, httpData) {
		var baseUrl = 'service/appConfig/projects?t=';
	
		return {
			getCurrentProject : function() {
				return $q.when(currentProject);
			},
		
			getProjects : function() {
				var deferred = $q.defer();
				if(this.projects) {				
					$timeout((function() {
						deferred.resolve(this.projects);
					}).bind(this));
				}
                httpData.get(baseUrl + (new Date()).getTime()).then((function(response) {
					deferred.resolve(this.projects = response && response.data);
				}).bind(this));
			
				return deferred.promise;
			}
		};
	}];
	
	this.setProject = function(project) {
		currentProject = project;
	};
});


})(angular);
/**
 * @ngdoc object
 * @name explorer.resizelistener
 * @description
 * 
 * <p>Binds to window resize event, exposes windowWidth and windowHeight as $scope vars.</p>
 * 
 * 
 **/

angular.module('explorer.resizelistener', [])

.directive('resizeListener', function($window) {
	
	return function (scope, element) {
        var w = angular.element($window);
        scope.getWindowDimensions = function () {
            return {
                'h': w.height(),
                'w': w.width()
            };
        };
        
        scope.$watch(scope.getWindowDimensions, function (newValue, oldValue) {
            
        	scope.windowHeight = newValue.h;
            scope.windowWidth = newValue.w;

            scope.style = function () {
                return {
                    'height': (newValue.h - 100) + 'px',
                    'width': (newValue.w - 100) + 'px'
                };
            };
            
            // could also broadcast 'resize complete' event if needed..

        }, true);

        w.bind('resize', function () {
            scope.$apply();
        });
    };
});
/*!
 * Copyright 2015 Geoscience Australia (http://www.ga.gov.au/copyright.html)
 */
(function(angular, sessionStorage) {

'use strict';

angular.module("nedf.splash", ['explorer.projects'])

.directive('marsSplash', ['$rootScope', '$modal', '$log', 'userService', 
                        function($rootScope, $modal, $log, userService){
	return {
		controller : ['$scope', 'splashService', function ($scope, splashService) {
			$scope.acceptedTerms = true;
			
			splashService.getReleaseNotes().then(function(messages) {
				$scope.releaseMessages = messages;
				$scope.acceptedTerms = userService.hasAcceptedTerms();
			});
		}],
		link : function(scope, element) {
			var modalInstance;
			
			scope.$watch("acceptedTerms", function(value) {
				if(!value) {
					modalInstance = $modal.open({
						templateUrl: 'partials/splash.html',
						size: "lg",
						backdrop : "static",
						keyboard : false,
						controller : ['$scope', '$modalInstance', 'acceptedTerms', 'messages', function ($scope, $modalInstance, acceptedTerms, messages) {
							$scope.acceptedTerms = acceptedTerms;
							$scope.messages = messages;
							$scope.accept = function () {
								$modalInstance.close(true);
							};
						}],
						resolve: {
							acceptedTerms: function () {
								return scope.acceptedTerms;
							},
							messages : function() {
								return scope.messages;
							}
						}
					});				    
				    modalInstance.result.then(function (acceptedTerms) {
				    	$log.info("Accepted terms");
				        scope.acceptedTerms = acceptedTerms;
				        userService.setAcceptedTerms(acceptedTerms);
				    }, function () {
				        $log.info('Modal dismissed at: ' + new Date());
				    });
				} 
			});
			
			$rootScope.$on("logoutRequest", function() {
				userService.setAcceptedTerms(false);
			});
		}
	};
}])

.factory("splashService", ['httpData', 'projectsService', function(httpData, $q, projectsService) {
	var VIEWED_SPLASH_KEY = "nedf.accepted.terms",
		releaseNotesUrl = "service/releaseNotes/";
		
	return {
		getReleaseNotes : function() {
			var deferred = $q.defer();
			projectsService.getCurrentProject().then(function(project) {
				httpData.get(releaseNotesUrl + project + "?t=" + Date.now()).then(function(response) {
					deferred.resolve(response && response.data);
				});
			});
			return deferred.promise;
		},
		hasViewedSplash : hasViewedSplash,
		setHasViewedTerms : setHasViewedTerms
	};	

	function setHasViewedTerms(value) {
		if(value) {
			sessionStorage.setItem(VIEWED_SPLASH_KEY, true);
		} else {
			sessionStorage.removeItem(VIEWED_SPLASH_KEY);			
		}
	}

	function hasViewedSplash() {
		return !!sessionStorage.getItem(VIEWED_SPLASH_KEY);
	}
}])

.filter("priorityColor", [function() {
	var map = {
		IMPORTANT: "red",
		HIGH: "blue",
		MEDIUM: "orange",
		LOW: "gray"
	};
	
	return function(priority) {
		if(priority in map) {
			return map[priority];
		}
		return "black";
	};
}])

.filter("wordLowerCamel", function() {
	return function(priority) {
		return priority.charAt(0) + priority.substr(1).toLowerCase();
	};
})

.filter("sortNotes", [function() {	
	return function(messages) {
		var response = messages.slice(0).sort(function(prev, next) {
			if(prev.priority == next.priority) {
				return prev.lastUpdate == next.lastUpdate?0:next.lastUpdate - prev.lastUpdate; 
			} else {
				return prev.priority == "IMPORTANT"?-11:1;
			}			
		});
		return response;
		
	};
}]);

})(angular, sessionStorage);
/*!
 * Copyright 2015 Geoscience Australia (http://www.ga.gov.au/copyright.html)
 */
(function(angular) {

'use strict';

angular.module('explorer.switch', [])

.directive('explorerSwitch', [function () {
	return {
		restrict: 'EA',
		scope: {
			disabled: '=',
			onLabel: '@',
			offLabel: '@',
			knobLabel: '@',
			model: '='    	  
		},
    
		template: '<div role="radio" class="toggle-switch" ng-class="{ \'disabled\': disabled }">' +
        	'<div class="toggle-switch-animate" ng-class="{\'switch-off\': !model, \'switch-on\': model}">' +
        	'<span class="switch-left switch-text" ng-bind="onLabel"></span>' +
        	'<span class="switch-label-text" ng-bind="knobLabel"></span>' +
        	'<span class="switch-right switch-text" ng-bind="offLabel"></span>' +
        	'</div>' +
        	'</div>',
        link: function(scope, element){
        	if(!scope.onLabel) { 
        		scope.onLabel = 'On'; 
        	}
        	if(!scope.offLabel) { 
        		scope.offLabel = 'Off'; 
        	}
        	if(!scope.knobLabel) { 
        		scope.knobLabel = '\u00a0'; 
        	}
        	if(!scope.disabled) { 
        		scope.disabled = false; 
        	}

        	element.on('click', function() {
        		scope.$apply(scope.toggle);
        	});
        	
        	scope.toggle = function toggle() {
        		if(!scope.disabled) {
    				scope.model = !scope.model;
    			}
    		};
    	}
  	};
}]);

})(angular);
/**
 * @ngdoc object
 * @name explorer.tabs
 * @description
 *
 * <p>Used to control the show/hide/resize of tabs.
 * Application specific implementation should be added via a supplementary module and directives.</p>
 * 
 * General panelling is provided by bgDirectives
 * 
 * <p>e.g. Rock Props uses:</p>
 * <ul>
 * <li>rocks/tabs/tabs.html (defines app specific tabs and their respective directives)</li>
 * <li>rocks/tabs/rocks-tabs.js (defines the core tabsMain directive/template, and supporting content)</li>
 * </ul>
 * <p>So to use:</p>
 * <ol>
 * <li>include explorer.tabs module and resources</li>
 * <li>include assets/bg-splitter/*</li>
 * <li>define custom tabs and directives -> app-dir/tabs/</li>
 * <li>add tabsMain directive to your index.html, right below mapMain</li>
 * </ol>
 * 
 * 
 */
(function(angular) {
'use strict';
	
	
angular.module('explorer.tabs', [])

.controller("tabsController", ['$scope', '$document', function($scope, $document) {
	
	var minWidth = 300;
	var winWidth = window.innerWidth || document.documentElement.clientWidth;
	var widthPersist = 540; // using 0 width when inactive to prevent obscuring the map
	
	$scope.view = '';
	$scope.contentWidth = 0;
	$scope.contentLeft = 0;
	$scope.winHeight = window.innerHeight || document.documentElement.clientHeight;
	
	$scope.setView = function(view){
		
		if($scope.view === view){
			$scope.view = '';
			widthPersist = $scope.contentWidth;
			$scope.contentWidth = 0;
			$scope.contentLeft = 0;
		} else {
			$scope.view = view;
			$scope.contentWidth = widthPersist;
			$scope.contentLeft = $scope.contentWidth;
		}
	};
	
	$scope.catchResize = function(){
	
		$document.on("mousemove", mousemove);
		$document.on("mouseup", mouseup);
		
        function mousemove($event) {
        	$scope.doResize($event);
        }
        
        function mouseup() {
        	$document.off("mousemove", mousemove);
        	$document.off("mouseup", mouseup);
        }
	};
	
	$scope.doResize = function($event){
		
		var width = winWidth - $event.pageX;
		width = (width > minWidth) ? width : minWidth;
		
		$scope.contentWidth = width;
		$scope.contentLeft = width;
		widthPersist = width;
		$scope.$apply();
	};
	
	$scope.callback = function() {
		//console.log("Calling back")
	};
	
}]);

})(angular);
/**
 * @ngdoc object
 * @name explorer.tabs.left
 * @description
 *
 * <p>Used to control the show/hide/resize of tabs.
 * Application specific implementation should be added via a supplementary module and directives.</p>
 * 
 * General panelling is provided by bgDirectives
 * 
 * <p>e.g. Rock Props uses:</p>
 * <ul>
 * <li>rocks/tabs/tabs.html (defines app specific tabs and their respective directives)</li>
 * <li>rocks/tabs/rocks-tabs.js (defines the core tabsMain directive/template, and supporting content)</li>
 * </ul>
 * <p>So to use:</p>
 * <ol>
 * <li>include explorer.tabs module and resources</li>
 * <li>include assets/bg-splitter/*</li>
 * <li>define custom tabs and directives -> app-dir/tabs/</li>
 * <li>add tabsMain directive to your index.html, right below mapMain</li>
 * </ol>
 * 
 * 
 */

angular.module('explorer.tabs.left', [])

.controller("tabsLeftController", ['$scope', '$document', function($scope, $document) {
	
	var minWidth = 400;
	var winWidth = window.innerWidth || document.documentElement.clientWidth;
	var widthPersist = 700; // use 0 width when inactive
	
	$scope.view = '';
	
	$scope.contentWidth = 0;
	$scope.winHeight = window.innerHeight || document.documentElement.clientHeight;
	//$scope.winHeight = 9999;
	
	$scope.setView = function(view){
		
		if($scope.view === view){
			$scope.view = '';
			widthPersist = $scope.contentWidth;
			$scope.contentWidth = 0;
		}
		else {
			$scope.view = view;
			$scope.contentWidth = widthPersist;
		}
	};
	
	
	$scope.catchResize = function(){
	
		$document.on("mousemove", mousemove);
		$document.on("mouseup", mouseup);
		
        function mousemove($event) {
        	$scope.doResize($event);
        }
        
        function mouseup() {
        	$document.off("mousemove", mousemove);
        	$document.off("mouseup", mouseup);
        }
	};
	
	$scope.doResize = function($event){
		
		var width = $event.pageX + 2;
		width = (width > minWidth) ? width : minWidth;
		
		$scope.contentWidth = width;
		widthPersist = width;
		$scope.$apply();
	};
	
}]);
/*!
 * Copyright 2015 Geoscience Australia (http://www.ga.gov.au/copyright.html)
 */
(function(angular) {

'use strict';

angular.module('explorer.toolbar', [])

.directive('expToolbar', [function() {
	return {
		restrict:'AE',
		scope:true,
		controller : ['$scope', function($scope) {
			$scope.item = "";	
			$scope.parameters = {};
			
			$scope.toggleItem = function(item) {
				$scope.item = $scope.item == item?"":item;
			};
			
			this.toggleItem = function(item) {
				$scope.item = $scope.item == item?"":item;
			};
			this.currentItem = function() {
				return $scope.item;
			};
		}]
	};
}]);

})(angular);
/*!
 * Copyright 2015 Geoscience Australia (http://www.ga.gov.au/copyright.html)
 */
(function(angular, sessionStorage, window) {

'use strict';

angular.module("explorer.user", [])

.directive('marsUserDetails', ['userService', '$rootScope', '$location', function(userService, $rootScope, $location) {
	return {
		restrict : 'EA',
		templateUrl : 'components/user/userdetails.html',
		link : function(scope, element, attrs) {
			userService.getUsername().then(function(username){
				scope.username = username;
			});
		}
	};
}])


.directive('expWebUserDetails', ['userService', '$rootScope', '$location', function(userService, $rootScope, $location) {
	return {
		restrict : 'EA',
		templateUrl : 'components/user/userlogindetails.html',
		link : function(scope, element, attrs) {
			userService.getUsername().then(function(username){
				scope.username = username;
			});
			
			scope.logout = function() {
				userService.logout();
			};
		}
	};
}])


/**
 * @ngdoc interface
 * 
 * In Explorer the service/appConfig is a secured endpoint but there is an analogous endpoint called 
 * service/anonAppConfig that is for those configuration items that are not secure so if you have an
 * application that does not need to be secured then change the config to point to a service that 
 * returns a username property 
 * @example
 *  userServiceProvider.url("my/end/point/for/user/name");
 *  // {
 *  //   "username":"larry"
 *  // } 
 */

.provider("userService", function UserServiceProvider() {	
	var baseUrl = 'service/appConfig/status',
		logoutUrl = 'j_spring_security_logout';
	
	this.logoutUrl = function(url) {
		logoutUrl = url;
	};
	
	// Change the url here
	this.url = function(where) {
		baseUrl = where;
	};

	this.$get = ['$cookies', 'httpData', '$q', '$window', '$timeout', function($cookies, httpData, $q, $window, $timeout) {
		var username;

		function login() {
			window.location.reload();
		}

		function setAcceptedTerms(value) {
			if(value) {
				sessionStorage.setItem("mars.accepted.terms", true);
			} else {
				sessionStorage.removeItem("mars.accepted.terms");			
			}
		}

		function hasAcceptedTerms() {
			return !!sessionStorage.getItem("mars.accepted.terms");
		}

		function loadCredentials() {
			return httpData.get(baseUrl + "?time=" + (new Date()).getTime());
		}
		
		return {
			logout : function() {
				$window.location.href = logoutUrl;
				$cookies.remove("JSESSIONID");				
			},
			
			login : function() {
				login();
			},
			
			hasAcceptedTerms : function() {
				return hasAcceptedTerms();
			},
			
			setAcceptedTerms : function(value) {
				setAcceptedTerms(value);
			},
			
			getUsername : function() {
				var deferred;
				if(username) {
					return $q.when(username);
				} else {
					deferred = $q.defer();
					loadCredentials().then(function(creds) {
						if(creds) {
							username = creds.data.username;
						}
						deferred.resolve(username);
					});
					return deferred.promise;
				}
			}
		};
	}];
});

})(angular, sessionStorage, window);
/*!
 * Copyright 2015 Geoscience Australia (http://www.ga.gov.au/copyright.html)
 */
(function(angular) {

'use strict';

angular.module("explorer.version", [])

.directive('marsVersionDisplay', ['httpData', 'versionService', function(httpData, versionService) {
	/**
	 * CIAP theme switcher. Retrieves and stores the current theme to the theme service. 
	 */
	return {
		templateUrl:'components/version/versionDisplay.html',
		link : function(scope) {
			httpData.get(versionService.url()).then(function(response) {
				scope.version = response && response.data.version;
			});
		}
	};	
}])

.provider("versionService", function VersionServiceProvider() {
	var versionUrl = "service/appConfig/version";
	
	this.url = function(url) {
		versionUrl = url;
	};
	
	this.$get = function configServiceFactory() {
		return {
			url : function() {
				return versionUrl;
			}
		};
	};
});

})(angular);
/*!
 * Copyright 2015 Geoscience Australia (http://www.ga.gov.au/copyright.html)
 */
(function(angular) {
	

'use strict';

angular.module("explorer.waiting", [])

.factory("waiting", ['$q', function($q) {
	return {
		wait : function() {
			return new QAll();
		}
	};
	
	function QAll() {
		this.waiting = [];
		this.length = 0;
		this.waiter = function() {
			var deferred = $q.defer();
			this.waiting.push(deferred);
			this.length++;
			
			return deferred;
		};
		
		this.resolve = function(result) {
			this.waiting.forEach(function(promise) {
				promise.resolve(result);
			});
			this.waiting = [];
			this.length =0;
		};
		
		this.reject = function(result) {
			this.waiting.forEach(function(promise) {
				promise.reject(result);
			});
			this.waiting = [];
			this.length =0;
		};
		
		this.notify = function(result) {
			this.waiting.forEach(function(promise) {
				promise.notify(result);
			});
		};
	}
}]);

})(angular);
angular.module("exp.ui.templates", []).run(["$templateCache", function($templateCache) {$templateCache.put("components/confirm/confirm.html","<div class=\"modal-header\">\r\n   <h3 class=\"modal-title\" style=\"font-weight:bolder\">Confirm</h3>\r\n</div>\r\n<div class=\"modal-body\" id=\"accept\" style=\"width: 100%; margin-left: auto; margin-right: auto;\">\r\n	<div>\r\n		{{message}}\r\n	</div>	\r\n	<div style=\"text-align: right;padding-top:10px\">\r\n		<button type=\"button\" class=\"btn btn-default\" style=\"width:4em\" ng-click=\"accept()\" focus-me=\"true\">OK</button>\r\n		<button type=\"button\" class=\"btn btn-default\" style=\"width:4em\" ng-click=\"reject()\">Cancel</button>\r\n	</div>\r\n</div>");
$templateCache.put("components/flasher/flash.html","<div class=\"marsFlash\" ng-show=\"messages.items.length > 0\">\r\n  <div ng-repeat=\"message in messages.items\">\r\n     <span><img alt=\"Waiting...\" src=\"data:image/gif;base64,R0lGODlhEAAQAPIAAP///wAAAMLCwkJCQgAAAGJiYoKCgpKSkiH/C05FVFNDQVBFMi4wAwEAAAAh/hpDcmVhdGVkIHdpdGggYWpheGxvYWQuaW5mbwAh+QQJCgAAACwAAAAAEAAQAAADMwi63P4wyklrE2MIOggZnAdOmGYJRbExwroUmcG2LmDEwnHQLVsYOd2mBzkYDAdKa+dIAAAh+QQJCgAAACwAAAAAEAAQAAADNAi63P5OjCEgG4QMu7DmikRxQlFUYDEZIGBMRVsaqHwctXXf7WEYB4Ag1xjihkMZsiUkKhIAIfkECQoAAAAsAAAAABAAEAAAAzYIujIjK8pByJDMlFYvBoVjHA70GU7xSUJhmKtwHPAKzLO9HMaoKwJZ7Rf8AYPDDzKpZBqfvwQAIfkECQoAAAAsAAAAABAAEAAAAzMIumIlK8oyhpHsnFZfhYumCYUhDAQxRIdhHBGqRoKw0R8DYlJd8z0fMDgsGo/IpHI5TAAAIfkECQoAAAAsAAAAABAAEAAAAzIIunInK0rnZBTwGPNMgQwmdsNgXGJUlIWEuR5oWUIpz8pAEAMe6TwfwyYsGo/IpFKSAAAh+QQJCgAAACwAAAAAEAAQAAADMwi6IMKQORfjdOe82p4wGccc4CEuQradylesojEMBgsUc2G7sDX3lQGBMLAJibufbSlKAAAh+QQJCgAAACwAAAAAEAAQAAADMgi63P7wCRHZnFVdmgHu2nFwlWCI3WGc3TSWhUFGxTAUkGCbtgENBMJAEJsxgMLWzpEAACH5BAkKAAAALAAAAAAQABAAAAMyCLrc/jDKSatlQtScKdceCAjDII7HcQ4EMTCpyrCuUBjCYRgHVtqlAiB1YhiCnlsRkAAAOwAAAAAAAAAAAA==\" ng-show=\"message.spinner\" style=\"position:relative;top:2px;\" width=\"12\"></img> {{message.text}}</span>\r\n  </div>\r\n</div>");
$templateCache.put("components/footer/footer.html","<!-- Footer -->\r\n<nav class=\"navbar navbar-inverse navbar-fixed-bottom ga-footer\" role=\"navigation\" explorer-footer>\r\n    <div class=\"container-fluid\">\r\n        <div class=\"navbar-header\">\r\n            <button type=\"button\" class=\"navbar-toggle\" data-toggle=\"collapse\"\r\n                    data-target=\"#bs-example-navbar-collapse-1\">\r\n                <span class=\"sr-only\">Toggle footer</span>\r\n                <span class=\"icon-bar\"></span>\r\n                <span class=\"icon-bar\"></span>\r\n                <span class=\"icon-bar\"></span>\r\n            </button>\r\n        </div>\r\n        <div class=\"navbar-nobrand\">\r\n            <div class=\"collapse navbar-collapse\" id=\"bs-example-navbar-collapse-1\">\r\n                <ul class=\"nav navbar-nav\">\r\n                    <li><a href=\"http://creativecommons.org/licenses/by/3.0/au/deed.en\" target=\"_blank\"><img src=\"data:image/png;base64,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\" height=\"20px\" alt=\"CC BY 3.0 AU\"></img></a></li>\r\n                    <li><a href=\"http://www.ga.gov.au/copyright\" target=\"_blank\">Copyright</a></li>\r\n                    <li><a href=\"http://www.ga.gov.au/disclaimer\" target=\"_blank\">Disclaimer</a></li>\r\n                    <li><a href=\"http://www.ga.gov.au/privacy\" target=\"_blank\">Privacy</a></li>\r\n                    <li><a href=\"http://www.ga.gov.au/accessibility\" target=\"_blank\">Accessibility</a></li>\r\n                    <li><a href=\"http://www.ga.gov.au/ips\" target=\"_blank\">Information Publication Scheme</a></li>\r\n                    <li><a href=\"http://www.ga.gov.au/ips/foi\" target=\"_blank\">Freedom of Information</a></li>\r\n                    <li class=\"contact\"><a href=\"http://www.ga.gov.au/contact-us\" target=\"_blank\">Contact us</a> </li>\r\n                </ul>\r\n            </div>\r\n        </div>\r\n    </div>\r\n</nav>");
$templateCache.put("components/graph/lineGraph.html","<div class=\"lineGraphContainer\" style=\"width:100%; position:relative\"> \r\n	<img src=\"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAGQAAAAKCAIAAADNfmwpAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAAAsSURBVEhL7dAxAQAwEAOh+jedWvjbQQJvnMkKZAWyAlmBrEBWICuQFcg62z7kl6zuJtr7XQAAAABJRU5ErkJggg==\" style=\"width:100%;\" class=\"aspect10x1\"></img>\r\n	<div style=\"position: absolute;	top: 0px; left: 0px; height: 100%;width:100%\" >\r\n		<svg class=\"lineGraphSvg\" preserveAspectRatio=\"xMinYMin meet\" xmlns=\"http://www.w3.org/2000/svg\" version=\"1.1\" width=\"100%\" height=\"100%\" viewBox=\"0 0 1050 105\" \r\n					ng-mouseenter=\"mouseEnter($event)\" ng-mouseleave=\"mouseLeave($event)\" ng-mousemove=\"mouseMove($event)\" ng-click=\"mouseClick($event)\">\r\n			<g>\r\n				<text y=\"16\" x=\"57\" style=\"fill-opacity:0.6; font-size:120%\">{{config.heading}}</text>\r\n			</g>\r\n  			<g transform=\"translate(0, 2)\">\r\n  				<g class=\"zeroLine\" ng-show=\"showZeroLine && minY < 0\">\r\n					<line x1=\"50\" ng-attr-y1=\"{{90 * (1 + minY/rangeY)}}\" x2=\"1050\" ng-attr-y2=\"{{90 * (1 + minY/rangeY)}}\" style=\"stroke:blue\" stroke-width=\"1\" stroke-opacity=\"0.6\" />\r\n				</g>\r\n  				<g ng-repeat=\"points in data\" class=\"context\" style=\"cursor:pointer\" transform=\"translate(50)\" explorer-line>\r\n					<path ng-attr-fill=\"{{points.style.fill}}\" class=\"area\" ng-attr-d=\"{{path}}\" ng-attr-fill-opacity=\"{{points.style.fillOpacity}}\"></path>\r\n					<path ng-attr-d=\"{{line}}\" ng-attr-stroke=\"{{points.style.stroke}}\" ng-attr-stroke-width=\"{{points.style.strokeWidth}}\" fill-opacity=\"0\"></path> \r\n				</g>\r\n  				<g class=\"xAxis\">\r\n					<line x1=\"50\" y1=\"90\" x2=\"1050\" y2=\"90\" style=\"stroke:black\" />\r\n					<text transform=\"translate(1040 88)\" y=\"4\" dy=\".71em\" style=\"text-anchor:end\">{{config.xLabel}}</text>\r\n				</g>\r\n				<g class=\"yAxis\">\r\n					<line x1=\"50\" y1=\"0\" x2=\"50\" y2=\"90\" style=\"stroke:black\" />\r\n					<text transform=\"rotate(-90) translate(-10)\" y=\"6\" dy=\".71em\" style=\"text-anchor:end\">{{config.yLabel}}</text>\r\n					<g ng-repeat=\"tick in yTicks\">\r\n						<text font-size=\"80%\" style=\"text-anchor:end;\" ng-attr-transform=\"translate(45 {{90 * (1 - (tick - minY)/ rangeY) + 4}})\">{{round(tick)}}</text>\r\n						<line x1=\"45\" x2=\"50\" ng-attr-y1=\"{{90 * (1 - (tick - minY)/ rangeY)}}\" ng-attr-y2=\"{{90 * (1 - (tick - minY)/ rangeY)}}\" style=\"stroke:black\"></line>\r\n					</g>\r\n				</g>\r\n				<g visibility=\"visible\" ng-show=\"position\">\r\n					<line x1=\"{{50 + position.graphX}}\" y1=\"-5\" x2=\"{{50 + position.graphX}}\" y2=\"95\" style=\"stroke:black\" />\r\n  				</g>\r\n  			</g>\r\n  			<g transform=\"translate(0 88)\">\r\n				<text y=\"6\" dy=\".71em\" transform=\"translate(50)\">{{config.leftText}}</text>\r\n				<text y=\"6\" dy=\".71em\" transform=\"translate(250)\">{{config.middleText}}</text>\r\n  			</g>\r\n		</svg>\r\n	</div>\r\n</div>");
$templateCache.put("components/header/header.html","<div class=\"container-full\" style=\"padding-right:10px; padding-left:10px\">\r\n    <div class=\"navbar-header\">\r\n\r\n        <button type=\"button\" class=\"navbar-toggle\" data-toggle=\"collapse\" data-target=\".ga-header-collapse\">\r\n            <span class=\"sr-only\">Toggle navigation</span>\r\n            <span class=\"icon-bar\"></span>\r\n            <span class=\"icon-bar\"></span>\r\n            <span class=\"icon-bar\"></span>\r\n        </button>\r\n\r\n        <a href=\"http://www.ga.gov.au\" class=\"hidden-xs\"><img src=\"data:image/png;base64,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\" alt=\"Australian Government - Geoscience Australia\" class=\"logo\"></img></a>\r\n        <a href=\"http://www.ga.gov.au\" class=\"visible-xs\"><img src=\"data:image/png;base64,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\" alt=\"Australian Government - Geoscience Australia\" class=\"logo-stacked\"></img></a>\r\n        <a href=\"#/\" class=\"appTitle visible-xs\"><h1 style=\"font-size:120%\">{{heading}}</h1></a>\r\n    </div>\r\n    <div class=\"navbar-collapse collapse ga-header-collapse\">\r\n        <ul class=\"nav navbar-nav\">\r\n            <li class=\"hidden-xs\"><a href=\"#/\"><h1 class=\"applicationTitle\">{{heading}}</h1></a></li>\r\n        </ul>\r\n        <ul class=\"nav navbar-nav navbar-right\">				\r\n        	<li mars-user-details ng-show=\"username\" role=\"menuitem\" style=\"padding-right:10px\"></li>\r\n			<li mars-version-display role=\"menuitem\"></li>\r\n			<li style=\"width:10px\"></li>\r\n        </ul>\r\n        <div class=\"breadcrumbsContainer hidden-xs\">\r\n            <ul class=\"breadcrumbs\">\r\n                <li class=\"first\"><a href=\"/\">Home</a></li>\r\n                <li ng-class=\"{last:$last}\" ng-repeat=\"crumb in breadcrumbs\"><a href=\"{{crumb.url}}\" title=\"{{crumb.title}}\" >{{crumb.name}}</a></li>\r\n            </ul>\r\n        </div>\r\n    </div><!--/.nav-collapse -->\r\n</div>\r\n\r\n<!-- Strap -->\r\n<div class=\"row\">\r\n    <div class=\"col-md-12\">\r\n        <div class=\"strap-blue\">\r\n        </div>\r\n        <div class=\"strap-white\">\r\n        </div>\r\n        <div class=\"strap-red\">\r\n        </div>\r\n    </div>\r\n</div>\r\n");
$templateCache.put("components/header/loginheader.html","<div class=\"container-full\" style=\"padding-right:10px; padding-left:10px\">\r\n    <div class=\"navbar-header\">\r\n\r\n        <button type=\"button\" class=\"navbar-toggle\" data-toggle=\"collapse\" data-target=\".ga-header-collapse\">\r\n            <span class=\"sr-only\">Toggle navigation</span>\r\n            <span class=\"icon-bar\"></span>\r\n            <span class=\"icon-bar\"></span>\r\n            <span class=\"icon-bar\"></span>\r\n        </button>\r\n        <a href=\"http://www.ga.gov.au\" class=\"hidden-xs\"><img src=\"data:image/png;base64,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\" alt=\"Australian Government - Geoscience Australia\" class=\"logo\"></img></a>\r\n        <a href=\"http://www.ga.gov.au\" class=\"visible-xs\"><img src=\"data:image/png;base64,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\" alt=\"Australian Government - Geoscience Australia\" class=\"logo-stacked\"></img></a>\r\n        <a href=\"#/\" class=\"appTitle visible-xs\"><h1 style=\"font-size:120%\">{{heading}}</h1></a>\r\n    </div>\r\n    <div class=\"navbar-collapse collapse ga-header-collapse\">\r\n        <ul class=\"nav navbar-nav\">\r\n            <li class=\"hidden-xs\"><a href=\"#/\"><h1 class=\"applicationTitle\">{{heading}}</h1></a></li>\r\n        </ul>\r\n        <ul class=\"nav navbar-nav navbar-right\">				\r\n        	<li exp-web-user-details ng-show=\"username\" role=\"menuitem\" style=\"padding-right:10px\"></li>				\r\n        	<li exp-web-login ng-hide=\"username\" role=\"menuitem\" style=\"padding-right:10px\"></li>\r\n			<li mars-version-display role=\"menuitem\"></li>\r\n        </ul>\r\n        <div class=\"breadcrumbsContainer hidden-xs\">\r\n            <ul class=\"breadcrumbs\">\r\n                <li class=\"first\"><a href=\"/\">Home</a></li>\r\n                <li ng-class=\"{last:$last}\" ng-repeat=\"crumb in breadcrumbs\"><a href=\"{{crumb.url}}\" title=\"{{crumb.title}}\" >{{crumb.name}}</a></li>\r\n            </ul>\r\n        </div>\r\n    </div><!--/.nav-collapse -->\r\n</div>\r\n\r\n<!-- Strap -->\r\n<div class=\"row\">\r\n    <div class=\"col-md-12\">\r\n        <div class=\"strap-blue\">\r\n        </div>\r\n        <div class=\"strap-white\">\r\n        </div>\r\n        <div class=\"strap-red\">\r\n        </div>\r\n    </div>\r\n</div>\r\n");
$templateCache.put("components/info/info.html","<div class=\"marsinfo\" ng-show=\"isOpen\">\r\n	<div class=\"marsinfo-inner\">\r\n      <h3 ng-show=\"title\" class=\"marsinfo-title\">\r\n		  	<span  ng-bind=\"title\"></span>\r\n		  	<span ng-show=\"showClose\" class=\"pull-right\">\r\n		 		<button type=\"button\" class=\"undecorated\" ng-click=\"isOpen = false\"><i class=\"fa fa-close\"></i></button>\r\n			</span>\r\n		</h3>\r\n      <div class=\"marsinfo-content\" ng-transclude></div>\r\n	</div>\r\n</div>");
$templateCache.put("components/knob/knob.html","<input class=\"preset1\" type=\"range\" tabindex=\"-1\" style=\"position: absolute; top: -10000px;\" knob-handler>\r\n<svg version=\"1.1\" xmlns=\"http://www.w3.org/2000/svg\"  width=\"100%\" height=\"100%\" class=\"knob\" viewbox=\"0 0 200 200\" ng-attr-style=\"{{checkDisabled()}}\">\r\n	<defs>\r\n   		<filter id=\"{{knobShadow}}\" height=\"150%\" width=\"150%\">\r\n       		<feGaussianBlur in=\"SourceAlpha\" stdDeviation=\"2\"/>\r\n   	    	<feOffset dx=\"0\" dy=\"3\" result=\"offsetblur\"/>\r\n        	<feMerge>\r\n	   	        <feMergeNode/>\r\n    	   	    <feMergeNode in=\"SourceGraphic\"/>\r\n	       	</feMerge>\r\n	   	</filter>\r\n	</defs>\r\n	<circle cx=\"100\" cy=\"100\" r=\"60.606061\" ng-attr-style=\"filter:url(#{{knobShadow}});fill:{{config.circleColor}}\"></circle>\r\n	<rect x=\"97\" y=\"39.4\" width=\"6\" height=\"40\" class=\" pointer\" ng-attr-transform=\"rotate({{angle}} 100 100)\" ng-attr-fill={{config.pointerColor}}></rect>\r\n	<g class=\" scale\">\r\n		<text ng-repeat=\"tick in ticks\" x=\"95\" y=\"23.8\" width=\"10\" height=\"10\" \r\n				ng-attr-transform=\"rotate({{config.startAngle + $index * config.degrees + 3}} 100 100)\" style=\"text-anchor:middle\">{{tick}}</text>\r\n	</g>\r\n	<g>\r\n		<text y=\"175\" dy=\".71em\" x=\"100\" style=\"text-anchor:middle; font-weight:bold\">{{config.label}}</text>\r\n	</g>\r\n</svg>");
$templateCache.put("components/legend/legend.html","<div>    \r\n    <div class=\"modal-header\" drag-parent parentClass=\"legendContainer\">\r\n        <h4 class=\"modal-title\">{{heading}}</h4>\r\n    </div>\r\n	<div class=\"legendImageContainer\" style=\"max-height:450px;overflow-y:auto; overflow-x:hidden;padding-bottom:5px\"> \r\n		<img ng-src=\"{{legend}}\"></img>\r\n	</div>\r\n</div>\r\n");
$templateCache.put("components/login/login.html","<span class=\"badge\" title=\"Click to login\"><button class=\"undecorated\" ng-click=\"login()\">Login...</button></span>");
$templateCache.put("components/message/messages.html","\r\n<span ng-controller=\"MessageController\" style=\"z-index:3\">\r\n  <span ng-show=\"historic.length > 10000\">\r\n    <a href=\"javascript:;\" title=\"Show recent messages\"><i class=\"fa fa-comments-o\" style=\"color:black\"></i></a>\r\n  </span>\r\n  <div ng-show=\"message\" class=\"alert\" role=\"alert\" \r\n  		ng-class=\'{\"alert-success\":(message.type==\"success\"),\"alert-info\":(message.type==\"info\"),\"alert-warning\":(message.type==\"warn\"),\"alert-danger\":(message.type==\"error\")}\'>\r\n    {{message.text}} <a href=\"javascript:;\" ng-click=\"removeMessage()\"><i class=\"fa fa-times-circle\" style=\"font-size:120%\"></i></a>\r\n  </div>\r\n</div>");
$templateCache.put("components/modal/modal.html","<div class=\"exp-modal-outer\">\r\n	<div class=\"exp-backdrop fade  in\" ng-show=\"isModal && isOpen\" \r\n		ng-class=\"{in: animate}\"></div>\r\n	<div class=\"exp-modal\" ng-show=\"isOpen\" exp-modal-up>\r\n		<div class=\"exp-modal-inner\">\r\n    	  <div drag-parent parentClass=\"exp-modal-outer\" class=\"exp-modal-title\" ng-show=\"title\">\r\n      		<i class=\"fa\" ng-class=\"iconClass\"></i> \r\n      		<span ng-bind=\"title\"></span>\r\n      		<button title=\"Close popup dialog\" ng-click=\"isOpen=false\" class=\"exp-modal-close\" type=\"button\"><i class=\"fa fa-close\"></i></button> \r\n	      </div>      \r\n    	  <div class=\"exp-modal-content\" style=\"{{containerStyle}}\" ng-class=\"{\'exp-modal-no-title\':!title}\" ng-transclude></div>\r\n		</div>\r\n	</div>\r\n</div>");
$templateCache.put("components/popover/popover.html","<div class=\"popover {{direction}}\" ng-class=\"containerClass\" ng-show=\"show\">\r\n  <div class=\"arrow\"></div>\r\n  <div class=\"popover-inner\" ng-transclude></div>\r\n</div>");
$templateCache.put("components/user/userdetails.html","<span class=\"badge\" title=\"Your are logged in\">Logon: {{username}}</span>");
$templateCache.put("components/user/userlogindetails.html","<span class=\"badge\" title=\"You are logged in\">\r\n	Logon: {{username}}\r\n	<button class=\"undecorated\" ng-click=\"logout()\" style=\"padding-left:10px\" title=\"Click to logout\">\r\n		<i class=\"fa fa-close fa-lg\"></i>\r\n	</button>\r\n</span>");
$templateCache.put("components/version/versionDisplay.html","<span class=\"badge\">Version: {{version}}</span>\r\n");}]);