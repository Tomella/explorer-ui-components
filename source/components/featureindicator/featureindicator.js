/*!
 * Copyright 2015 Geoscience Australia (http://www.ga.gov.au/copyright.html)
 */
(function(angular, JSON) {

'use strict';

angular.module('explorer.feature.indicator', ['explorer.projects'])

.factory('indicatorService', ['$log', '$q', '$rootScope', 'httpData', 'projectsService', 'assetsService', function($log, $q, $rootScope, httpData, projectsService, assetsService) {
	// Maybe we should set up a configuration service
	var url = "service/asset/counts",
		lastPromise = null,
		md5 = null,
		lastTime = null;
	return {		
		
		checkImpact : function(extents) {
			var deferred, startTime;
			
			startTime = lastTime = new Date();
			
			if(lastPromise) {
				// Get rid of the last one as it is usurped. 
				lastPromise.resolve(null);
			}
			deferred = lastPromise = $q.defer(); 
			projectsService.getCurrentProject().then(function(project) {
				
				// piggyback off explorer assets
				project = "Explorer";

				httpData.post(url, {
						wkt:extents,
						md5:md5,
						project:project
				}).then(function (response) {
                    var data = response.data, status = response.status;
					// If a subsequent request has come in we don't want to update
					// the counts but there is no cancel on a http request.
					if(startTime == lastTime && data.refreshRequired) {
						if(status == 200) {
							assetsService.getAssets().then(function(assets) {
								var countMap = data.countMap;
								md5 = data.md5;
								angular.forEach(assets, function(asset, key) {
									if(countMap[key]) {
										asset.count = countMap[key];
									} else {
										asset.count = 0;
									}
								});
							});
						} else {
							var message = "We have problem checking indicators.";
							if(data) {
								if(angular.isString(data)) {
									message = JSON.parse(data);
								}
								if(data.error) {
									message = data.error;
								}
							}
							// $log.debug(message);
						}
					} else {
						// $log.debug("This check does not need applying.");
					}
					deferred.resolve(data);
					lastPromise = null;
				});
			});
			return deferred.promise;
		}
	};
}]);

})(angular, JSON);