'use strict';

angular.module("explorer.ping", [])

.provider("pingService", function pingServiceProvider() {
	var url = "service/ping/keepalive",
		delaySeconds = 600,
		enabled = true,
		timeout = null;

	this.location = function(where) {
		url = where;
	}

	this.enable = function(value) {
		enabled = value;
	}
	
	this.$get = ['$http', '$timeout', function pingServiceFactory($http, $timeout) {
		var $ping = {
			enable :function(value) {
				enable(value);
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