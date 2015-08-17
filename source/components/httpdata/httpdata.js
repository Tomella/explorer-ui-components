/*!
 * Copyright 2015 Geoscience Australia (http://www.ga.gov.au/copyright.html)
 */

'use strict';

angular.module("explorer.httpdata", [])

.factory('httpData', ['$http', '$q', function($http, $q){
	// Just a convenience wrapper around $http
	return {
		get : function(url, options) {
			return this._method("get", url, options);
		},
		
		post : function(url, options) {
			return this._method("post", url, options);
		},
		
		put : function(url, options) {
			return this._method("put", url, options);
		},
		
		_method : function(method, url, options) {
			var deferred = $q.defer();
			$http[method](url, options).then(function(response){
					if(!response) {
						deferred.resolve(null);
					} else {
						deferred.resolve(response.data);
					}
				},
				function(err) {
					deferred.reject(err);
				}
			);
			return deferred.promise;			
		}		
	};
}]);