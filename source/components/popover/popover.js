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