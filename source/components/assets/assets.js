/*!
 * Copyright 2015 Geoscience Australia (http://www.ga.gov.au/copyright.html)
 */

(function(angular) {

'use strict';

angular.module('explorer.assets', ['explorer.projects'])

.factory('assetsService', ['$log', '$q', 'httpData', 'projectsService', '$timeout', function($log, $q, httpData, projectsService, $timeout) {
	var assets,
	promises = [],
	baseUrl = "service/asset/assets/",
	sessionTime = Date.now();
	
	function afterProject(project) {	
        httpData.get(baseUrl + project + "?t=" + sessionTime, {cache:true}).then(function(response) {
			assets = response && response.data;
			promises.forEach(function(promise) {
				promise.resolve(assets);
			});
		});
	}
	
	projectsService.getCurrentProject().then(afterProject);

	return {
		getAsset : function(key) {
			return assets[key];
		},
	
		getAssets : function() {
			var deferred;
			if(assets) {
				return $q.when(assets);
			}
			
			deferred = $q.defer();
			promises.push(deferred);
			return deferred.promise;
		},
	
		getReferenceFeatureClasses : function() {
			var deferred = $q.defer();
			this.getAssets().then(function(assets) {
				var response = [];
				angular.forEach(assets, function(asset, key) {
					if(asset.assetType == "REFERENCE_FEATURE_CLASS") {
						this.push(asset);
					}
				}, response); 
			
				deferred.resolve(response);
			});
			return deferred.promise;
		},
	
		// A resource can be either a cartographic component or an asset.
		getResourceKey : function(resource) {
			return resource.assetId;
		},
	
		getResource : function(key) {
			return this.getAsset(key);
		}
	};
}]);

})(angular);