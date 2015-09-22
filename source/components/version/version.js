/*!
 * Copyright 2015 Geoscience Australia (http://www.ga.gov.au/copyright.html)
 */
(function(angular) {

'use strict';

angular.module("explorer.version", [])

.directive('marsVersionDisplay', ['httpData', 'versionService', function(httpData, versionService) {
	/**
	 * CIAP theme switcher. Retrieves and stores the current theme to the theme service. 
	 */
	return {
		templateUrl:'components/version/versionDisplay.html',
		link : function(scope) {
			httpData.get(versionService.url()).then(function(response) {
				scope.version = response && response.data.version;
			});
		}
	};	
}])

.provider("versionService", function VersionServiceProvider() {
	var versionUrl = "service/appConfig/version";
	
	this.url = function(url) {
		versionUrl = url;
	};
	
	this.$get = function configServiceFactory() {
		return {
			url : function() {
				return versionUrl;
			}
		};
	};
});

})(angular);