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