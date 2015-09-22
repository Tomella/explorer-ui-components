/*!
 * Copyright 2015 Geoscience Australia (http://www.ga.gov.au/copyright.html)
 */
(function(angular) {

	
'use strict';

angular.module("explorer.projects", [])

.provider('projectsService', function ProjectsServiceProvider() { 
	var currentProject = "<NONE>";

	this.$get =  ['$q', '$timeout', 'httpData', function ($q, $timeout, httpData) {
		var baseUrl = 'service/appConfig/projects?t=';
	
		return {
			getCurrentProject : function() {
				return $q.when(currentProject);
			},
		
			getProjects : function() {
				var deferred = $q.defer();
				if(this.projects) {				
					$timeout((function() {
						deferred.resolve(this.projects);
					}).bind(this));
				}
                httpData.get(baseUrl + (new Date()).getTime()).then((function(response) {
					deferred.resolve(this.projects = response && response.data);
				}).bind(this));
			
				return deferred.promise;
			}
		};
	}];
	
	this.setProject = function(project) {
		currentProject = project;
	};
});


})(angular);