/*!
 * Copyright 2015 Geoscience Australia (http://www.ga.gov.au/copyright.html)
 */

'use.strict';

angular.module("explorer.focusme", [])

.directive("focusMe", ['$log', '$timeout', function($log, $timeout){
	return {
		link: function(scope, element, attrs) {
            attrs.$observe("focusMe", function(newValue) {
                if (newValue === "true") {
                    $timeout(function(){element.focus()});
                }
            });
		}
	};
}]);