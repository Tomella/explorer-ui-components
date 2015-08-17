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