/*!
 * Copyright 2015 Geoscience Australia (http://www.ga.gov.au/copyright.html)
 */

'use strict';

angular.module('explorer.header', [])

.controller('headerController', [ '$scope', '$q', '$timeout', function ($scope, $q, $timeout) {

    var modifyConfigSource = function (headerConfig) {
        return headerConfig;
    };

    $scope.$on('headerUpdated', function (event, args) {
        $scope.headerConfig = modifyConfigSource(args);
    });
}])

.directive('explorerHeader', [function() {
	var defaults = {
		heading:"Geoscience Australia",
		headingtitle:"Geoscience Australia",
		helpurl:"help.html",
		helptitle:"Get help about Geoscience Australia",
		helpalttext:"Get help about Geoscience Australia",
		skiptocontenttitle:"Skip to content",
		skiptocontent:"Skip to content",
		quicklinksurl:"/search/api/quickLinks/json?lang=en-US"
	};
	return {
		transclude:true,
		restrict:'EA',
		templateUrl:"components/header/header.html?v=1",
		scope : {
			heading: "=",
			headingtitle:"=",
			helpurl:"=",
			helptitle:"=",
			helpalttext:"=",
			skiptocontenttitle:"=",
			skiptocontent:"=",
			quicklinksurl:"="
		},
		link:function(scope, element, attrs) {
			var data = angular.copy(defaults);
			angular.forEach(defaults, function(value, key) {
				if(!(key in scope)) {
					scope[key] = value;
				}
			});
		}
	};
}]);