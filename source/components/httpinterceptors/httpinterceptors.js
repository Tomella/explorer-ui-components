/*!
 * Copyright 2015 Geoscience Australia (http://www.ga.gov.au/copyright.html)
 */
(function(angular, window) {

'use strict';

/**
 * @description
 * Aggregate the message and authentication interceptors
 */
angular.module('explorer.httpinterceptors', ['explorer.httpinterceptors.message', 'explorer.httpinterceptors.authentication']);


/**
 * @description
 * The message interceptor looks at data payload and if it has the attributes of a message displays it as such.
 */
angular.module('explorer.httpinterceptors.message', [])

.factory('messageHttpInterceptor', ['$q', '$log', 'messageService', function ($q, $log, messageService) {
    var setMessage = function (response) {
    	var message, data = response?response.data:null; 
    	
        //if the response has a text, code and a type (or severity) property, it is a message to be shown
        if (angular.isObject(data) && "text" in data && "code" in data && ("type" in data || "severity" in data)) {
            message = {
                text: response.data.text,
                type: (response.data.type?response.data.type:response.data.severity).toLowerCase(),
                show: true
            };
            messageService[message.type](message.text);
        }
    };
    
    return {
    	response : function(response) {
            setMessage(response);
            return response;
    	},
    	
    	responseError : function(response) {
            setMessage(response);
            return $q.reject(response);
        }
    };
}])
.config(['$httpProvider', function($httpProvider) {	
    //configure $http to catch message responses and show them
	$httpProvider.interceptors.push('messageHttpInterceptor');
}]);

/**
 * @description 
 * An authentication interceptor. Handles 401 and 403 errors and 302 redirects.
 * Notice it looks for a status of 0 as some browsers report redirects as 0.
 */
angular.module('explorer.httpinterceptors.authentication', [])

.factory('expHttpInterceptor', ['$rootScope', '$q', function ($rootScope, $q) {
	return {
		responseError : function (response) {
            if (!response || response.status === 401 || response.status === 0 || response.status === 302) {
               	// This forces a redirect to the index.html which means it will 
               	// get a redirect with a 302 that will take them to the authentication page.
              	window.location.reload();
            } else if (response.status === 403) {
                $rootScope.$broadcast('unauthorized');
            } else {
              	// Let the application handle it
            	return response;
            }
        }
	};
}])
.config(['$httpProvider', function($httpProvider) {	
    //configure $http to show a login dialog whenever a 401 unauthorized response arrives
	$httpProvider.interceptors.push('expHttpInterceptor');
}]);

})(angular, window);