/*!
 * Copyright 2015 Geoscience Australia (http://www.ga.gov.au/copyright.html)
 */
(function(angular, sessionStorage) {

'use strict';

angular.module("nedf.splash", ['explorer.projects'])

.directive('marsSplash', ['$rootScope', '$modal', '$log', 'userService', 
                        function($rootScope, $modal, $log, userService){
	return {
		controller : ['$scope', 'splashService', function ($scope, splashService) {
			$scope.acceptedTerms = true;
			
			splashService.getReleaseNotes().then(function(messages) {
				$scope.releaseMessages = messages;
				$scope.acceptedTerms = userService.hasAcceptedTerms();
			});
		}],
		link : function(scope, element) {
			var modalInstance;
			
			scope.$watch("acceptedTerms", function(value) {
				if(!value) {
					modalInstance = $modal.open({
						templateUrl: 'partials/splash.html',
						size: "lg",
						backdrop : "static",
						keyboard : false,
						controller : ['$scope', '$modalInstance', 'acceptedTerms', 'messages', function ($scope, $modalInstance, acceptedTerms, messages) {
							$scope.acceptedTerms = acceptedTerms;
							$scope.messages = messages;
							$scope.accept = function () {
								$modalInstance.close(true);
							};
						}],
						resolve: {
							acceptedTerms: function () {
								return scope.acceptedTerms;
							},
							messages : function() {
								return scope.messages;
							}
						}
					});				    
				    modalInstance.result.then(function (acceptedTerms) {
				    	$log.info("Accepted terms");
				        scope.acceptedTerms = acceptedTerms;
				        userService.setAcceptedTerms(acceptedTerms);
				    }, function () {
				        $log.info('Modal dismissed at: ' + new Date());
				    });
				} 
			});
			
			$rootScope.$on("logoutRequest", function() {
				userService.setAcceptedTerms(false);
			});
		}
	};
}])

.factory("splashService", ['$http', '$q', 'projectsService', function($http, $q, projectsService) {
	var VIEWED_SPLASH_KEY = "nedf.accepted.terms",
		releaseNotesUrl = "service/releaseNotes/";
		
	return {
		getReleaseNotes : function() {
			var deferred = $q.defer();
			projectsService.getCurrentProject().then(function(project) {
				$http({
					method : "GET",
					url : releaseNotesUrl + project + "?t=" + Date.now()
				}).then(function(result) {
					deferred.resolve(result.data);
				});
			});
			return deferred.promise;
		},
		hasViewedSplash : hasViewedSplash,
		setHasViewedTerms : setHasViewedTerms
	};	

	function setHasViewedTerms(value) {
		if(value) {
			sessionStorage.setItem(VIEWED_SPLASH_KEY, true);
		} else {
			sessionStorage.removeItem(VIEWED_SPLASH_KEY);			
		}
	}

	function hasViewedSplash() {
		return !!sessionStorage.getItem(VIEWED_SPLASH_KEY);
	}
}])

.filter("priorityColor", [function() {
	var map = {
		IMPORTANT: "red",
		HIGH: "blue",
		MEDIUM: "orange",
		LOW: "gray"
	};
	
	return function(priority) {
		if(priority in map) {
			return map[priority];
		}
		return "black";
	};
}])

.filter("wordLowerCamel", function() {
	return function(priority) {
		return priority.charAt(0) + priority.substr(1).toLowerCase();
	};
})

.filter("sortNotes", [function() {	
	return function(messages) {
		var response = messages.slice(0).sort(function(prev, next) {
			if(prev.priority == next.priority) {
				return prev.lastUpdate == next.lastUpdate?0:next.lastUpdate - prev.lastUpdate; 
			} else {
				return prev.priority == "IMPORTANT"?-11:1;
			}			
		});
		return response;
		
	};
}]);

})(angular, sessionStorage);