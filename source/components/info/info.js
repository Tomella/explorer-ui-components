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