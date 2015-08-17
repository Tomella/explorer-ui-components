/*!
 * Copyright 2015 Geoscience Australia (http://www.ga.gov.au/copyright.html)
 */
(function(angular) {

'use strict';

angular.module('explorer.toolbar', [])

.directive('expToolbar', [function() {
	return {
		restrict:'AE',
		scope:true,
		controller : ['$scope', function($scope) {
			$scope.item = "";	
			$scope.parameters = {};
			
			$scope.toggleItem = function(item) {
				$scope.item = $scope.item == item?"":item;
			};
			
			this.toggleItem = function(item) {
				$scope.item = $scope.item == item?"":item;
			};
			this.currentItem = function() {
				return $scope.item;
			};
		}]
	};
}]);

})(angular);