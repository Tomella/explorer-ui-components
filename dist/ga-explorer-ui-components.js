/*!
 * Copyright 2015 Geoscience Australia (http://www.ga.gov.au/copyright.html)
 */

(function(angular) {

'use strict';

angular.module('explorer.assets', ['explorer.projects'])

.factory('assetsService', ['$log', '$http', '$q', 'projectsService', '$timeout', function($log, $http, $q, projectsService, $timeout) {
	var assets,
	promises = [],
	baseUrl = "service/asset/assets/",
	sessionTime = Date.now();
	
	function afterProject(project) {
		
		// piggyback off explorer assets
		project = "Explorer";
		
		$log.debug(baseUrl + encodeURIComponent(project));
		
		$http.get(baseUrl + project + "?t=" + sessionTime, {cache:true}).success(function(response) {
			assets = response;
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
	
	this.$get = ['$log', '$http', '$q', '$timeout', function($log, $http, $q, $timeout) {
		// Get the polling running
		timeout = $timeout(checkStatus, pollRate == "slow"?slowPoll:fastPoll);
		function checkStatus(){
			$http({
				url: statusEndpoint, 
				method : "post",
				headers : {
					"Content-Type" : 'application/x-www-form-urlencoded'
				},
				data : encodeParameters(namedParameters)
			}).then(function(response) {
				var messages = response.data?(response.data.messages?response.data.messages:[]):[];
				
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
				
			$http({
				url: endpoint,
				method : "post",
				headers : headers,
				data : postData
			}).then(function(response) {
					var headers = response.headers();
					
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
		now = Date.now() % 10000000;
	
	this.location = function(where) {
		baseUrl = where;
	};
	
	this.dynamicLocation = function(where) {
		dynamicConfigUrl = where;
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
						httpData.get(baseUrl, {cache:true}).then(function(config) {
							// Anon users don't have an id or version yet.
							if(!config.clientSessionId || !config.version) {
								httpData.get(dynamicConfigUrl + Date.now()).then(function(data) {
									config.clientSessionId = data.clientSessionId;
									config.version = data.version;
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

.factory('indicatorService', ['$log', '$q', '$http', '$rootScope', 'projectsService', 'assetsService', function($log, $q, $http, $rootScope, projectsService, assetsService) {
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
				
				// piggyback off explorer assets
				project = "Explorer";

				$http.post(url, {
						wkt:extents,
						md5:md5,
						project:project
				}).success(function (data, status) {
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

.run(["$templateCache", function($templateCache) {
	  $templateCache.put("components/footer/footer.html",
		'<nav class="navbar navbar-inverse navbar-fixed-bottom ga-footer" role="navigation" explorer-footer>' +
		'  <div class="container-fluid">' +
		'    <div class="navbar-header">' +
		'      <button type="button" class="navbar-toggle" data-toggle="collapse"' +
		'            data-target="#bs-example-navbar-collapse-1">' +
		'        <span class="sr-only">Toggle footer</span>' +
		'        <span class="icon-bar"></span>' +
		'        <span class="icon-bar"></span>' +
		'        <span class="icon-bar"></span>' +
		'      </button>' +
		'    </div>' +
		'    <div class="navbar-nobrand">' +
		'      <div class="collapse navbar-collapse" id="bs-example-navbar-collapse-1">' +
		'        <ul class="nav navbar-nav">' +
		'          <li><a href="http://creativecommons.org/licenses/by/3.0/au/deed.en"><img' +
		'               src="assets/img/cc-by.png" height="20px" alt="CC BY 3.0 AU"/></a></li>' +
		'          <li><a href="http://www.ga.gov.au/copyright">Copyright</a></li>' +
		'          <li><a href="http://www.ga.gov.au/disclaimer">Disclaimer</a></li>' +
		'          <li><a href="http://www.ga.gov.au/privacy">Privacy</a></li>' +
		'          <li><a href="http://www.ga.gov.au/accessibility">Accessibility</a></li>' +
		'          <li><a href="http://www.ga.gov.au/ips">Information Publication Scheme</a></li>' +
		'          <li><a href="http://www.ga.gov.au/ips/foi">Freedom of Information</a></li>' +
		'          <li class="contact"><a href="http://www.ga.gov.au/contact-us" target="_blank">Contact us</a></li>' +
		'        </ul>' +
		'      </div>' +
		'    </div>' +
		'  </div>' +
		'</nav>');
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

.directive("explorerGraph", ['$log', function($log) {
	var WIDTH = 1000,
	HEIGHT = 90;

	return {
		templateUrl : "components/graph/lineGraph.html?v=1",
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
						$log.debug(key);
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
				$log.debug(data.length);
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
					
					return d3.range(min - Math.abs(min % step) + step, max + (step - Math.abs(max % step)), step);			
				}
			}
		}
	};	
}])

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
		templateUrl:"components/header/header.html?v=1",
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
(function(angular) {

'use strict';

angular.module("explorer.httpdata", [])

.factory('httpData', ['$http', '$q', function($http, $q){
	// Just a convenience wrapper around $http
	return {
		get : function(url, options) {
			return this._method("get", url, options);
		},
		
		post : function(url, options) {
			return this._method("post", url, options);
		},
		
		put : function(url, options) {
			return this._method("put", url, options);
		},
		
		_method : function(method, url, options) {
			var deferred = $q.defer();
			$http[method](url, options).then(function(response){
					if(!response) {
						deferred.resolve(null);
					} else {
						deferred.resolve(response.data);
					}
				},
				function(err) {
					deferred.reject(err);
				}
			);
			return deferred.promise;			
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
	    	isOpen: '='
	    },
	    templateUrl: 'components/info/info.html?v=1',
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
(function(angular) {

'use strict';

angular.module("explorer.message", [])

.directive('explorerMessages', ['messageService', function(messageService) {
	return {
		restrict:'AE',
		controller : 'MessageController',
		templateUrl : 'components/message/messages.html?v=1',
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
			var deferred = $q.defer();
			if(angular.isString()) {
				try {
					JSON.parse(obj);
				} catch(e) {
					obj = '"' + obj + '"';
				}
			}
			httpData.post("service/state/item/" + project + "/" + key, obj).then(function(response) {
				deferred.resolve(response);
			});
			return deferred.promise;
		},
		
		retrieve : function(project, key) {
			return httpData.get("service/state/item/" + project + "/" + key);
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
	
	this.$get = ['$http', '$timeout', function pingServiceFactory($http, $timeout) {
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
				$http.post(url);
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

	this.$get =  ['$q', '$timeout', '$http', function ($q, $timeout, $http) {
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
				$http.get(baseUrl + (new Date()).getTime()).then((function(response) {
					this.projects = response;
					deferred.resolve(this.projects);
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

.factory("splashService", ['$http', '$q', 'projectsService', function($http, $q, projectsService) {
	var VIEWED_SPLASH_KEY = "nedf.accepted.terms",
		releaseNotesUrl = "service/releaseNotes/";
		
	return {
		getReleaseNotes : function() {
			var deferred = $q.defer();
			projectsService.getCurrentProject().then(function(project) {
				$http({
					method : "GET",
					url : releaseNotesUrl + project + "?t=" + Date.now()
				}).then(function(result) {
					deferred.resolve(result.data);
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
(function($, angular) {

'use strict';

angular.module('mars.splitter', [])

.directive('marsExpand', ['$rootScope', '$timeout', function($rootScope, $timeout) {
	return {
		link : function(scope, element, attrs) {			
			var expand = function() {
				// An ugly little pane opener. You'd think they'd have a method to call.
				var splitter = $("#horizontal").data("kendoSplitter");
				if(scope.marsRightView == attrs.marsExpand) {
					splitter.collapse(".mainSplitterRight");
					scope.marsRightView = null;
				} else {
					splitter.expand(".mainSplitterRight");
					scope.marsRightView = attrs.marsExpand;				
					$rootScope.$broadcast("show.right.panel", attrs.marsExpand);
				}
			};
			
			element.on("click", function() {
				$timeout.cancel(scope.marsRightExpandTimeout);
				expand();
			});
			element.on("mouseenter", function(event) {
				scope.marsRightExpandTimeout = $timeout(expand, 400);
			});
			element.on("mouseleave", function() {
				$timeout.cancel(scope.marsRightExpandTimeout);
			});		
			
			$rootScope.$on("right.tab.deselected", function() {
				$timeout(function() {
					$("#horizontal").data("kendoSplitter").collapse(".mainSplitterRight");
					scope.marsRightView = null;
				});
			});
		}
	};
}])

.directive('marsSplitter', ['$rootScope', '$timeout', 'mapService', function($rootScope, $timeout, mapService) {
	return {
		link : function(scope, element, attrs) {
			var self = this;
			mapService.getMap().then(function(map) {
				this.map = map;
			}.bind(this));
			element.kendoSplitter({
				panes : [
					{
						collapsible : false
					},
					{
						collapsible : true,
						collapsed : true,
						size : "360px"
					}
				],
				resize : function(event) {
					setTimeout(function() {
						var widthRight = element.find(".rightPane").width() + 7;
						$(".marsExpandContainer").css("right", widthRight + "px");
						
						// Workaround for kendo not re-sizing stuff properly once the splitter is dragged.
						//event.sender.element.height("").css("height", "100%").find("> div").height("").css("height", "100%");
						// self.map && self.map.updateSize();
					}, 0);
				}
			});

			$rootScope.$on("vertical.tab.deselected", function() {
				$timeout(function() {
					element.data("kendoSplitter").collapse(".rightPane");
				});
			});
			
		}
	};
}])

.controller('MapSlideController', ['$scope', '$rootScope', '$timeout', function($scope, $rootScope, $timeout) {	
	$scope.controller = "MapSlideController";
	$scope.scrollTop = 0;
	$scope.filterNames = {
		point:true,
		line:true,
		area:true,
		network:true
	};
	
	$scope.cancelHide = function() {
		$timeout.cancel($scope.hideTimeout);
	};
	
	$scope.delayedRightHide = function() {
		if(!$scope.pinnedRight) {
			$scope.hideRightTimeout = $timeout(function() {
				$scope.lastView = "";
				$rootScope.$broadcast('right.tab.deselected');
			}, 3000);
		}
	};
	
	$scope.cancelRightHide = function() {
		$timeout.cancel($scope.hideRightTimeout);
	};
	
	$scope.show = function(what) {
		$timeout.cancel($scope.showTimeout);
		if(what == $scope.lastView) {
			$scope.showTimeout = $timeout(function() {
				$scope.lastView = "";
				$rootScope.$broadcast('vertical.tab.deselected');
			},400);
		} else {
			$timeout(function() {
				$scope.lastView = what;
				$rootScope.$broadcast('vertical.tab.selected', what);
			}, 400);
		}
	};	
		
	$scope.$on("pinned.right.changed", function(event, value) {
		$scope.pinnedRight = value;
	});
	
	$scope.$on("pinned.left.changed", function(event, value) {
		$scope.pinnedLeft = value;
	});

		
	$scope.toggleShow = function(element) {
		if(!element) {
			element = this.feature;
		}
		element.displayed = element.handleShow();
	};
	
	$scope.viewLegend = function(feature) {
		//console.log(feature);
	};
}]);

})($, angular);
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
angular.module("exp.ui.templates", []).run(["$templateCache", function($templateCache) {$templateCache.put("components/confirm/confirm.html","<div class=\"modal-header\">\r\n   <h3 class=\"modal-title\" style=\"font-weight:bolder\">Confirm</h3>\r\n</div>\r\n<div class=\"modal-body\" id=\"accept\" style=\"width: 100%; margin-left: auto; margin-right: auto;\">\r\n	<div>\r\n		{{message}}\r\n	</div>	\r\n	<div style=\"text-align: right;padding-top:10px\">\r\n		<button type=\"button\" class=\"btn btn-default\" style=\"width:4em\" ng-click=\"accept()\" focus-me=\"true\">OK</button>\r\n		<button type=\"button\" class=\"btn btn-default\" style=\"width:4em\" ng-click=\"reject()\">Cancel</button>\r\n	</div>\r\n</div>");
$templateCache.put("components/flasher/flash.html","<div class=\"fred marsFlash\" ng-show=\"messages.items.length > 0\">\r\n  <div ng-repeat=\"message in messages.items\">\r\n     <span><img alt=\"Waiting...\" src=\"resources/img/tinyloader.gif\" ng-show=\"message.spinner\" style=\"position:relative;top:2px;\" width=\"12\"></img> {{message.text}}</span>\r\n  </div>\r\n</div>");
$templateCache.put("components/footer/footer.html","<!-- Footer -->\r\n<nav class=\"navbar navbar-inverse navbar-fixed-bottom ga-footer\" role=\"navigation\" mars-footer>\r\n    <div class=\"container-fluid\">\r\n        <div class=\"navbar-header\">\r\n            <button type=\"button\" class=\"navbar-toggle\" data-toggle=\"collapse\"\r\n                    data-target=\"#bs-example-navbar-collapse-1\">\r\n                <span class=\"sr-only\">Toggle footer</span>\r\n                <span class=\"icon-bar\"></span>\r\n                <span class=\"icon-bar\"></span>\r\n                <span class=\"icon-bar\"></span>\r\n            </button>\r\n        </div>\r\n        <div class=\"navbar-nobrand\">\r\n            <div class=\"collapse navbar-collapse\" id=\"bs-example-navbar-collapse-1\">\r\n                <ul class=\"nav navbar-nav\">\r\n                    <li><a href=\"http://creativecommons.org/licenses/by/3.0/au/deed.en\"><img src=\"data:image/png;base64,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\" height=\"20px\" alt=\"CC BY 3.0 AU\"></img></a></li>\r\n                    <li><a href=\"http://www.ga.gov.au/copyright\">Copyright</a></li>\r\n                    <li><a href=\"http://www.ga.gov.au/disclaimer\">Disclaimer</a></li>\r\n                    <li><a href=\"http://www.ga.gov.au/privacy\">Privacy</a></li>\r\n                    <li><a href=\"http://www.ga.gov.au/accessibility\">Accessibility</a></li>\r\n                    <li><a href=\"http://www.ga.gov.au/ips\">Information Publication Scheme</a></li>\r\n                    <li><a href=\"http://www.ga.gov.au/ips/foi\">Freedom of Information</a></li>\r\n                    <li class=\"contact\"><a href=\"http://www.ga.gov.au/contact-us\" target=\"_blank\">Contact us</a> </li>\r\n                </ul>\r\n            </div>\r\n        </div>\r\n    </div>\r\n</nav>");
$templateCache.put("components/graph/lineGraph.html","<div class=\"lineGraphContainer\" style=\"width:100%; position:relative\"> \r\n	<img src=\"resources/img/aspect_10x1.png\" style=\"width:100%;\" class=\"aspect10x1\"></img>\r\n	<div style=\"position: absolute;	top: 0px; left: 0px; height: 100%;width:100%\" >\r\n		<svg class=\"lineGraphSvg\" preserveAspectRatio=\"xMinYMin meet\" xmlns=\"http://www.w3.org/2000/svg\" version=\"1.1\" width=\"100%\" height=\"100%\" viewBox=\"0 0 1050 105\" \r\n					ng-mouseenter=\"mouseEnter($event)\" ng-mouseleave=\"mouseLeave($event)\" ng-mousemove=\"mouseMove($event)\" ng-click=\"mouseClick($event)\">\r\n			<g>\r\n				<text y=\"16\" x=\"57\" style=\"fill-opacity:0.6; font-size:120%\">{{config.heading}}</text>\r\n			</g>\r\n  			<g transform=\"translate(0, 2)\">\r\n  				<g class=\"zeroLine\" ng-show=\"showZeroLine && minY < 0\">\r\n					<line x1=\"50\" ng-attr-y1=\"{{90 * (1 + minY/rangeY)}}\" x2=\"1050\" ng-attr-y2=\"{{90 * (1 + minY/rangeY)}}\" style=\"stroke:blue\" stroke-width=\"1\" stroke-opacity=\"0.6\" />\r\n				</g>\r\n  				<g ng-repeat=\"points in data\" class=\"context\" style=\"cursor:pointer\" transform=\"translate(50)\" explorer-line>\r\n					<path ng-attr-fill=\"{{points.style.fill}}\" class=\"area\" ng-attr-d=\"{{path}}\" ng-attr-fill-opacity=\"{{points.style.fillOpacity}}\"></path>\r\n					<path ng-attr-d=\"{{line}}\" ng-attr-stroke=\"{{points.style.stroke}}\" ng-attr-stroke-width=\"{{points.style.strokeWidth}}\" fill-opacity=\"0\"></path> \r\n				</g>\r\n  				<g class=\"xAxis\">\r\n					<line x1=\"50\" y1=\"90\" x2=\"1050\" y2=\"90\" style=\"stroke:black\" />\r\n					<text transform=\"translate(1040 88)\" y=\"4\" dy=\".71em\" style=\"text-anchor:end\">{{config.xLabel}}</text>\r\n				</g>\r\n				<g class=\"yAxis\">\r\n					<line x1=\"50\" y1=\"0\" x2=\"50\" y2=\"90\" style=\"stroke:black\" />\r\n					<text transform=\"rotate(-90) translate(-10)\" y=\"6\" dy=\".71em\" style=\"text-anchor:end\">{{config.yLabel}}</text>\r\n					<g ng-repeat=\"tick in yTicks\">\r\n						<text font-size=\"80%\" style=\"text-anchor:end;\" ng-attr-transform=\"translate(45 {{90 * (1 - (tick - minY)/ rangeY) +3}})\">{{round(tick)}}</text>\r\n						<line x1=\"45\" x2=\"50\" ng-attr-y1=\"{{90 * (1 - (tick - minY)/ rangeY)}}\" ng-attr-y2=\"{{90 * (1 - (tick - minY)/ rangeY)}}\" style=\"stroke:black\"></line>\r\n					</g>\r\n				</g>\r\n				<g visibility=\"visible\" ng-show=\"position\">\r\n					<line x1=\"{{50 + position.graphX}}\" y1=\"-5\" x2=\"{{50 + position.graphX}}\" y2=\"95\" style=\"stroke:black\" />\r\n  				</g>\r\n  			</g>\r\n  			<g transform=\"translate(0 88)\">\r\n				<text y=\"6\" dy=\".71em\" transform=\"translate(50)\">{{config.leftText}}</text>\r\n				<text y=\"6\" dy=\".71em\" transform=\"translate(250)\">{{config.middleText}}</text>\r\n  			</g>\r\n		</svg>\r\n	</div>\r\n</div>");
$templateCache.put("components/header/header.html","<div class=\"container-full\" style=\"padding-right:10px; padding-left:10px\">\r\n    <div class=\"navbar-header\">\r\n\r\n        <button type=\"button\" class=\"navbar-toggle\" data-toggle=\"collapse\" data-target=\".ga-header-collapse\">\r\n            <span class=\"sr-only\">Toggle navigation</span>\r\n            <span class=\"icon-bar\"></span>\r\n            <span class=\"icon-bar\"></span>\r\n            <span class=\"icon-bar\"></span>\r\n        </button>\r\n\r\n        <a href=\"http://www.ga.gov.au\" class=\"hidden-xs\"><img src=\"resources/css/images/geoscience_inline_padded_small.png\" alt=\"Australian Government - Geoscience Australia\" class=\"logo\"></img></a>\r\n        <a href=\"http://www.ga.gov.au\" class=\"visible-xs\"><img src=\"resources/css/images/geoscience_stacked_padded_small.png\" alt=\"Australian Government - Geoscience Australia\" class=\"logo-stacked\"></img></a>\r\n        <a href=\"#/\" class=\"appTitle visible-xs\"><h1 style=\"font-size:120%\">{{heading}}</h1></a>\r\n    </div>\r\n    <div class=\"navbar-collapse collapse ga-header-collapse\">\r\n        <ul class=\"nav navbar-nav\">\r\n            <li class=\"hidden-xs\"><a href=\"#/\"><h1 class=\"applicationTitle\">{{heading}}</h1></a></li>\r\n        </ul>\r\n        <ul class=\"nav navbar-nav navbar-right\">				\r\n        	<li mars-user-details ng-show=\"username\" role=\"menuitem\" style=\"padding-right:10px\"></li>\r\n			<li mars-version-display role=\"menuitem\"></li>\r\n			<li style=\"width:10px\"></li>\r\n        </ul>\r\n        <div class=\"breadcrumbsContainer hidden-xs\">\r\n            <ul class=\"breadcrumbs\">\r\n                <li class=\"first\"><a href=\"/\">Home</a></li>\r\n            </ul>\r\n        </div>\r\n    </div><!--/.nav-collapse -->\r\n</div>\r\n\r\n<!-- Strap -->\r\n<div class=\"row\">\r\n    <div class=\"col-md-12\">\r\n        <div class=\"strap-blue\">\r\n        </div>\r\n        <div class=\"strap-white\">\r\n        </div>\r\n        <div class=\"strap-red\">\r\n        </div>\r\n    </div>\r\n</div>\r\n");
$templateCache.put("components/info/info.html","<div class=\"marsinfo\" ng-show=\"isOpen\">\r\n	<div class=\"marsinfo-inner\">\r\n      <h3 ng-show=\"title\" ng-bind=\"title\" class=\"marsinfo-title\"></h3>\r\n      <div class=\"marsinfo-content\" ng-transclude></div>\r\n	</div>\r\n</div>");
$templateCache.put("components/knob/knob.html","<input class=\"preset1\" type=\"range\" tabindex=\"-1\" style=\"position: absolute; top: -10000px;\" knob-handler>\r\n<svg version=\"1.1\" xmlns=\"http://www.w3.org/2000/svg\"  width=\"100%\" height=\"100%\" class=\"knob\" viewbox=\"0 0 200 200\" ng-attr-style=\"{{checkDisabled()}}\">\r\n	<defs>\r\n   		<filter id=\"{{knobShadow}}\" height=\"150%\" width=\"150%\">\r\n       		<feGaussianBlur in=\"SourceAlpha\" stdDeviation=\"2\"/>\r\n   	    	<feOffset dx=\"0\" dy=\"3\" result=\"offsetblur\"/>\r\n        	<feMerge>\r\n	   	        <feMergeNode/>\r\n    	   	    <feMergeNode in=\"SourceGraphic\"/>\r\n	       	</feMerge>\r\n	   	</filter>\r\n	</defs>\r\n	<circle cx=\"100\" cy=\"100\" r=\"60.606061\" ng-attr-style=\"filter:url(#{{knobShadow}});fill:{{config.circleColor}}\"></circle>\r\n	<rect x=\"97\" y=\"39.4\" width=\"6\" height=\"40\" class=\" pointer\" ng-attr-transform=\"rotate({{angle}} 100 100)\" ng-attr-fill={{config.pointerColor}}></rect>\r\n	<g class=\" scale\">\r\n		<text ng-repeat=\"tick in ticks\" x=\"95\" y=\"23.8\" width=\"10\" height=\"10\" \r\n				ng-attr-transform=\"rotate({{config.startAngle + $index * config.degrees + 3}} 100 100)\" style=\"text-anchor:middle\">{{tick}}</text>\r\n	</g>\r\n	<g>\r\n		<text y=\"175\" dy=\".71em\" x=\"100\" style=\"text-anchor:middle; font-weight:bold\">{{config.label}}</text>\r\n	</g>\r\n</svg>");
$templateCache.put("components/legend/legend.html","<div>    \r\n    <div class=\"modal-header\" drag-parent parentClass=\"legendContainer\">\r\n        <h4 class=\"modal-title\">{{heading}}</h4>\r\n    </div>\r\n	<div class=\"legendImageContainer\" style=\"max-height:450px;overflow-y:auto; overflow-x:hidden;padding-bottom:5px\"> \r\n		<img ng-src=\"{{legend}}\"></img>\r\n	</div>\r\n</div>\r\n");
$templateCache.put("components/message/messages.html","\r\n<span ng-controller=\"MessageController\" style=\"z-index:3\">\r\n  <span ng-show=\"historic.length > 10000\">\r\n    <a href=\"javascript:;\" title=\"Show recent messages\"><i class=\"fa fa-comments-o\" style=\"color:black\"></i></a>\r\n  </span>\r\n  <div ng-show=\"message\" class=\"alert\" role=\"alert\" \r\n  		ng-class=\'{\"alert-success\":(message.type==\"success\"),\"alert-info\":(message.type==\"info\"),\"alert-warning\":(message.type==\"warn\"),\"alert-danger\":(message.type==\"error\")}\'>\r\n    {{message.text}} <a href=\"javascript:;\" ng-click=\"removeMessage()\"><i class=\"fa fa-times-circle\" style=\"font-size:120%\"></i></a>\r\n  </div>\r\n</div>");
$templateCache.put("components/modal/modal.html","<div class=\"exp-modal-outer\">\r\n	<div class=\"exp-backdrop fade  in\" ng-show=\"isModal && isOpen\" \r\n		ng-class=\"{in: animate}\"></div>\r\n	<div class=\"exp-modal\" ng-show=\"isOpen\" exp-modal-up>\r\n		<div class=\"exp-modal-inner\">\r\n    	  <div drag-parent parentClass=\"exp-modal-outer\" class=\"exp-modal-title\" ng-show=\"title\">\r\n      		<i class=\"fa\" ng-class=\"iconClass\"></i> \r\n      		<span ng-bind=\"title\"></span>\r\n      		<button title=\"Close popup dialog\" ng-click=\"isOpen=false\" class=\"exp-modal-close\" type=\"button\"><i class=\"fa fa-close\"></i></button> \r\n	      </div>      \r\n    	  <div class=\"exp-modal-content\" style=\"{{containerStyle}}\" ng-class=\"{\'exp-modal-no-title\':!title}\" ng-transclude></div>\r\n		</div>\r\n	</div>\r\n</div>");
$templateCache.put("components/popover/popover.html","<div class=\"popover {{direction}}\" ng-class=\"containerClass\" ng-show=\"show\">\r\n  <div class=\"arrow\"></div>\r\n  <div class=\"popover-inner\" ng-transclude></div>\r\n</div>");
$templateCache.put("components/user/userdetails.html","<span class=\"badge\" title=\"Your are logged in\">Logon: {{username}}</span>");
$templateCache.put("components/usermaps/add-maps.html","<div>\r\n	<div class=\"marsMapsTreeview\">\r\n		\r\n		<p style=\"text-align: left; margin: 10px; font-size: 16px; padding: 40px 5px 0px 0px;\">\r\n			<strong>Your Maps:</strong>\r\n		</p>\r\n		\r\n		<div add-maps></div>\r\n	</div>\r\n	<layer-inspector active=\"active\"></layer-inspector>\r\n</div>");
$templateCache.put("components/usermaps/addmaps.html","<div ng-form>\r\n	<div ng-repeat=\"map in maps | orderBy : \'name\'\" style=\"padding:7px;padding-left:10px;position:relative;height:1.4em\" ng-class-even=\"\'even\'\" ng-class-odd=\"\'active\'\">\r\n		<div style=\"float:left\">\r\n			<a href=\"javascript:;\" class=\"featureLink\" ng-click=\"makeActive()\" ng-class=\"{active:(map == active)}\" >\r\n				{{map.name}} \r\n			</a>\r\n		</div>\r\n		<div style=\"float:right\">\r\n			<a class=\"featureLink\" href=\"javascript:;\" title=\"Show legend for this map\" ng-show=\"map.legendUrl\" heading=\"map.name + \' Legend\'\"\r\n				explorer-legend legend=\"map.legendUrl\"><i class=\"fa fa-list-ul\"></i></a>\r\n			<a class=\"featureLink\" href=\"javascript:;\" title=\"Edit the map\" \r\n				ng-click=\"editMap()\"><i class=\"fa fa-pencil\"></i></a>	\r\n			<a class=\"featureLink\" href=\"javascript:;\" title=\"Show on map\" \r\n				ng-click=\"toggleShow()\"><i class=\"fa\" ng-class=\"{\'fa-eye\':(!map.layer.visibility), \'fa-eye-slash\':map.layer.visibility}\"></i></a>	\r\n			<a href=\"javascript:\" exp-confirm=\"\'Are you sure that you want to delete this map?\'\" success=\"removeMap()\" title=\"Remove map from application. Cannot be undone.\">\r\n				<i class=\"fa fa-remove\" title=\"Remove this feature from your added maps.\"></i>\r\n			</a>						\r\n		</div>\r\n	</div>\r\n	<vectors-display vectors=\"vectors\"></vectors-display>\r\n	\r\n	<accordion>\r\n		<accordion-group heading=\"{{status.edit && \'Edit\' || \'Add\'}} a map...\" is-open=\"status.mapOpen\">\r\n			<div class=\"addMapsDialog\">\r\n				<div>\r\n					<label for=\"addMapsName\">Name</label>\r\n					<input type=\"text\" ng-model=\"work.name\" id=\"addMapsName\" required=\"required\"/>\r\n				</div>\r\n				<div>\r\n					<label for=\"addMapsDescription\">Description</label>\r\n					<input type=\"text\" ng-model=\"work.description\" id=\"addMapsDescription\"/>\r\n				</div>\r\n				<div>\r\n					<label for=\"addMapsUrl\">WMS URL</label>\r\n					<input type=\"text\" ng-model=\"work.url\" id=\"addMapsUrl\" required=\"required\"/>\r\n				</div>\r\n				<div>\r\n					<label for=\"addMapsLayers\">Layers</label>\r\n					<div ng-repeat=\"layer in work.layers | reverse\" ng-class-even=\"\'even\'\" ng-class-odd=\"\'active\'\">\r\n						<div style=\"padding:2px\">\r\n							{{layer}}\r\n							<div style=\"float:right\">\r\n								<a class=\"featureLink\" href=\"javascript:;\" title=\"Move layer higher on map\" ng-disabled=\"$first\"\r\n									ng-click=\"shuffleDown()\"><i class=\"fa fa-arrow-up\"></i></a>	\r\n								<a class=\"featureLink\" href=\"javascript:;\" title=\"Move layer lower on map\" ng-disabled=\"$last\"\r\n									ng-click=\"shuffleUp()\"><i class=\"fa fa-arrow-down\"></i></a>	\r\n								<a href=\"javascript:\" exp-confirm=\"\'Are you sure that you want to delete this map?\'\" success=\"removeLayer()\" title=\"Remove map from application.\">\r\n									<i class=\"fa fa-remove\" title=\"Remove this layer from your added maps.\"></i>\r\n								</a>						\r\n							</div>\r\n						</div>\r\n					</div>\r\n					<input ng-model=\"workLayer\" ng-required=\"work.layers.length == 0\" \r\n							exp-enter=\"addLayer()\" title=\"Hit enter after entering each layer to add the layer\"/>\r\n					<button ng-click=\"addLayer()\" title=\"You can also use the enter key to add layer from the previous input\">Add</button>\r\n				</div>\r\n				<div>\r\n					<label for=\"addMapsThumbnailUrl\">Thumbnail URL</label>\r\n					<input type=\"text\" ng-model=\"work.thumbnailUrl\"/>\r\n				</div>\r\n				<div>\r\n					<label for=\"addMapsLegendUrl\">Legend URL</label>\r\n					<input type=\"text\" ng-model=\"work.legendUrl\"/>\r\n				</div>\r\n			</div>\r\n	\r\n			<div class=\"addMapButtons\">\r\n				<div  class=\"buttons\" style=\"float:right\">\r\n					<button type=\"button\" class=\"btn btn-default\" ng-click=\"clear()\" title=\"Abandon updates\">Cancel</button>\r\n					<button type=\"button\" class=\"btn btn-default\" ng-click=\"addMap($event)\" ng-disabled=\"!isComplete()\" \r\n								title=\"Click to complete updates\">{{status.edit && \'Update\' || \'Add\'}}</button>\r\n				</div>\r\n			</div>\r\n		</accordion-group>\r\n		<accordion-group heading=\"{{status.vectorEdit && \'Edit\' || \'Add\'}} a vector...\" is-open=\"status.vectorOpen\">\r\n			<div mars-vector-edit vectors=\"vectors\">\r\n		</accordion-group>\r\n	</accordion>\r\n</div>");
$templateCache.put("components/usermaps/vectorDisplay.html","<div ng-repeat=\"vector in vectors | orderBy : \'name\'\" style=\"padding:7px;padding-left:10px;position:relative;min-height:1.4em\" ng-class-even=\"\'even\'\" ng-class-odd=\"\'active\'\">\r\n	<div ng-show=\"vector.layer.features.length < 2\" style=\"clear:both\">\r\n		<div style=\"float:left\">\r\n			<a href=\"javascript:;\" class=\"featureLink\" ng-click=\"makeActive()\" ng-class=\"{active:(vector == active)}\" >\r\n				{{vector.name}} \r\n			</a>\r\n		</div>\r\n		<div style=\"float:right\">\r\n			<a class=\"featureLink\" href=\"javascript:;\" title=\"Plot feature\'s elevation\" ng-show=\"isPath()\" \r\n				ng-click=\"showElevation()\"><i class=\"fa fa-align-left fa-rotate-270\"></i></a>\r\n			<a class=\"featureLink\" href=\"javascript:;\" title=\"Edit the vector layer\" \r\n				ng-click=\"vectorEdit()\"><i class=\"fa fa-pencil\"></i></a>\r\n			<a class=\"featureLink\" href=\"javascript:;\" title=\"Show on map\" \r\n				ng-click=\"toggle()\"><i class=\"fa\" ng-class=\"{\'fa-eye\':(!vector.show), \'fa-eye-slash\':vector.show}\"></i></a>\r\n			<a class=\"featureLink\" href=\"javascript:;\" title=\"Pan map to feature\" \r\n				ng-click=\"panToVector()\"><i class=\"fa fa-flag\"></i></a>	\r\n			<a href=\"javascript:\"  title=\"Remove vector layer. Cannot be undone.\"\r\n				exp-confirm=\"\'Are you sure that you want to delete this map?\'\" success=\"remove()\"><i class=\"fa fa-remove\"></i></a>						\r\n		</div>\r\n	</div>\r\n	\r\n	<div ng-show=\"vector.layer.features.length > 1\" style=\"clear:both\">\r\n		<div style=\"float:left\">\r\n			<i class=\"fa fa-caret-right\" ng-class=\"{\'fa-caret-down\':expanded,\'fa-caret-right\':(!expanded)}\" role=\"presentation\" ng-click=\"expanded = !expanded\"></i> <strong>{{vector.name}}</strong>\r\n		</div>\r\n	\r\n		<div style=\"float:right\">\r\n			<a class=\"featureLink\" href=\"javascript:;\" title=\"Edit the vector layer\" \r\n				ng-click=\"vectorEdit()\"><i class=\"fa fa-pencil\"></i></a>\r\n			<a class=\"featureLink\" href=\"javascript:;\" title=\"Show on map\" \r\n				ng-click=\"toggle()\"><i class=\"fa\" ng-class=\"{\'fa-eye\':(!vector.show), \'fa-eye-slash\':vector.show}\"></i></a>\r\n			<a class=\"featureLink\" href=\"javascript:;\" title=\"Pan map to feature\" \r\n				ng-click=\"panToVector()\"><i class=\"fa fa-flag\"></i></a>	\r\n			<a href=\"javascript:\"  title=\"Remove vector layer. Cannot be undone.\"\r\n				exp-confirm=\"\'Are you sure that you want to delete this map?\'\" success=\"remove()\"><i class=\"fa fa-remove\"></i></a>						\r\n		</div>\r\n		\r\n		<div style=\"clear:both\" ng-show=\"expanded\">\r\n			<div ng-repeat=\"feature in vector.layer.features\">\r\n				<div style=\"float:left; padding-left:10px\">\r\n					{{feature.fid ? feature.fid : feature.data.name ? feature.data.name : \'Feature #\' + $index}} \r\n				</div>\r\n				<div style=\"float:right\">\r\n					<a class=\"featureLink\" href=\"javascript:;\" title=\"Plot feature\'s elevation\" ng-show=\"isFeaturePath()\" \r\n						ng-click=\"showFeatureElevation()\"><i class=\"fa fa-align-left fa-rotate-270\"></i></a>\r\n					<a class=\"featureLink\" href=\"javascript:;\" title=\"Pan map to feature\" \r\n						ng-click=\"panToFeature()\"><i class=\"fa fa-flag\"></i></a>			\r\n				</div>\r\n				<div style=\"clear:both\"></div>\r\n			</div>\r\n		</div>\r\n		\r\n	</div>\r\n</div>");
$templateCache.put("components/usermaps/vectorEdit.html","<div class=\"addMapsDialog\" ng-if=\"!status.vectorEdit\">\r\n	<form method=\"POST\" action=\"service/upload/file\" enctype=\"multipart/form-data\" ajax-form update=\"cancelVectorEdit()\" cancel=\"cancelVectorEdit()\">\r\n		<div>\r\n			<label for=\"addVectorName\">Name</label>\r\n			<input type=\"text\" ng-model=\"vector.name\" id=\"addVectorName\" name=\"vectorName\" required=\"required\"/>\r\n			<input type=\"hidden\" name=\"clientSessionId\" value=\"{{localClientSessionId}}\" />\r\n		</div>\r\n		<div>\r\n			<label for=\"addVectorDescription\">Description</label>\r\n			<input type=\"text\" ng-model=\"vector.description\" id=\"addVectorDescription\" name=\"vectorDescription\"/>\r\n		</div>\r\n		<div>\r\n			<label for=\"addVectorFile\">Select file to upload</label>\r\n			<input type=\"file\" name=\"vectorFile\"/>\r\n		</div>\r\n	\r\n		<div class=\"addMapButtons\">\r\n			<div  class=\"buttons\" style=\"float:right\">\r\n				<button type=\"reset\" class=\"btn btn-default\" title=\"Cancel adding vector file\">Cancel</button>\r\n				<button type=\"submit\" class=\"btn btn-default\" title=\"Add  vector file\" value=\"Add Vector File\">Add</button>\r\n			</div>\r\n		</div>\r\n	</form>\r\n</div>\r\n<div class=\"addMapsDialog\" ng-if=\"status.vectorEdit\">\r\n	<div>\r\n		<label for=\"addVectorName\">Name</label>\r\n		<input type=\"text\" ng-model=\"editVector.name\" id=\"addVectorName\" required=\"required\"/>\r\n	</div>\r\n	<div>\r\n		<label for=\"addVectorDescription\">Description</label>\r\n		<input type=\"text\" ng-model=\"editVector.description\" id=\"addVectorDescription\"/>\r\n	</div>	\r\n	<div class=\"addMapButtons\">\r\n		<div  class=\"buttons\" style=\"float:right\">\r\n			<button type=\"button\" class=\"btn btn-default\" ng-click=\"cancelVectorEdit()\" title=\"Cancel adding vector file\">Cancel</button>\r\n			<button type=\"button\" class=\"btn btn-default\" ng-click=\"saveVectors()\" title=\"Save updates for future sessions\">Save</button>\r\n		</div>\r\n	</div>\r\n</div>\r\n");
$templateCache.put("components/version/versionDisplay.html","<span class=\"badge\">Version: {{version}}</span>\r\n");}]);
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
	var baseUrl = 'service/appConfig/status';
	
	// Change the url here
	this.url = function(where) {
		baseUrl = where;
	};

	this.$get = ['$http', '$q', '$timeout', function($http, $q, $timeout) {
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
			return $http.get(baseUrl + "?time=" + (new Date()).getTime());
		}
		
		return {
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

angular.module('explorer.usermaps', ['explorer.persist.local', 'explorer.flasher', 'explorer.vector'])

.directive("addMaps", ['userMapService', 'persistService', 'flashService', 'vectorService', 
                     function(userMapService, persistService, flashService, vectorService) {
	return {
		templateUrl : "components/usermaps/addmaps.html",
		controller : ['$scope', function($scope) {
			var template = {
					assetId:"",
					name:"",
					description:"",
					url:"",
					legendUrl:"",
					layers:[],
					projection:"EPSG:3857",
					thumbnailUrl:""	
				},
				oldMapData = "";
	
			persistService.getItem("userMaps").then(function(maps) {
				if(maps) {
					maps.forEach(function(map) {
						// Check for legacy form of layers
						if(angular.isString(map.layers)) {
							map.layers = map.layers.split(",");
						}
					});
					$scope.maps = maps;
				} else {
					$scope.maps = [];
				}
				oldMapData = JSON.stringify($scope.maps);
			});
	
			vectorService.restore().then(function(vectors) {
				$scope.vectors = vectors;
			});	
	
			$scope.active = null;
			
			$scope.status = {
				mapOpen : false,
				vectorOpen : false
			};
	
			$scope.clearOpen = function() {
				$scope.status.mapOpen = $scope.status.vectorOpen = false;
			};			
			
			$scope.setOpen = function(name) {
				$scope.clearOpen();
				$scope.status[name + "Open"] = true;
			};
			
			$scope.work = angular.copy(template);
	
			$scope.editMap = function() {
				$scope.status.edit = true;
				$scope.status.editDisplayed = this.map.displayed; 
				$scope.setOpen("map");
				$scope.work = this.map;
				flashService.add("Updates are immediately saved.", 3000);
			};
			
			$scope.toggleShow = function() {
				userMapService.toggleShow(this.map);
			};
	
			$scope.makeActive = function() {
				$scope.active = wrap(this.map);
			};
	
			$scope.addMap = function() {
				var clone = $scope.work;
				if($scope.status.edit) {
					$scope.status.edit = false;
				} else {
					clone.assetId = "map" + Date.now();
					$scope.maps.push(clone);					
				}
				// 	Reset everything
				userMapService.removeLayer(clone);	
				$scope.clearOpen();
				$scope.work = angular.copy(template);
				flashService.add("Your map has been saved.", 3000);
				persistMaps();
			};
	
			$scope.addLayer = function() {
				var quit = false,
				value = this.workLayer.trim();
				if(!value) {
					return;
				}
				$scope.work.layers.forEach(function(item) {
					quit |= item == value; 
				});
				if(quit) {
					flashService.add("Duplicate layer names are not allowed", 3000);
				} else {
					flashService.add("Refreshing view with new layer.", 3000);
					$scope.work.layers.push(value);
					this.workLayer = "";
					userMapService.refreshLayer($scope.work, true);
					persistExistingMaps();
				}
			};
	
			$scope.shuffleUp = function() {
				var index = $scope.work.layers.indexOf(this.layer);
				if(index === 0) {
					return;
				}
				flashService.add("Refreshing view with new layer order.", 3000);
				move($scope.work.layers, index, index - 1);
				userMapService.refreshLayer($scope.work, true);
				persistExistingMaps();
			};
	
			$scope.shuffleDown = function() {
				var index = $scope.work.layers.indexOf(this.layer);	
				if(index == $scope.work.layers.length - 1) {
					return;
				}
				flashService.add("Refreshing view with new layer order.", 3000);
				move($scope.work.layers, index, index + 1);
				userMapService.refreshLayer($scope.work, true);
				persistExistingMaps();
			};
			
			$scope.removeLayer = function() {
				var index = $scope.work.layers.indexOf(this.layer);
				$scope.work.layers.splice(index, 1);
				if($scope.work.layers.length) {
					flashService.add("Refreshing view with new layer order.", 3000);
				} else {
					flashService.add("No preview of map with no layers.", 3000);			
				}
				userMapService.refreshLayer($scope.work, true);
				persistMaps();
			};
	
			$scope.clear = function() {
				$scope.work = angular.copy(template);
				$scope.status.edit = false;
				$scope.clearOpen();
			};
	
			$scope.isTestable = function() {
				return $scope.work && $scope.work.url && $scope.work.layers;
			};
			
			$scope.isComplete = function() {
				return $scope.isTestable() && $scope.work.name;
			};
	
			$scope.removeMap = function() {
				var index = $scope.maps.indexOf(this.map);
				if (index > -1) {
					userMapService.removeLayer(this.map);
					$scope.maps.splice(index, 1);
					if(this.map == $scope.active) {
						$scope.active = null;
					}
				}
				$scope.status.edit = false;
				persistMaps();
			};
			
			$scope.$watch("removalCandidate", function(candidate) {
				if(candidate) {
					// Show modal dialog
				} else {
					// Hide modal dialog
				}
			});

			$scope.$watch("status.open", function(newValue, oldValue) {
				if(newValue != "map" && oldValue == "map") {
					userMapService.refreshLayer($scope.work, $scope.status.editDisplayed);
					$scope.work = angular.copy(template);
					$scope.status.edit = false;
					$scope.status.editDisplayed = false;
					persistMaps();
				}
			});
	
			function move(array, oldIndex, newIndex) {
				if (newIndex >= array.length) {
					var k = newIndex - array.length;
					while ((k--) + 1) {
						array.push(undefined);
					}
				}
				array.splice(newIndex, 0, array.splice(oldIndex, 1)[0]);
				return array; 
			}	
	
			function reduceMap(map) {
				var reduction = {};
				angular.forEach(template, function(item, key) {
					reduction[key] = map[key]; 
				});
				return reduction;
			}
			
			function persistExistingMaps() {
				if($scope.status.edit) {
					persistMaps();
				}
			}
			
			function persistMaps() {
				// 	We don't want all the decorated stuff hanging off it so  we reduce it back.
				var maps = [];
				if($scope.maps) {
					$scope.maps.forEach(function(map) {
						maps.push(reduceMap(map));
					});
				}
				persistService.setItem("userMaps", maps);
			}
	
			function wrap(map) {
				if(map.isWrapped) {
					return map;
				}
				
				map.isWrapped = true;
				if(!map.layer) {
					userMapService.addLayer(map, false);
				}
		
				map.handleShow = function() {
					if(!this.layer.visibility) {
						this.layer.setVisibility(true);
					} else {
						this.layer.setVisibility(false);
					}
					return this.layer.visibility;
				};
				
				return map;
			}
		}]
	};	
}])

.factory("userMapService", ['mapService', '$q', function(mapService, $q) {
	var maps = [];
	
	return {
		toggleShow : function(details) {
			if(details.layer && details.layer.map) {
				this.removeLayer(details);
			} else {
				this.addLayer(details);
			}			
		},
		
		refreshLayer : function(details, visible) {
			var deferred;
			if(details.layer) {
				deferred = $q.defer();
				this.removeLayer(details).then(function(map) {
					if(visible) {
						this.addLayer(details);
						deferred.resolve(details);
					}					
				}.bind(this));
				return deferred.promise;
			} else if(visible && details.url && details.layers && details.layers.length > 0) {
				return this.addLayer(details);					
			}
			return $q.when(details);
		},
		
		addLayer : function(details, visible) {
			var deferred = $q.defer();
			if(typeof visible == "undefined") {
				visible = true;
			}
			
			details.displayed = visible;
			
			if(details.layer) {
				if(details.layer.map) {
					details.layer.setVisibility(visible);
					return $q.when(details);
				} else {
					mapService.getMap().then(function(map) {
						map.addLayer(details.layer);
						deferred.resolve(details);
					});
				}
			} else {
				details.type = "WMS";
				details.param1 = details.url;
				details.param2 = {
					layers:details.layers,
					transparent:true
				};
				details.param3 = {
					visibility:visible,
					isBaseLayer:false,
					opacity:1,
					legend : details.legend
				};
				
				details.layer = mapService.createLayer(details);
				mapService.getMap().then(function(map) {
					map.addLayer(details.layer);
					deferred.resolve(details);
				});
			}
			return $q.promise;
		},
				
		removeLayer : function(details) {
			if(details.layer && details.layer.map) {
				var deferred = $q.defer();
				mapService.getMap().then(function(map) {
					map.removeLayer(details.layer);
					details.layer = null;
					details.displayed = false;
					deferred.resolve(details);
				});
				return deferred.promise;
			}
			return $q.when(details);
		}
	};
}]);

})(angular);
/*!
 * Copyright 2015 Geoscience Australia (http://www.ga.gov.au/copyright.html)
 */
(function(angular, OpenLayers, XMLSerializer) {
'use strict';

angular.module("explorer.vector", ['explorer.flasher', 'explorer.broker', 'explorer.persist.local', 'explorer.message', 'explorer.config'])

.directive("marsVectorEdit", ['vectorService', 'flashService', 'persistService', 'brokerService', 'messageService', 'configService',
                      function(vectorService, flashService, persistService, brokerService, messageService, configService) {	
	return {
		templateUrl : "components/usermaps/vectorEdit.html",
		require:"^addMaps",
		link : function(scope) {
			configService.getConfig().then(function(config) {
				scope.localClientSessionId = config.localClientSessionId;
			}, 
			function(err) {
				// console.log("What the...");
			});
			brokerService.register("addVectorData", { 
				process:function(message) {
					if(message.data) {
						var data = message.data,
							vector = {
								id:"userVector_" + (new Date().getTime()),
								name:data.vectorName.content,
								description:data.vectorDescription.content,
								dataStr:data.vectorFile.content,
								fileName:data.vectorFile.fileName,
								show: true
							};
						
						vector.layer = vectorService.createLayer(vector.dataStr, vector);
						
						if(vector.layer) {
							scope.vectors[vector.name] = vector;
							vectorService.persist(scope.vectors);
						} else {
							messageService.error("No GML or KML features found. Are you sure that was a valid vector data file?");
						}
					}
				}
			});

			scope.saveVectors = function() {
				scope.cancelVectorEdit();
				vectorService.persist(scope.vectors);
			};
			
			scope.cancelVectorEdit = function() {
				scope.clearOpen();
				scope.status.vectorEdit = false;
				scope.editVector = null;
			};
			
			scope.clearVector = function() {
				// console.log("TODO: clear ve");
			};
		}
	};
}])

.directive("vectorsDisplay", ['vectorService', function(vectorService) {
	return {
		templateUrl : "components/usermaps/vectorDisplay.html?v=1",
		restrict : "AE",
		require: '^addMaps',
		link : function(scope, element) {
			scope.showElevation = function() {
				vectorService.showElevation(this.vector);
			};

			scope.showFeatureElevation = function() {
				vectorService.showElevation(this.vector, this.feature);
			};
			
			scope.isPath = function() {
				return this.vector.layer && this.vector.layer.features && 
					this.vector.layer.features.length == 1 && this.vector.layer.features[0].geometry && 
					this.vector.layer.features[0].geometry.CLASS_NAME == "OpenLayers.Geometry.LineString";
			};
			
			scope.isFeaturePath = function() {
				return this.feature.geometry && 
					(this.feature.geometry.CLASS_NAME == "OpenLayers.Geometry.LineString" || 
							this.feature.geometry.CLASS_NAME == "OpenLayers.Geometry.MultiLineString");
			};
			
			scope.toggle = function() {
				if(this.vector.show) {
					vectorService.hideLayer(this.vector.layer);
				} else {
					vectorService.showLayer(this.vector.layer);
				}
				this.vector.show = !this.vector.show;
			};
			
			scope.remove = function() {
				vectorService.hideLayer(this.vector.layer);
				delete scope.vectors[this.vector.name];
				vectorService.persist(scope.vectors);
			};
			
			scope.vectorEdit = function() {
				scope.editVector = this.vector;
				scope.setOpen("vector");
				scope.status.vectorEdit = true;
			};

			scope.panToVector = function() {
				vectorService.panTo(this.vector.layer);
			};
			
			scope.panToFeature = function() {
				vectorService.panToFeature(this.feature);
			};
		}
	};
}])

.directive("ajaxForm", ['flashService', '$rootScope', 'asynch', 'configService', function(flashService, $rootScope, asynch, configService){
	return {
		scope : {
			update : "&",
			cancel : "&"
		},
		link : function(scope, element) {
			var flasher;
			
			scope.quit = function() {
				scope.cancel();
			};
			
			element.ajaxForm({
		        beforeSubmit: function(a,f,o) {
		        	scope.cancel();
		        	asynch.expect();
		            o.dataType = "xml";
		            $rootScope.safeApply(function() {
		            	flasher = flashService.add("Processing file...", 4000);
		            });
		        },
		        success: function(data) {
		            $rootScope.safeApply(function() {
		            	flashService.remove(flasher);
		            });
		        }
		    });

		    // helper
		    function elementToString(node) {
		        var oSerializer = new XMLSerializer();
		        return oSerializer.serializeToString(node);
		    }
		}
	};
}])

.service("vectorService", ['mapService', 'persistService', '$q', '$rootScope', function(mapService, persistService, $q, $rootScope){
	var PERSIST_KEY = "userVectorLayers",
		vectors = {}, map,
		gmlns = "http://www.opengis.net/gml",
		wfsns = "http://www.opengis.net/wfs",
		kmlns = "http://www.opengis.net/kml";
	
	mapService.getMap().then(function(olMap) {
		map = olMap;
	});
	return {

		_whatType : function (dataStr) {
			if(!dataStr) {
				return null;
			}
			if(dataStr.indexOf(kmlns) > -1) {
				return "kml";
			} else if(dataStr.indexOf(wfsns) > -1) {
				return "wfs"; 
			} else if(dataStr.indexOf(gmlns) > -1) {
				return "gml"; 
			}
		},
		
		_boundsPlusPercent : function(bounds, bufferPercent) {
			var xBuff = (bounds.right - bounds.left) * bufferPercent,
				yBuff = (bounds.top - bounds.bottom) * bufferPercent;
			
			return new OpenLayers.Bounds(
						bounds.left - xBuff,
						bounds.bottom - yBuff,
						bounds.right + xBuff,
						bounds.top + yBuff
					);
		},
		
		persist : function(vectors) {
			var persistData = [];
			angular.forEach(vectors, function(item) {
				var vector = {
					id:item.id,
					name:item.name,
					description:item.description,
					dataStr:item.dataStr,
					show:item.show
				};
				persistData.push(vector);
			});	
			persistService.setItem(PERSIST_KEY, persistData, true);
		},		
		
		restore : function() {
			var self = this,
			 	deferred = $q.defer();
			
			mapService.getMap().then(function(map) {
				persistService.getItem(PERSIST_KEY).then(function(layers) {
					var response = {};
					if(layers) {
						layers.forEach(function(item) {
							item.show = false;
							item.layer = self.createLayer(item.dataStr, item);
							// Cull out the corrupt.
							if(item.dataStr && item.name && item.id) {
								response[item.name] = item;
							}
						});
					}
					deferred.resolve(response);
				});
			});
			return deferred.promise;			
		},
		
		createLayer : function(dataStr, details) {
			var format, vector = vectors[details.name],
				type = this._whatType(dataStr);

			if(!vector) {
				if(type == "kml") {
					format = new OpenLayers.Format.KML({
						'internalProjection': map.baseLayer.projection,
						'externalProjection': new OpenLayers.Projection("EPSG:4326"),
						extractAttributes:true,
						extractStyles : true
					});
				} else if(type == "wfs" || type == "gml"){
					format = new OpenLayers.Format.GML({
						'internalProjection': map.baseLayer.projection,
						'externalProjection': new OpenLayers.Projection("EPSG:4326"),
						extractAttributes:true,
						extractStyles : true
					});
				}
				
				if(format) { 
				   	vector = new OpenLayers.Layer.Vector(details.name);
					vector.addFeatures(format.read(dataStr));
					vectors[details.name] = vector;
				}
				
			}
			if(vector && details.show && !vector.map) {
				map.addLayer(vector);
			}
			return vector;
		},
		
		showLayer : function(layer){
			this.hideLayer(layer);
			map.addLayer(layer);
		},
		
		hideLayer : function(layer) {
			if(layer.map) {
				map.removeLayer(layer);
			}
		},
		
		panTo : function(layer) {
			var bounds = this._boundsPlusPercent(layer.getDataExtent(), 0.2);
			mapService.getMap().then(function(map) {
				map.zoomToExtent(bounds);
			});
		},
		
		panToFeature : function(feature) {
			feature.geometry.calculateBounds();
			var bounds = this._boundsPlusPercent(feature.geometry.bounds, 0.2);
			mapService.getMap().then(function(map) {
				feature.geometry.calculateBounds();
				map.zoomToExtent(bounds);
			});
		},
		
		showElevation : function(vector, feature) {
			if(!feature) {
				feature = vector.layer.features[0];
			}
			var geometry = feature.geometry, 
				distance = geometry.clone().transform(new OpenLayers.Projection("EPSG:3857"), new OpenLayers.Projection("EPSG:4326")).getGeodesicLength(),
				data = {length:distance, geometry:geometry, heading:"KML"};
			
			$rootScope.$broadcast("elevation.plot.data", data);
		}
	};
}]);

})(angular, OpenLayers, XMLSerializer);
/*!
 * Copyright 2015 Geoscience Australia (http://www.ga.gov.au/copyright.html)
 */
(function(angular) {

'use strict';

angular.module("explorer.version", [])

.directive('marsVersionDisplay', ['$http', 'versionService', function($http, versionService) {
	/**
	 * CIAP theme switcher. Retrieves and stores the current theme to the theme service. 
	 */
	return {
		templateUrl:'components/version/versionDisplay.html',
		link : function(scope) {
			$http.get(versionService.url()).then(function(response) {
				scope.version = response.data.version;
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
/*!
 * Copyright 2015 Geoscience Australia (http://www.ga.gov.au/copyright.html)
 */
(function(angular, OpenLayers) {

'use strict';

angular.module("mars.zoom", [])

.directive('marsZoomExtent', ['zoomService', 'flashService', function(zoomService, flashService) {
    return {
    	restrict: "AE",
    	scope : {
    		item : "="
    	},    	
    	link : function(scope, element, attr) {
    		element.on("click", prepareZoom);
    		
			function prepareZoom() {
				var oldValue = scope.item,
					newValue = (oldValue == "zoomIn")?"":"zoomIn";
				
				if(oldValue == "zoomIn") {
					zoomService.deactivateBoundingBox();
				} else if(newValue == 'zoomIn') {
					flashService.add("Drag diagonally to zoom to an area", 4000);
					zoomService.activateBoundingBox().then(function(extent){
						scope.item = "";
						zoomService.zoomTo(extent);
					});
				}				
				scope.item = newValue;
			}
    	}
    };
}])

.directive('marsZoomOutExtent', ['zoomService', function(zoomService) {
    return {
    	template:'<i class="fa fa-search-minus"></i>',
    	link : function(scope, element, attr) {
			element.on("click", function() {
				zoomService.zoomOut();
			});
    	}
    };
}])

.factory("zoomService", ['mapService', '$log', '$q', function(mapService, $log, $q) {
	var bboxControl, bboxLayer, zoomContainer = {};
	return {
		activateBoundingBox : function() {
			// Lots of verbose OpenLayers follows
			zoomContainer.deferred = $q.defer();
			if(bboxControl === null) {				
				bboxLayer = new OpenLayers.Layer.Vector("Prepare to define an area to zoom to");
				bboxControl = new OpenLayers.Control.DrawFeature(bboxLayer,
						OpenLayers.Handler.RegularPolygon, {
						handlerOptions: {
							sides: 4,
							irregular: true
						},
						featureAdded : function() {
							$log.debug("Bounding box drawn");
							mapService.getMap().then(function() {
								var feature = bboxLayer.features[0],
			            			bounds = feature.geometry.clone().getBounds();
								bboxControl.deactivate();
								bboxLayer.destroyFeatures();
								zoomContainer.deferred.resolve(bounds);
							});        
						}	
				});
			
				mapService.getMap().then(function(map) {
					map.addLayer(bboxLayer);
					map.addControl(bboxControl);
					bboxControl.activate();					
				});				
			} else {
				bboxControl.activate();
			}
			return zoomContainer.deferred.promise;					
		},
	
		zoomTo : function(bounds) {
			bboxLayer.map.zoomToExtent(bounds);			
		},
		
		zoomOut : function() {
			mapService.getMap().then(function(map) {
				var newZoom, zoom = map.zoom;
				if(zoom <= map.getMinZoom()) {
					return;
				} 				
				if(zoom < 10) {
					newZoom = zoom - 1;
				} else if(zoom < 13) {
					newZoom = zoom - 2;
				} else {
					newZoom = zoom - 3;
				}
				map.zoomTo(newZoom);				
			});
		},
		
		deactivateBoundingBox : function() {
			if(this.isActiveBoundingBox()) {
				bboxControl.deactivate();
			}
			if(bboxLayer) {
				bboxLayer.removeAllFeatures();
			}
		},
	
		isActiveBoundingBox : function() {
			return bboxControl !== null && bboxControl.active;
		},
		
		destroyBoundingBox : function() {
			if(bboxControl) {
				mapService.getMap().then(function(map){
					map.removeControl(bboxControl);
					map.removeLayer(bboxLayer);
					bboxControl.destroy();
					bboxControl = bboxLayer = null;	
				});
			}
		}
	};
}]);

})(angular, OpenLayers);
angular.module("exp.ui.templates", []).run(["$templateCache", function($templateCache) {$templateCache.put("components/confirm/confirm.html","<div class=\"modal-header\">\r\n   <h3 class=\"modal-title\" style=\"font-weight:bolder\">Confirm</h3>\r\n</div>\r\n<div class=\"modal-body\" id=\"accept\" style=\"width: 100%; margin-left: auto; margin-right: auto;\">\r\n	<div>\r\n		{{message}}\r\n	</div>	\r\n	<div style=\"text-align: right;padding-top:10px\">\r\n		<button type=\"button\" class=\"btn btn-default\" style=\"width:4em\" ng-click=\"accept()\" focus-me=\"true\">OK</button>\r\n		<button type=\"button\" class=\"btn btn-default\" style=\"width:4em\" ng-click=\"reject()\">Cancel</button>\r\n	</div>\r\n</div>");
$templateCache.put("components/flasher/flash.html","<div class=\"fred marsFlash\" ng-show=\"messages.items.length > 0\">\r\n  <div ng-repeat=\"message in messages.items\">\r\n     <span><img alt=\"Waiting...\" src=\"resources/img/tinyloader.gif\" ng-show=\"message.spinner\" style=\"position:relative;top:2px;\" width=\"12\"></img> {{message.text}}</span>\r\n  </div>\r\n</div>");
$templateCache.put("components/footer/footer.html","<!-- Footer -->\r\n<nav class=\"navbar navbar-inverse navbar-fixed-bottom ga-footer\" role=\"navigation\" mars-footer>\r\n    <div class=\"container-fluid\">\r\n        <div class=\"navbar-header\">\r\n            <button type=\"button\" class=\"navbar-toggle\" data-toggle=\"collapse\"\r\n                    data-target=\"#bs-example-navbar-collapse-1\">\r\n                <span class=\"sr-only\">Toggle footer</span>\r\n                <span class=\"icon-bar\"></span>\r\n                <span class=\"icon-bar\"></span>\r\n                <span class=\"icon-bar\"></span>\r\n            </button>\r\n        </div>\r\n        <div class=\"navbar-nobrand\">\r\n            <div class=\"collapse navbar-collapse\" id=\"bs-example-navbar-collapse-1\">\r\n                <ul class=\"nav navbar-nav\">\r\n                    <li><a href=\"http://creativecommons.org/licenses/by/3.0/au/deed.en\"><img src=\"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAQsAAAAyCAYAAABLV/6DAAAABHNCSVQICAgIfAhkiAAAAAlwSFlzAAAuIwAALiMBeKU/dgAAABl0RVh0U29mdHdhcmUAd3d3Lmlua3NjYXBlLm9yZ5vuPBoAAA8HSURBVHic7Z1rVBRXtsf/jfL0AgIBAQ1oFAkBAdMgRMkVueiIgAICGppRkMx1CK6ok2VITJwkd8locJngva41PrBlREEiQXkomAAGjaDQyBiDQFQUH5EGWp6RR9P0/eCCUFRV09UU8XV+n6h99jln11rU7vPYZx8BgDsgEAgE1fQKACifthUEAuGZp1fraVtAIBCeDyYOf1i3bh3mzJnztGwhEAjPEFVVVThy5MjQM8VZBAYGIigo6A83ikAgPHscP36c4izINIRAIKjFRLaCkvMlqLpaxUsnMpkM5ZfK0dPbw1iuo6MDV1dXODg4wN7eHgYGBmq129/fj/r6etTV1aGqqgqPHj1i1JugNQEuc11ga2urkf39/f14cPcBlEqyFkx4sYmIiMC8efMYy1idxe079ZhmO3XMnZ/Jy8cR8REoFApamb6+PmJjY/HRRx/B3Nxco/bdhe4AALlcDrFYjISEBNy7d4+md674HHz/5IuY/16HiRNZX5uVoqIiFJwu0MhGAuF5wdXVldVZjOs0JOdkDg4fPMzoKKKjo3Hr1i3s3r1bY0cxHG1tbaxfvx43b97Enj17oK+vT9MpPFuIPbv/V6MRQuRaEaysrcZsJ4HwvDJuzqLsYhmO/usYTa6rq4vk5GSIxWJYWfH/8eno6OD9999HWVkZXnvtNVr5pdJLOHI4lXO7urq62LBpA7S0yDIP4eVkXP7z62rr8H9Je2m/4NbW1vjhhx8QExMzHt1ScHFxgUQiwbJly2hledl5yM/L59zmbHs7LA8O5MM8AuG5g3dnIW2U4suERMj75BS5lZUVysrK4OnpyXeXrJiYmCA3NxehoaG0ssPJKbgiucK5zZDQEEz6j0l8mEcgPFfw7izEB8To7OikyAwNDXHmzBnY2Njw3d2oaGlpITU1FfPnz6fIlUolDvzzIPr6+ji1p2+gD/9A+miFQHjR4dVZXK26iiuV1O3WiRMnIjMzE66urnx2xQk9PT3k5ORg9uzZFLmsRYackzmc21sWuEzt7V0C4UWBN2cxMDCAf4mP0OTbt2/HkiVL+OpGY8zMzJCRkUFboDz1bTYeyZjjM9iYNGkSlgX68WkegfDMwz3ggIXC74pw7y41vsHOzg6bN2/mq4sx4+rqiujoaBw6dGhI1tvbi7TUdGzYFMeprWUBy5B14iQGBgZG1VW1TqNUKtHW1oaWlha0trYytjdv3jyak5NKpbh9+7bKfq2srBgD0a5evYru7u5R7SYQhsObszh7hh6w9PXXX0NHR4evLnhh+/btyMjIQFdX15Cs9GIp/vLXd6Grp6t2O4ZGhrB/3R4112tG1S0rK1OrzYGBAdy4cQNpaWlITU0dcgarV6+mOV2ZTAYnJyc0NjYytqWnp4fCwkK88cYbFHlxcTF8fX3VsodAGA4v05CHvz7E3QbqqMLX1xf+/v6j1lUqlaivr8epU6dw7NgxnDt3Ds3NzWr1K5fLce3aNaSnp+PEiRO4ePEiHj9+rLKOpaUlNm7cSG2nT46r/76qVp/DEbq/ybmOKrS0tGBvb48vvvgC1dXVePvttwEAH3/8MX7++WeKrpmZGQ4ePMjaVkJCAs1RtLa2Yu3atSRsnaARvDiLS6WXaLKoqCiVdbq7u7F161YYGxtj5syZCA4ORmRkJHx8fGBtbY2AgABIJBLGur/++ivCwsIwadIkODs7IyIiAuHh4fDy8sKUKVMQHR2NBw8esPa9evVqmqzicoXql2TAbZ4b5zrqoq+vj9zcXJibm6O3txcikQi9vb0UnYCAAERHR9PqLly4EJs2baLJY2Njcf/+/XGzmfBiw5OzuEx51tHRQWAge/BSeXk5nJycsGPHDnR2dtLK+/v7cfr0acyfPx/79u2jlB07dgwODg7IzMyEXC6n1e3q6kJKSgpcXFxQWFjI2L+TkxNmzZpFkVVWXFFr/WE4U6dNxRTLKZzqDOLi4gITExOYmJjA3d0d27dvp+kYGxsPbfn+9NNP+OSTT2g6SUlJlC1pQ0NDpKSk0NY4jh49ioyMDI1sJRAAHpxFV1cX6m/VU2SLFy+GkZERq/6qVatQX0+tY2BggNdff53yTy6XyxEXF4czZ84AAKqrq7Fu3Tp0dHRQ6pqammLGjBkUmUwmQ2hoKG7dusVoR3BwMOW5s7MT9+9x/9W1m23HuQ4AdHR0oK2tDW1tbZBIJNi2bRvKy8tpesO3nL/66isUFxdTyo2MjHD48GEIBAIAT9aJpk+fTtFpaGjAhg0bNLKTQBhkzM6CadvRx8eHVT8+Ph537tz53QAtLezcuRMdHR2oqanBw4cP8c477wyVL1q0CEZGRlAoFIiOjqYEUb3yyivIz8+HTCZDfX09rl+/Dju7Jx+vtrY2zSEMZ8GCBfR3edSq8l2ZMDUz5VyHDaYAserq6qG/lUol1q5di7a2NoqOj48P4uLi4O/vTwulHxgYwJo1a9De3s6bnYSXkzHvhrQyfGDW1taMut3d3di/fz9FFhQUhPj4+KFnCwsLiMVimJubQyQSDR2X/fHHH1FRQV1XSExMxNKlS4eeHRwckJ2djeTkZGzevBnTpk1jtdvS0pIma2ttY9BUjRkPzmLWrFlYsWIFvLy8KHK5XI7vvvuOIrt//z5iY2ORnp5OkX/55ZeMU7pdu3bh/PnzY7aRQBi7s2D4wNhOk1ZXV9OOq0dGRtL09PT0sGfPHops5G6AlpYWY10HBwfs3r17VLuZncUfN7IYLUZCJpMxTrmAJ+nOAgICIBKJhmQGBga0qNKqqips27ZNI/sIhJGMeRrC9IExfYjAk0W6kYycX7Mx0llYWFhAW1tbrbpMMNnI5PhGw9SUv2nIIEqlEvHx8cjNzWXViYuLw927d1nLu7u7IRKJGBeBCQRNGLOz6O/vp8nYArGGB0INou4HPzJ+YiyOAnhyZmXkjgHTu4yGts7Y7GBCIBAgOTkZxcXFMDQ0ZNRpb2/HmjVrWHdwPvzwQ9TUjB4wRiCoy5idxWQTE5rs4cOHjLojg4QAqPx1VFW3sbFxTMFFTU1NtA/N2NiYcztcz5UMEhUVBT8/P/j5+SEmJgZpaWmQyWQUHW9vb5WBVyUlJThw4ABNXlZWhr1792pkF4HAxpidhYnJZJqMLQTZycmJJmMbau/fvx85Ob+fCB1ZVy6XIz+fnsBGoVBg69atjFOe0WycPJm7s2Ba4FWHkpISFBQUoKCgAGKxGCKRCBERETS98PBwlVO1hoYGmkxdB0wgcGHszsJU/ZGFpaUlLRloSkoK7aPPzc3Fe++9hxUrVsDNzQ1nz56Fp6cnLCwsKHoffPABJY5iYGAAW7duxY4dO+Dq6oqQkBDK1uNwGJ0Fg+MbDZmGIwsmvv/+e8q2MvBkSuLo6MhbHwSCpoyLs2AKLhpELBZT1jR6enrg7+8Pd3d3rFy5Era2tli+fPnQFKGyshIymQyTJ0+mDa1ra2vh7OyMhQsXIjAwEGZmZkhMTATwZJGwoKCAMVkwAFy7do0mM9ZgZMF2/YAmWFpaYupUekZ1rpGlBMJ4wMM0xAQWU6i/+Dk5OawZqBwdHZGYmIgJEyYMyZRKJSQSCbKysmhD6M8++2xoeB4WFkYLOnr8+DHOnz+PvLw8SrCSrq4uUlJS4OzszGhHdnY25VlbWxs2ttwzed2/S792gCtaWlqYO3cudu3axbhwq8r5Egh/FLycDfGc70F5bmtrQ1FREav+xo0bcfnyZQiFQlYdGxsbZGZm4vPPP6fIk5OTkZ2djVdffZW1rlAoRGlpKcLDwxnLm5qacOkS9fCb4xxHxusDVNHe3o4bv9zkVGeQoqIi1NbWora2Fi0tLbhy5QolbmKQCxcu0BY+CYSnAS/5LDze8kTOSepCZXp6Ovz82LNJCYVCXL58GVVVVaipqUFNTQ06OzthY2ODN998E4sWLWJNu798+XIsXrwYlZWVQ3UFAgFsbGzg7e0NFxcXlfaeOnWKNrR393BX821/p7LiisY7MkzXFIykoaEBYWFhGrVPIPANL87CbvYsmJqZUrYR09LSsGXLFpW3sk+YMAFubm5wc+N+1FtfXx9eXl60EOnR6O3txc6dOykygUAAN3f2UQ4bknLmI/Rj5cGDBzh06BD27dsHqVQ6Ln0QCFzhxVkIBAJ4+yxE1omTQzKFQoFNmzapnI48DZKSkmih1g6ODpzDtvv6+vDTv1Vvzw4yWmpBhUKB5uZmSKVSSKVS1NXVsS7MjqSwsBA9PdQ7ZOvq6tSqSyBwgbe0ekErg1BceI5yGKu4uBhZWVkICQnhq5sxIZVKkZCQQJEJBAJErqWvFYzGhZILtGQ0bCQlJXFuX10kEglrkiACgU94y+6tr6+PiD+/Q5OvX78eN27c4Ksbjenr64NIJKKdzFzw9gLOOSkUCgW+/SaLT/MIhGceXu8N8fbxxsxZMymylpYWLF26FE1NTXx2xQmlUomoqCjalEhHR0ejUcW5wnNoblIvTyiB8KLAq7MQCAT4S+y7tMNV9fX18Pf3x2+//cZnd2qzZcsWWv4HAAhbHQqzV8w4tdXf349vT5BRBeHlg/frC2fOmomNf3t/KM3bIBKJBIsWLcK9e2MPYlKXnp4exMTEMOa38P4vbwStDOLcZuHZQrQ0t/BhHoHwXDEut6h7vOWBqHejaPKKigoIhUJaHsnxoKGhAV5eXhCLxbQyl7ku+Gvces5tShulOHYkjQ/zCITnjnFxFgCwLMAPgUH0DN/Nzc1YsmQJEhIS1N5N4IJSqcQ333wDoVCIyspKWvn0Gbb4IP5vlHBzddvdm7SXtk1JILwsjJuzAIA/R0UiODSYNiVRKBT49NNPYWdnh4MHD2qUdIaJvLw8CIVCrFq1ijFEeo7LHPz9f/7OOawbALKzclBbQ+IXCC8vrHEWRkbGaJQy56Xggu8SX9ja2iL/dD7jSOIfO/6B1KOpCAkJgaenJy2l/2g0NjaitLQUeXl5uH79OgBg+ozpFB2BQACPtzzg9Z9e6O7uQXc3t9FBV1cXbt+8DQ8Pj9GVCYTnGHNzc9YyAYChww0nT55EUBD3RT8CgfDicfz48eHXcvSO6zSEQCC8OFCmIb/88gvt6DaBQHg5uXmTmn6BMg0hEAgEFsg0hEAgqAdxFgQCQS3+H/5iYM4sITx1AAAAAElFTkSuQmCC\" height=\"20px\" alt=\"CC BY 3.0 AU\"></img></a></li>\r\n                    <li><a href=\"http://www.ga.gov.au/copyright\">Copyright</a></li>\r\n                    <li><a href=\"http://www.ga.gov.au/disclaimer\">Disclaimer</a></li>\r\n                    <li><a href=\"http://www.ga.gov.au/privacy\">Privacy</a></li>\r\n                    <li><a href=\"http://www.ga.gov.au/accessibility\">Accessibility</a></li>\r\n                    <li><a href=\"http://www.ga.gov.au/ips\">Information Publication Scheme</a></li>\r\n                    <li><a href=\"http://www.ga.gov.au/ips/foi\">Freedom of Information</a></li>\r\n                    <li class=\"contact\"><a href=\"http://www.ga.gov.au/contact-us\" target=\"_blank\">Contact us</a> </li>\r\n                </ul>\r\n            </div>\r\n        </div>\r\n    </div>\r\n</nav>");
$templateCache.put("components/graph/lineGraph.html","<div class=\"lineGraphContainer\" style=\"width:100%; position:relative\"> \r\n	<img src=\"resources/img/aspect_10x1.png\" style=\"width:100%;\" class=\"aspect10x1\"></img>\r\n	<div style=\"position: absolute;	top: 0px; left: 0px; height: 100%;width:100%\" >\r\n		<svg class=\"lineGraphSvg\" preserveAspectRatio=\"xMinYMin meet\" xmlns=\"http://www.w3.org/2000/svg\" version=\"1.1\" width=\"100%\" height=\"100%\" viewBox=\"0 0 1050 105\" \r\n					ng-mouseenter=\"mouseEnter($event)\" ng-mouseleave=\"mouseLeave($event)\" ng-mousemove=\"mouseMove($event)\" ng-click=\"mouseClick($event)\">\r\n			<g>\r\n				<text y=\"16\" x=\"57\" style=\"fill-opacity:0.6; font-size:120%\">{{config.heading}}</text>\r\n			</g>\r\n  			<g transform=\"translate(0, 2)\">\r\n  				<g class=\"zeroLine\" ng-show=\"showZeroLine && minY < 0\">\r\n					<line x1=\"50\" ng-attr-y1=\"{{90 * (1 + minY/rangeY)}}\" x2=\"1050\" ng-attr-y2=\"{{90 * (1 + minY/rangeY)}}\" style=\"stroke:blue\" stroke-width=\"1\" stroke-opacity=\"0.6\" />\r\n				</g>\r\n  				<g ng-repeat=\"points in data\" class=\"context\" style=\"cursor:pointer\" transform=\"translate(50)\" explorer-line>\r\n					<path ng-attr-fill=\"{{points.style.fill}}\" class=\"area\" ng-attr-d=\"{{path}}\" ng-attr-fill-opacity=\"{{points.style.fillOpacity}}\"></path>\r\n					<path ng-attr-d=\"{{line}}\" ng-attr-stroke=\"{{points.style.stroke}}\" ng-attr-stroke-width=\"{{points.style.strokeWidth}}\" fill-opacity=\"0\"></path> \r\n				</g>\r\n  				<g class=\"xAxis\">\r\n					<line x1=\"50\" y1=\"90\" x2=\"1050\" y2=\"90\" style=\"stroke:black\" />\r\n					<text transform=\"translate(1040 88)\" y=\"4\" dy=\".71em\" style=\"text-anchor:end\">{{config.xLabel}}</text>\r\n				</g>\r\n				<g class=\"yAxis\">\r\n					<line x1=\"50\" y1=\"0\" x2=\"50\" y2=\"90\" style=\"stroke:black\" />\r\n					<text transform=\"rotate(-90) translate(-10)\" y=\"6\" dy=\".71em\" style=\"text-anchor:end\">{{config.yLabel}}</text>\r\n					<g ng-repeat=\"tick in yTicks\">\r\n						<text font-size=\"80%\" style=\"text-anchor:end;\" ng-attr-transform=\"translate(45 {{90 * (1 - (tick - minY)/ rangeY) +3}})\">{{round(tick)}}</text>\r\n						<line x1=\"45\" x2=\"50\" ng-attr-y1=\"{{90 * (1 - (tick - minY)/ rangeY)}}\" ng-attr-y2=\"{{90 * (1 - (tick - minY)/ rangeY)}}\" style=\"stroke:black\"></line>\r\n					</g>\r\n				</g>\r\n				<g visibility=\"visible\" ng-show=\"position\">\r\n					<line x1=\"{{50 + position.graphX}}\" y1=\"-5\" x2=\"{{50 + position.graphX}}\" y2=\"95\" style=\"stroke:black\" />\r\n  				</g>\r\n  			</g>\r\n  			<g transform=\"translate(0 88)\">\r\n				<text y=\"6\" dy=\".71em\" transform=\"translate(50)\">{{config.leftText}}</text>\r\n				<text y=\"6\" dy=\".71em\" transform=\"translate(250)\">{{config.middleText}}</text>\r\n  			</g>\r\n		</svg>\r\n	</div>\r\n</div>");
$templateCache.put("components/header/header.html","<div class=\"container-full\" style=\"padding-right:10px; padding-left:10px\">\r\n    <div class=\"navbar-header\">\r\n\r\n        <button type=\"button\" class=\"navbar-toggle\" data-toggle=\"collapse\" data-target=\".ga-header-collapse\">\r\n            <span class=\"sr-only\">Toggle navigation</span>\r\n            <span class=\"icon-bar\"></span>\r\n            <span class=\"icon-bar\"></span>\r\n            <span class=\"icon-bar\"></span>\r\n        </button>\r\n\r\n        <a href=\"http://www.ga.gov.au\" class=\"hidden-xs\"><img src=\"resources/css/images/geoscience_inline_padded_small.png\" alt=\"Australian Government - Geoscience Australia\" class=\"logo\"></img></a>\r\n        <a href=\"http://www.ga.gov.au\" class=\"visible-xs\"><img src=\"resources/css/images/geoscience_stacked_padded_small.png\" alt=\"Australian Government - Geoscience Australia\" class=\"logo-stacked\"></img></a>\r\n        <a href=\"#/\" class=\"appTitle visible-xs\"><h1 style=\"font-size:120%\">{{heading}}</h1></a>\r\n    </div>\r\n    <div class=\"navbar-collapse collapse ga-header-collapse\">\r\n        <ul class=\"nav navbar-nav\">\r\n            <li class=\"hidden-xs\"><a href=\"#/\"><h1 class=\"applicationTitle\">{{heading}}</h1></a></li>\r\n        </ul>\r\n        <ul class=\"nav navbar-nav navbar-right\">				\r\n        	<li mars-user-details ng-show=\"username\" role=\"menuitem\" style=\"padding-right:10px\"></li>\r\n			<li mars-version-display role=\"menuitem\"></li>\r\n			<li style=\"width:10px\"></li>\r\n        </ul>\r\n        <div class=\"breadcrumbsContainer hidden-xs\">\r\n            <ul class=\"breadcrumbs\">\r\n                <li class=\"first\"><a href=\"/\">Home</a></li>\r\n            </ul>\r\n        </div>\r\n    </div><!--/.nav-collapse -->\r\n</div>\r\n\r\n<!-- Strap -->\r\n<div class=\"row\">\r\n    <div class=\"col-md-12\">\r\n        <div class=\"strap-blue\">\r\n        </div>\r\n        <div class=\"strap-white\">\r\n        </div>\r\n        <div class=\"strap-red\">\r\n        </div>\r\n    </div>\r\n</div>\r\n");
$templateCache.put("components/info/info.html","<div class=\"marsinfo\" ng-show=\"isOpen\">\r\n	<div class=\"marsinfo-inner\">\r\n      <h3 ng-show=\"title\" ng-bind=\"title\" class=\"marsinfo-title\"></h3>\r\n      <div class=\"marsinfo-content\" ng-transclude></div>\r\n	</div>\r\n</div>");
$templateCache.put("components/knob/knob.html","<input class=\"preset1\" type=\"range\" tabindex=\"-1\" style=\"position: absolute; top: -10000px;\" knob-handler>\r\n<svg version=\"1.1\" xmlns=\"http://www.w3.org/2000/svg\"  width=\"100%\" height=\"100%\" class=\"knob\" viewbox=\"0 0 200 200\" ng-attr-style=\"{{checkDisabled()}}\">\r\n	<defs>\r\n   		<filter id=\"{{knobShadow}}\" height=\"150%\" width=\"150%\">\r\n       		<feGaussianBlur in=\"SourceAlpha\" stdDeviation=\"2\"/>\r\n   	    	<feOffset dx=\"0\" dy=\"3\" result=\"offsetblur\"/>\r\n        	<feMerge>\r\n	   	        <feMergeNode/>\r\n    	   	    <feMergeNode in=\"SourceGraphic\"/>\r\n	       	</feMerge>\r\n	   	</filter>\r\n	</defs>\r\n	<circle cx=\"100\" cy=\"100\" r=\"60.606061\" ng-attr-style=\"filter:url(#{{knobShadow}});fill:{{config.circleColor}}\"></circle>\r\n	<rect x=\"97\" y=\"39.4\" width=\"6\" height=\"40\" class=\" pointer\" ng-attr-transform=\"rotate({{angle}} 100 100)\" ng-attr-fill={{config.pointerColor}}></rect>\r\n	<g class=\" scale\">\r\n		<text ng-repeat=\"tick in ticks\" x=\"95\" y=\"23.8\" width=\"10\" height=\"10\" \r\n				ng-attr-transform=\"rotate({{config.startAngle + $index * config.degrees + 3}} 100 100)\" style=\"text-anchor:middle\">{{tick}}</text>\r\n	</g>\r\n	<g>\r\n		<text y=\"175\" dy=\".71em\" x=\"100\" style=\"text-anchor:middle; font-weight:bold\">{{config.label}}</text>\r\n	</g>\r\n</svg>");
$templateCache.put("components/legend/legend.html","<div>    \r\n    <div class=\"modal-header\" drag-parent parentClass=\"legendContainer\">\r\n        <h4 class=\"modal-title\">{{heading}}</h4>\r\n    </div>\r\n	<div class=\"legendImageContainer\" style=\"max-height:450px;overflow-y:auto; overflow-x:hidden;padding-bottom:5px\"> \r\n		<img ng-src=\"{{legend}}\"></img>\r\n	</div>\r\n</div>\r\n");
$templateCache.put("components/message/messages.html","\r\n<span ng-controller=\"MessageController\" style=\"z-index:3\">\r\n  <span ng-show=\"historic.length > 10000\">\r\n    <a href=\"javascript:;\" title=\"Show recent messages\"><i class=\"fa fa-comments-o\" style=\"color:black\"></i></a>\r\n  </span>\r\n  <div ng-show=\"message\" class=\"alert\" role=\"alert\" \r\n  		ng-class=\'{\"alert-success\":(message.type==\"success\"),\"alert-info\":(message.type==\"info\"),\"alert-warning\":(message.type==\"warn\"),\"alert-danger\":(message.type==\"error\")}\'>\r\n    {{message.text}} <a href=\"javascript:;\" ng-click=\"removeMessage()\"><i class=\"fa fa-times-circle\" style=\"font-size:120%\"></i></a>\r\n  </div>\r\n</div>");
$templateCache.put("components/modal/modal.html","<div class=\"exp-modal-outer\">\r\n	<div class=\"exp-backdrop fade  in\" ng-show=\"isModal && isOpen\" \r\n		ng-class=\"{in: animate}\"></div>\r\n	<div class=\"exp-modal\" ng-show=\"isOpen\" exp-modal-up>\r\n		<div class=\"exp-modal-inner\">\r\n    	  <div drag-parent parentClass=\"exp-modal-outer\" class=\"exp-modal-title\" ng-show=\"title\">\r\n      		<i class=\"fa\" ng-class=\"iconClass\"></i> \r\n      		<span ng-bind=\"title\"></span>\r\n      		<button title=\"Close popup dialog\" ng-click=\"isOpen=false\" class=\"exp-modal-close\" type=\"button\"><i class=\"fa fa-close\"></i></button> \r\n	      </div>      \r\n    	  <div class=\"exp-modal-content\" style=\"{{containerStyle}}\" ng-class=\"{\'exp-modal-no-title\':!title}\" ng-transclude></div>\r\n		</div>\r\n	</div>\r\n</div>");
$templateCache.put("components/popover/popover.html","<div class=\"popover {{direction}}\" ng-class=\"containerClass\" ng-show=\"show\">\r\n  <div class=\"arrow\"></div>\r\n  <div class=\"popover-inner\" ng-transclude></div>\r\n</div>");
$templateCache.put("components/user/userdetails.html","<span class=\"badge\" title=\"Your are logged in\">Logon: {{username}}</span>");
$templateCache.put("components/usermaps/add-maps.html","<div>\r\n	<div class=\"marsMapsTreeview\">\r\n		\r\n		<p style=\"text-align: left; margin: 10px; font-size: 16px; padding: 40px 5px 0px 0px;\">\r\n			<strong>Your Maps:</strong>\r\n		</p>\r\n		\r\n		<div add-maps></div>\r\n	</div>\r\n	<layer-inspector active=\"active\"></layer-inspector>\r\n</div>");
$templateCache.put("components/usermaps/addmaps.html","<div ng-form>\r\n	<div ng-repeat=\"map in maps | orderBy : \'name\'\" style=\"padding:7px;padding-left:10px;position:relative;height:1.4em\" ng-class-even=\"\'even\'\" ng-class-odd=\"\'active\'\">\r\n		<div style=\"float:left\">\r\n			<a href=\"javascript:;\" class=\"featureLink\" ng-click=\"makeActive()\" ng-class=\"{active:(map == active)}\" >\r\n				{{map.name}} \r\n			</a>\r\n		</div>\r\n		<div style=\"float:right\">\r\n			<a class=\"featureLink\" href=\"javascript:;\" title=\"Show legend for this map\" ng-show=\"map.legendUrl\" heading=\"map.name + \' Legend\'\"\r\n				explorer-legend legend=\"map.legendUrl\"><i class=\"fa fa-list-ul\"></i></a>\r\n			<a class=\"featureLink\" href=\"javascript:;\" title=\"Edit the map\" \r\n				ng-click=\"editMap()\"><i class=\"fa fa-pencil\"></i></a>	\r\n			<a class=\"featureLink\" href=\"javascript:;\" title=\"Show on map\" \r\n				ng-click=\"toggleShow()\"><i class=\"fa\" ng-class=\"{\'fa-eye\':(!map.layer.visibility), \'fa-eye-slash\':map.layer.visibility}\"></i></a>	\r\n			<a href=\"javascript:\" exp-confirm=\"\'Are you sure that you want to delete this map?\'\" success=\"removeMap()\" title=\"Remove map from application. Cannot be undone.\">\r\n				<i class=\"fa fa-remove\" title=\"Remove this feature from your added maps.\"></i>\r\n			</a>						\r\n		</div>\r\n	</div>\r\n	<vectors-display vectors=\"vectors\"></vectors-display>\r\n	\r\n	<accordion>\r\n		<accordion-group heading=\"{{status.edit && \'Edit\' || \'Add\'}} a map...\" is-open=\"status.mapOpen\">\r\n			<div class=\"addMapsDialog\">\r\n				<div>\r\n					<label for=\"addMapsName\">Name</label>\r\n					<input type=\"text\" ng-model=\"work.name\" id=\"addMapsName\" required=\"required\"/>\r\n				</div>\r\n				<div>\r\n					<label for=\"addMapsDescription\">Description</label>\r\n					<input type=\"text\" ng-model=\"work.description\" id=\"addMapsDescription\"/>\r\n				</div>\r\n				<div>\r\n					<label for=\"addMapsUrl\">WMS URL</label>\r\n					<input type=\"text\" ng-model=\"work.url\" id=\"addMapsUrl\" required=\"required\"/>\r\n				</div>\r\n				<div>\r\n					<label for=\"addMapsLayers\">Layers</label>\r\n					<div ng-repeat=\"layer in work.layers | reverse\" ng-class-even=\"\'even\'\" ng-class-odd=\"\'active\'\">\r\n						<div style=\"padding:2px\">\r\n							{{layer}}\r\n							<div style=\"float:right\">\r\n								<a class=\"featureLink\" href=\"javascript:;\" title=\"Move layer higher on map\" ng-disabled=\"$first\"\r\n									ng-click=\"shuffleDown()\"><i class=\"fa fa-arrow-up\"></i></a>	\r\n								<a class=\"featureLink\" href=\"javascript:;\" title=\"Move layer lower on map\" ng-disabled=\"$last\"\r\n									ng-click=\"shuffleUp()\"><i class=\"fa fa-arrow-down\"></i></a>	\r\n								<a href=\"javascript:\" exp-confirm=\"\'Are you sure that you want to delete this map?\'\" success=\"removeLayer()\" title=\"Remove map from application.\">\r\n									<i class=\"fa fa-remove\" title=\"Remove this layer from your added maps.\"></i>\r\n								</a>						\r\n							</div>\r\n						</div>\r\n					</div>\r\n					<input ng-model=\"workLayer\" ng-required=\"work.layers.length == 0\" \r\n							exp-enter=\"addLayer()\" title=\"Hit enter after entering each layer to add the layer\"/>\r\n					<button ng-click=\"addLayer()\" title=\"You can also use the enter key to add layer from the previous input\">Add</button>\r\n				</div>\r\n				<div>\r\n					<label for=\"addMapsThumbnailUrl\">Thumbnail URL</label>\r\n					<input type=\"text\" ng-model=\"work.thumbnailUrl\"/>\r\n				</div>\r\n				<div>\r\n					<label for=\"addMapsLegendUrl\">Legend URL</label>\r\n					<input type=\"text\" ng-model=\"work.legendUrl\"/>\r\n				</div>\r\n			</div>\r\n	\r\n			<div class=\"addMapButtons\">\r\n				<div  class=\"buttons\" style=\"float:right\">\r\n					<button type=\"button\" class=\"btn btn-default\" ng-click=\"clear()\" title=\"Abandon updates\">Cancel</button>\r\n					<button type=\"button\" class=\"btn btn-default\" ng-click=\"addMap($event)\" ng-disabled=\"!isComplete()\" \r\n								title=\"Click to complete updates\">{{status.edit && \'Update\' || \'Add\'}}</button>\r\n				</div>\r\n			</div>\r\n		</accordion-group>\r\n		<accordion-group heading=\"{{status.vectorEdit && \'Edit\' || \'Add\'}} a vector...\" is-open=\"status.vectorOpen\">\r\n			<div mars-vector-edit vectors=\"vectors\">\r\n		</accordion-group>\r\n	</accordion>\r\n</div>");
$templateCache.put("components/usermaps/vectorDisplay.html","<div ng-repeat=\"vector in vectors | orderBy : \'name\'\" style=\"padding:7px;padding-left:10px;position:relative;min-height:1.4em\" ng-class-even=\"\'even\'\" ng-class-odd=\"\'active\'\">\r\n	<div ng-show=\"vector.layer.features.length < 2\" style=\"clear:both\">\r\n		<div style=\"float:left\">\r\n			<a href=\"javascript:;\" class=\"featureLink\" ng-click=\"makeActive()\" ng-class=\"{active:(vector == active)}\" >\r\n				{{vector.name}} \r\n			</a>\r\n		</div>\r\n		<div style=\"float:right\">\r\n			<a class=\"featureLink\" href=\"javascript:;\" title=\"Plot feature\'s elevation\" ng-show=\"isPath()\" \r\n				ng-click=\"showElevation()\"><i class=\"fa fa-align-left fa-rotate-270\"></i></a>\r\n			<a class=\"featureLink\" href=\"javascript:;\" title=\"Edit the vector layer\" \r\n				ng-click=\"vectorEdit()\"><i class=\"fa fa-pencil\"></i></a>\r\n			<a class=\"featureLink\" href=\"javascript:;\" title=\"Show on map\" \r\n				ng-click=\"toggle()\"><i class=\"fa\" ng-class=\"{\'fa-eye\':(!vector.show), \'fa-eye-slash\':vector.show}\"></i></a>\r\n			<a class=\"featureLink\" href=\"javascript:;\" title=\"Pan map to feature\" \r\n				ng-click=\"panToVector()\"><i class=\"fa fa-flag\"></i></a>	\r\n			<a href=\"javascript:\"  title=\"Remove vector layer. Cannot be undone.\"\r\n				exp-confirm=\"\'Are you sure that you want to delete this map?\'\" success=\"remove()\"><i class=\"fa fa-remove\"></i></a>						\r\n		</div>\r\n	</div>\r\n	\r\n	<div ng-show=\"vector.layer.features.length > 1\" style=\"clear:both\">\r\n		<div style=\"float:left\">\r\n			<i class=\"fa fa-caret-right\" ng-class=\"{\'fa-caret-down\':expanded,\'fa-caret-right\':(!expanded)}\" role=\"presentation\" ng-click=\"expanded = !expanded\"></i> <strong>{{vector.name}}</strong>\r\n		</div>\r\n	\r\n		<div style=\"float:right\">\r\n			<a class=\"featureLink\" href=\"javascript:;\" title=\"Edit the vector layer\" \r\n				ng-click=\"vectorEdit()\"><i class=\"fa fa-pencil\"></i></a>\r\n			<a class=\"featureLink\" href=\"javascript:;\" title=\"Show on map\" \r\n				ng-click=\"toggle()\"><i class=\"fa\" ng-class=\"{\'fa-eye\':(!vector.show), \'fa-eye-slash\':vector.show}\"></i></a>\r\n			<a class=\"featureLink\" href=\"javascript:;\" title=\"Pan map to feature\" \r\n				ng-click=\"panToVector()\"><i class=\"fa fa-flag\"></i></a>	\r\n			<a href=\"javascript:\"  title=\"Remove vector layer. Cannot be undone.\"\r\n				exp-confirm=\"\'Are you sure that you want to delete this map?\'\" success=\"remove()\"><i class=\"fa fa-remove\"></i></a>						\r\n		</div>\r\n		\r\n		<div style=\"clear:both\" ng-show=\"expanded\">\r\n			<div ng-repeat=\"feature in vector.layer.features\">\r\n				<div style=\"float:left; padding-left:10px\">\r\n					{{feature.fid ? feature.fid : feature.data.name ? feature.data.name : \'Feature #\' + $index}} \r\n				</div>\r\n				<div style=\"float:right\">\r\n					<a class=\"featureLink\" href=\"javascript:;\" title=\"Plot feature\'s elevation\" ng-show=\"isFeaturePath()\" \r\n						ng-click=\"showFeatureElevation()\"><i class=\"fa fa-align-left fa-rotate-270\"></i></a>\r\n					<a class=\"featureLink\" href=\"javascript:;\" title=\"Pan map to feature\" \r\n						ng-click=\"panToFeature()\"><i class=\"fa fa-flag\"></i></a>			\r\n				</div>\r\n				<div style=\"clear:both\"></div>\r\n			</div>\r\n		</div>\r\n		\r\n	</div>\r\n</div>");
$templateCache.put("components/usermaps/vectorEdit.html","<div class=\"addMapsDialog\" ng-if=\"!status.vectorEdit\">\r\n	<form method=\"POST\" action=\"service/upload/file\" enctype=\"multipart/form-data\" ajax-form update=\"cancelVectorEdit()\" cancel=\"cancelVectorEdit()\">\r\n		<div>\r\n			<label for=\"addVectorName\">Name</label>\r\n			<input type=\"text\" ng-model=\"vector.name\" id=\"addVectorName\" name=\"vectorName\" required=\"required\"/>\r\n			<input type=\"hidden\" name=\"clientSessionId\" value=\"{{localClientSessionId}}\" />\r\n		</div>\r\n		<div>\r\n			<label for=\"addVectorDescription\">Description</label>\r\n			<input type=\"text\" ng-model=\"vector.description\" id=\"addVectorDescription\" name=\"vectorDescription\"/>\r\n		</div>\r\n		<div>\r\n			<label for=\"addVectorFile\">Select file to upload</label>\r\n			<input type=\"file\" name=\"vectorFile\"/>\r\n		</div>\r\n	\r\n		<div class=\"addMapButtons\">\r\n			<div  class=\"buttons\" style=\"float:right\">\r\n				<button type=\"reset\" class=\"btn btn-default\" title=\"Cancel adding vector file\">Cancel</button>\r\n				<button type=\"submit\" class=\"btn btn-default\" title=\"Add  vector file\" value=\"Add Vector File\">Add</button>\r\n			</div>\r\n		</div>\r\n	</form>\r\n</div>\r\n<div class=\"addMapsDialog\" ng-if=\"status.vectorEdit\">\r\n	<div>\r\n		<label for=\"addVectorName\">Name</label>\r\n		<input type=\"text\" ng-model=\"editVector.name\" id=\"addVectorName\" required=\"required\"/>\r\n	</div>\r\n	<div>\r\n		<label for=\"addVectorDescription\">Description</label>\r\n		<input type=\"text\" ng-model=\"editVector.description\" id=\"addVectorDescription\"/>\r\n	</div>	\r\n	<div class=\"addMapButtons\">\r\n		<div  class=\"buttons\" style=\"float:right\">\r\n			<button type=\"button\" class=\"btn btn-default\" ng-click=\"cancelVectorEdit()\" title=\"Cancel adding vector file\">Cancel</button>\r\n			<button type=\"button\" class=\"btn btn-default\" ng-click=\"saveVectors()\" title=\"Save updates for future sessions\">Save</button>\r\n		</div>\r\n	</div>\r\n</div>\r\n");
$templateCache.put("components/version/versionDisplay.html","<span class=\"badge\">Version: {{version}}</span>\r\n");}]);