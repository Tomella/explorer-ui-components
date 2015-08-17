/**
 * @ngdoc object
 * @name explorer.tabs
 * @description
 *
 * <p>Used to control the show/hide/resize of tabs.
 * Application specific implementation should be added via a supplementary module and directives.</p>
 * 
 * General panelling is provided by bgDirectives
 * 
 * <p>e.g. Rock Props uses:</p>
 * <ul>
 * <li>rocks/tabs/tabs.html (defines app specific tabs and their respective directives)</li>
 * <li>rocks/tabs/rocks-tabs.js (defines the core tabsMain directive/template, and supporting content)</li>
 * </ul>
 * <p>So to use:</p>
 * <ol>
 * <li>include explorer.tabs module and resources</li>
 * <li>include assets/bg-splitter/*</li>
 * <li>define custom tabs and directives -> app-dir/tabs/</li>
 * <li>add tabsMain directive to your index.html, right below mapMain</li>
 * </ol>
 * 
 * 
 */
(function(angular) {
'use strict';
	
	
angular.module('explorer.tabs', [])

.controller("tabsController", ['$scope', '$document', function($scope, $document) {
	
	var minWidth = 300;
	var winWidth = window.innerWidth || document.documentElement.clientWidth;
	var widthPersist = 540; // using 0 width when inactive to prevent obscuring the map
	
	$scope.view = '';
	$scope.contentWidth = 0;
	$scope.contentLeft = 0;
	$scope.winHeight = window.innerHeight || document.documentElement.clientHeight;
	
	$scope.setView = function(view){
		
		if($scope.view === view){
			$scope.view = '';
			widthPersist = $scope.contentWidth;
			$scope.contentWidth = 0;
			$scope.contentLeft = 0;
		} else {
			$scope.view = view;
			$scope.contentWidth = widthPersist;
			$scope.contentLeft = $scope.contentWidth;
		}
	};
	
	$scope.catchResize = function(){
	
		$document.on("mousemove", mousemove);
		$document.on("mouseup", mouseup);
		
        function mousemove($event) {
        	$scope.doResize($event);
        }
        
        function mouseup() {
        	$document.off("mousemove", mousemove);
        	$document.off("mouseup", mouseup);
        }
	};
	
	$scope.doResize = function($event){
		
		var width = winWidth - $event.pageX;
		width = (width > minWidth) ? width : minWidth;
		
		$scope.contentWidth = width;
		$scope.contentLeft = width;
		widthPersist = width;
		$scope.$apply();
	};
	
	$scope.callback = function() {
		//console.log("Calling back")
	};
	
}]);

})(angular);