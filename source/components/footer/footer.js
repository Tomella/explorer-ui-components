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