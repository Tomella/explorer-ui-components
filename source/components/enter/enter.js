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