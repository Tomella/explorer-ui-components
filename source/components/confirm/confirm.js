/*!
 * Copyright 2015 Geoscience Australia (http://www.ga.gov.au/copyright.html)
 */

(function(angular) {
	
'use strict';

angular.module("explorer.confirm", ['ui.bootstrap', 'explorer.focusme'])

.directive("expConfirm", ['confirmService', function(confirmService) {
	return {
		scope : {
			success : "&",
			cancel : "&",
			expConfirm : "="
		},
		link : function(scope, element) {			
			element.on("click", function(event) {
				confirmService.confirm(scope);
			});
		}
	};	
}])

.factory("confirmService", ['$log', '$modal', function($log, $modal) {
	return {
		confirm : function(details) {
			var modalInstance;
			
			details.confirmed = false;
			modalInstance = $modal.open({
				templateUrl: 'components/confirm/confirm.html',
				size: "sm",
				backdrop : "static",
				keyboard : false,
				controller : ['$scope', '$modalInstance', 'message', function ($scope, $modalInstance, message) {
					$scope.message = message;

					$scope.accept = function () {
					   $modalInstance.close(true);
					};
					  
					$scope.reject = function () {
					   $modalInstance.close(false);
					};
				}],
				resolve: {
					message : function() {
						return details.expConfirm;
					}
				}
			});
			
			modalInstance.opened.then(function() {
				// Maybe do something about the focus here
			});
			
		    modalInstance.result.then(function (confirmed) {
		    	$log.info("Confirmed : " + confirmed);
		        if(confirmed) {
		        	details.success();
		        } else if(details.cancel){
		        	details.cancel();
		        }
		    });
		}
	};
}]);

})(angular);