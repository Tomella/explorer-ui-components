/*!
 * Copyright 2015 Geoscience Australia (http://www.ga.gov.au/copyright.html)
 */

(function(angular) {
'use strict';

/**
 * @ngdoc object
 * @name exp.web.login
 * @description
 *
 * <p>Handles user login</p>
 * 
 * 
 */

angular.module("exp.web.login", [])

.directive('expWebLogin', ['loginService', function(loginService) {
	return {
		restrict : 'EA',
		templateUrl : 'explorer/login/login.html',
		link : function(scope, element, attrs) {
			scope.login = function() {
				loginService.login();
			};
		}
	};
}])

/**
 * @ngdoc service
 * @name loginService
 * @description 
 * Allows a user to login but not logout. It works by calling a service behinde a security
 * filter that identifies that the user is not logged in and redirects the user to the
 * CAS login page. This is standards procedure for the Spring filter that is used to 
 * isolate GA applications. Once the user is verified CAS then redirects the user back to 
 * the same end point and now the code at that endpoint redirects to the application 
 * nominated in the application parm. If the parm is not set then there are defaults
 * in the servcie endpoint to send the application to, 
 * 
 *
 * Example usage: 
 * 
<pre>
loginServiceProvider.url("my/end/point/forRedirect");
loginServiceProvider.application("rock-properties.html");
...
loginService.login();
</pre>
 *
 *
 *
 */

.provider("loginService", function LoginServiceProvider() {	
	// By default it returns to / but you can give it a full path in your config 
	var application = "",
		baseUrl = 'service/loginState/login';
	
	// Change the url here
	this.url = function(where) {
		baseUrl = where;
	};

	this.application = function(path) {
		if(!path) {
			path = "";
		}
		application = "?application=" + encodeURIComponent(path); 
	};
	
	this.$get = [function() {
		return {
			login : function() {
				window.location.href = baseUrl + application;
			}
		};
	}];
});

})(angular);