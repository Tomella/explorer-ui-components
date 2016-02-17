/*!
 * Copyright 2015 Geoscience Australia (http://www.ga.gov.au/copyright.html)
 */
(function(angular) { 

'use strict'; 

angular.module("explorer.legend", [])

.directive("explorerLegend", ['$modal', function($modal){
	return {
		scope : {
			legend : "=",
			heading : "=?",
			newwindow : "=?"
		},
		controller : ['$scope', function($scope) {
			if(!$scope.heading) {
				$scope.heading = "Legend";
			}
			if(!$scope.newwindow) {
				$scope.newwindow = false;
			}
			$scope.showing = false;
		}],
		link : function(scope, element) {
			var modalInstance;
			element.on('click', function() {
				if(scope.showing) {
					modalInstance.close(null);
					return;
				}
				modalInstance = $modal.open({
					templateUrl: 'components/legend/legend.html',
					windowClass: 'legendContainer',
					size: 'sm',
					controller : ['$scope','$modalInstance', 'legend', 'heading','newwindow', function($scope, $modalInstance, legend, heading, newwindow) {
						$scope.legend = legend;
						$scope.heading = heading;
						$scope.newwindow = newwindow;
					}],
					backdrop : false,
					resolve : {
						legend : function() {
							return scope.legend;
						},
						heading : function() {
							return scope.heading;
						},
						newwindow : function() {
							return scope.newwindow;
						}
					}
				});
				modalInstance.result.then(function() {scope.showing = false;}, function() {scope.showing = false;});
				scope.showing = true;
			});
		}
	};
}]);

})(angular);