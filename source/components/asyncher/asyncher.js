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