/*!
 * Copyright 2015 Geoscience Australia (http://www.ga.gov.au/copyright.html)
 */
(function(angular) {
	

'use strict';

angular.module("explorer.waiting", [])

.factory("waiting", ['$q', function($q) {
	return {
		wait : function() {
			return new QAll();
		}
	};
	
	function QAll() {
		this.waiting = [];
		this.length = 0;
		this.waiter = function() {
			var deferred = $q.defer();
			this.waiting.push(deferred);
			this.length++;
			
			return deferred;
		};
		
		this.resolve = function(result) {
			this.waiting.forEach(function(promise) {
				promise.resolve(result);
			});
			this.waiting = [];
			this.length =0;
		};
		
		this.reject = function(result) {
			this.waiting.forEach(function(promise) {
				promise.reject(result);
			});
			this.waiting = [];
			this.length =0;
		};
		
		this.notify = function(result) {
			this.waiting.forEach(function(promise) {
				promise.notify(result);
			});
		};
	}
}]);

})(angular);