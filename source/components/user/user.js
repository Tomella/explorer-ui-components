/*!
 * Copyright 2015 Geoscience Australia (http://www.ga.gov.au/copyright.html)
 */
(function(angular, sessionStorage, window) {

'use strict';

angular.module("explorer.user", [])

.directive('marsUserDetails', ['userService', '$rootScope', '$location', function(userService, $rootScope, $location) {
	return {
		restrict : 'EA',
		templateUrl : 'components/user/userdetails.html',
		link : function(scope, element, attrs) {
			userService.getUsername().then(function(username){
				scope.username = username;
			});
		}
	};
}])


.directive('expWebUserDetails', ['userService', '$rootScope', '$location', function(userService, $rootScope, $location) {
	return {
		restrict : 'EA',
		templateUrl : 'components/user/userlogindetails.html',
		link : function(scope, element, attrs) {
			userService.getUsername().then(function(username){
				scope.username = username;
			});
			
			scope.logout = function() {
				userService.logout();
			};
		}
	};
}])


/**
 * @ngdoc interface
 * 
 * In Explorer the service/appConfig is a secured endpoint but there is an analogous endpoint called 
 * service/anonAppConfig that is for those configuration items that are not secure so if you have an
 * application that does not need to be secured then change the config to point to a service that 
 * returns a username property 
 * @example
 *  userServiceProvider.url("my/end/point/for/user/name");
 *  // {
 *  //   "username":"larry"
 *  // } 
 */

.provider("userService", function UserServiceProvider() {	
	var baseUrl = 'service/appConfig/status',
		logoutUrl = 'j_spring_security_logout';
	
	this.logoutUrl = function(url) {
		logoutUrl = url;
	};
	
	// Change the url here
	this.url = function(where) {
		baseUrl = where;
	};

	this.$get = ['$cookies', 'httpData', '$q', '$window', '$timeout', function($cookies, httpData, $q, $window, $timeout) {
		var username;

		function login() {
			window.location.reload();
		}

		function setAcceptedTerms(value) {
			if(value) {
				sessionStorage.setItem("mars.accepted.terms", true);
			} else {
				sessionStorage.removeItem("mars.accepted.terms");			
			}
		}

		function hasAcceptedTerms() {
			return !!sessionStorage.getItem("mars.accepted.terms");
		}

		function loadCredentials() {
			return httpData.get(baseUrl + "?time=" + (new Date()).getTime());
		}
		
		return {
			logout : function() {
				$window.location.href = logoutUrl;
				$cookies.remove("JSESSIONID");				
			},
			
			login : function() {
				login();
			},
			
			hasAcceptedTerms : function() {
				return hasAcceptedTerms();
			},
			
			setAcceptedTerms : function(value) {
				setAcceptedTerms(value);
			},
			
			getUsername : function() {
				var deferred;
				if(username) {
					return $q.when(username);
				} else {
					deferred = $q.defer();
					loadCredentials().then(function(creds) {
						if(creds) {
							username = creds.data.username;
						}
						deferred.resolve(username);
					});
					return deferred.promise;
				}
			}
		};
	}];
});

})(angular, sessionStorage, window);