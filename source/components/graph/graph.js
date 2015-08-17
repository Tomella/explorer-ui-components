/*!
 * Copyright 2015 Geoscience Australia (http://www.ga.gov.au/copyright.html)
 */
(function(angular, d3) {

'use strict';

angular.module("graph", [])

.directive("explorerGraph", ['$log', function($log) {
	var WIDTH = 1000,
	HEIGHT = 90;

	return {
		templateUrl : "components/graph/lineGraph.html?v=1",
		scope:{
			data : "=",
			config : "=",
			enter : "&",
			leave : "&",
			move : "&",
			click : "&",
			showZeroLine : "="
		},
		controller : ['$scope', function($scope) {	
			$scope.round = function(val) {
				return Math.round(val);
			};
			
			$scope.showZeroLine = !!$scope.showZeroLine;
		}],
	
		link : function(scope, element) {

			scope.mouseLeave = function(event) {
				scope.position = null;
				if(scope.leave) {
					scope.leave({event:event});
				}
			};
			
			scope.mouseEnter = function(event) {
				if(scope.enter) {
					scope.enter({event:event});
				}
			};
			
			scope.mouseMove = function(event) {
				calculatePosition(event);
				event.position = scope.position;
				if(scope.move) {
					scope.move({event:event});
				}
			};
			
			scope.mouseClick = function(event) {
				event.preventDefault();
				if(scope.click) {
					event.position = scope.position;
					scope.click({event:event});
				}	
			};
			
			scope.$watch("data", processData);
			processData();

			function calculatePosition(event) {
				var svgContainer = element.find("svg")[0],
					point, points, graphY, graphX,
	            	rect = svgContainer.getBoundingClientRect(),
	                ratio = 1050/rect.width,
	                index = Math.floor((event.pageX - rect.left) * ratio - 48); 	            

	            if(scope.lastIndex == index) {
	            	return;
	            } 
				
	        	scope.lastIndex = index;
	            if(index > -1 && index < 1000) {
	            	// TODO: We want to get a collection of points and call the event handler 
	            	// point = scope.points[index];
					points = [];
					
					scope.data.forEach(function(dataset) {
						var key = Math.round(index * dataset.data.length/1000),
							thisPoint = dataset.data[key];
						$log.debug(key);
						points.push({
							index:key,
							point: thisPoint
						});
					});
					
	            	graphX = index;
	            	
	            	scope.position = {
	            		index : index,
	            		percentX : (index + 1)/10,
	            		rangeY : scope.rangeY,
	            		y : {
	            			range : scope.rangeY,
	            			max: scope.maxY,
		            		min : scope.minY,    			
	            		},
	            		graphX: graphX,
	            		graphY: event.pageY - rect.top,
	            		pageX : event.pageX,
	            		pageY : event.pageY,
	            		points : points,
	            		point : points.length > 0?points[0].point:null
	            	};
	            } else {
	            	scope.position = null;
	            }
			}
			
			function dummyResponse() {
				return "";
			}
		
			function processData(data) {
				
				if(!data) {
					data = [[]];
				}
				$log.debug(data.length);
				var points = [];
				data.forEach(function(parts) {
					if(parts.data) {
						points.push.apply(points, parts.data);
					}
				});

				scope.minY = d3.min(points, function(d) { return d.z; });
				scope.maxY = d3.max(points, function(d) { return d.z; });
				scope.rangeY = scope.maxY - scope.minY;
				scope.yTicks = ticks(scope.minY, scope.maxY);
				
				scope.y = d3.scale.linear().range([HEIGHT, 0]);
				scope.y.domain(d3.extent(points, function(d) {return d.z;}));
			
				function ticks(min, max, count) {
					var step, range = max - min;
					if(!count) {
						count = 5;
					}
				
					// TODO make this a bit nicer or see if D3 can do it for us
					if(range < 5) {
						step = 1;
					} else if(range < 12) {
						step = 2;
					} else if(range < 24) {
						step = 5;
					} else if(range < 60) {
						step = 10;
					} else if(range < 120) {
						step = 20;
					} else if(range < 240) {
						step = 50;
					} else if(range < 600) {
						step = 100;
					} else if(range < 1200) {
						step = 200;
					} else if(range < 2400) {
						step = 500;
					} else if(range < 6000) {
						step = 1000;
					} else if(range < 12000) {
						step = 2000;
					} else if(range < 24000) {
						step = 5000;
					} else if(range < 60000) {
						step = 10000;
					} else {
						step = 20000;
					}
					
					return d3.range(min - Math.abs(min % step) + step, max + (step - Math.abs(max % step)), step);			
				}
			}
		}
	};	
}])

.directive("explorerLine", [function() {
	var WIDTH = 1000,
		HEIGHT = 90;
	
	return {
		restrict :"AE",
		controller : ["$scope", function($scope) {
			function processPoints(data) {
				var points = data.data;
				if(!points || !points.length) {
					$scope.calculateLines = $scope.calculatePath = dummyResponse;
					return;
				}
				
				$scope.minX = 0;
				$scope.maxX = points.length;
				$scope.rangeX = points.length;
				$scope.deltaLength = 1;
				
				var x = d3.time.scale().range([0, WIDTH]),
					y = $scope.y;
				
				x.domain(d3.extent(points, function(d, index) {return index;}));
			
				
				$scope.calculatePath = d3.svg.area().
					interpolate("monotone").
					x(function(d, index) { return x(index);}).
					y0(HEIGHT).
					y1(function(d){
						return y((d.z !== null)?d.z:$scope.minY);
					});
			
				$scope.calculateLine = d3.svg.line().
					interpolate("monotone").
					x(function(d, index) { return x(index);}).
					y(function(d){
						return y((d.z !== null)?d.z:$scope.minY);
					});

				$scope.line = $scope.calculateLine(points);
				$scope.path = $scope.calculatePath(points);
			}

			function dummyResponse() {
				return "";
			}
			
			$scope.$watch("points", processPoints); 
		}]
	};
}]);

})(angular, d3);