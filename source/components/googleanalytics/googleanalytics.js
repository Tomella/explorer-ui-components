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
    }
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
