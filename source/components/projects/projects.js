/*!
 * Copyright 2015 Geoscience Australia (http://www.ga.gov.au/copyright.html)
 */
(function(angular) {

	
'use strict';

angular.module("explorer.projects", [])

.provider('projectsService', function ProjectsServiceProvider() { 
	var currentProject = "<NONE>";

	this.$get =  ['$q', '$timeout', '$http', function ($q, $timeout, $http) {
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
				$http.get(baseUrl + (new Date()).getTime()).then((function(response) {
					this.projects = response;
					deferred.resolve(this.projects);
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