/*!
 * Copyright 2015 Geoscience Australia (http://www.ga.gov.au/copyright.html)
 */
(function($, angular) {

'use strict';

angular.module('mars.splitter', [])

.directive('marsExpand', ['$rootScope', '$timeout', function($rootScope, $timeout) {
	return {
		link : function(scope, element, attrs) {			
			var expand = function() {
				// An ugly little pane opener. You'd think they'd have a method to call.
				var splitter = $("#horizontal").data("kendoSplitter");
				if(scope.marsRightView == attrs.marsExpand) {
					splitter.collapse(".mainSplitterRight");
					scope.marsRightView = null;
				} else {
					splitter.expand(".mainSplitterRight");
					scope.marsRightView = attrs.marsExpand;				
					$rootScope.$broadcast("show.right.panel", attrs.marsExpand);
				}
			};
			
			element.on("click", function() {
				$timeout.cancel(scope.marsRightExpandTimeout);
				expand();
			});
			element.on("mouseenter", function(event) {
				scope.marsRightExpandTimeout = $timeout(expand, 400);
			});
			element.on("mouseleave", function() {
				$timeout.cancel(scope.marsRightExpandTimeout);
			});		
			
			$rootScope.$on("right.tab.deselected", function() {
				$timeout(function() {
					$("#horizontal").data("kendoSplitter").collapse(".mainSplitterRight");
					scope.marsRightView = null;
				});
			});
		}
	};
}])

.directive('marsSplitter', ['$rootScope', '$timeout', 'mapService', function($rootScope, $timeout, mapService) {
	return {
		link : function(scope, element, attrs) {
			var self = this;
			mapService.getMap().then(function(map) {
				this.map = map;
			}.bind(this));
			element.kendoSplitter({
				panes : [
					{
						collapsible : false
					},
					{
						collapsible : true,
						collapsed : true,
						size : "360px"
					}
				],
				resize : function(event) {
					setTimeout(function() {
						var widthRight = element.find(".rightPane").width() + 7;
						$(".marsExpandContainer").css("right", widthRight + "px");
						
						// Workaround for kendo not re-sizing stuff properly once the splitter is dragged.
						//event.sender.element.height("").css("height", "100%").find("> div").height("").css("height", "100%");
						// self.map && self.map.updateSize();
					}, 0);
				}
			});

			$rootScope.$on("vertical.tab.deselected", function() {
				$timeout(function() {
					element.data("kendoSplitter").collapse(".rightPane");
				});
			});
			
		}
	};
}])

.controller('MapSlideController', ['$scope', '$rootScope', '$timeout', function($scope, $rootScope, $timeout) {	
	$scope.controller = "MapSlideController";
	$scope.scrollTop = 0;
	$scope.filterNames = {
		point:true,
		line:true,
		area:true,
		network:true
	};
	
	$scope.cancelHide = function() {
		$timeout.cancel($scope.hideTimeout);
	};
	
	$scope.delayedRightHide = function() {
		if(!$scope.pinnedRight) {
			$scope.hideRightTimeout = $timeout(function() {
				$scope.lastView = "";
				$rootScope.$broadcast('right.tab.deselected');
			}, 3000);
		}
	};
	
	$scope.cancelRightHide = function() {
		$timeout.cancel($scope.hideRightTimeout);
	};
	
	$scope.show = function(what) {
		$timeout.cancel($scope.showTimeout);
		if(what == $scope.lastView) {
			$scope.showTimeout = $timeout(function() {
				$scope.lastView = "";
				$rootScope.$broadcast('vertical.tab.deselected');
			},400);
		} else {
			$timeout(function() {
				$scope.lastView = what;
				$rootScope.$broadcast('vertical.tab.selected', what);
			}, 400);
		}
	};	
		
	$scope.$on("pinned.right.changed", function(event, value) {
		$scope.pinnedRight = value;
	});
	
	$scope.$on("pinned.left.changed", function(event, value) {
		$scope.pinnedLeft = value;
	});

		
	$scope.toggleShow = function(element) {
		if(!element) {
			element = this.feature;
		}
		element.displayed = element.handleShow();
	};
	
	$scope.viewLegend = function(feature) {
		//console.log(feature);
	};
}]);

})($, angular);