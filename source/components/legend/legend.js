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
			heading:"=?"
		},
		controller : ['$scope', function($scope) {
			if(!$scope.heading) {
				$scope.heading = "Legend";
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
					size:'sm',
					controller : ['$scope', '$modalInstance', 'legend', 'heading', function($scope, $modalInstance, legend, heading) {
						$scope.legend = legend;
						$scope.heading = heading;
					}],
					backdrop:false,
					resolve: {
						legend: function () {
							return scope.legend;
						},
						heading : function() {
							return scope.heading;
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