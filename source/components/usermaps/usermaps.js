/*!
 * Copyright 2015 Geoscience Australia (http://www.ga.gov.au/copyright.html)
 */

'use strict';

angular.module('explorer.usermaps', ['explorer.persist.local', 'explorer.flasher', 'explorer.vector'])

.directive("addMaps", ['userMapService', 'persistService', 'flashService', 'vectorService', 
                     function(userMapService, persistService, flashService, vectorService) {
	return {
		templateUrl : "components/usermaps/addmaps.html",
		controller : ['$scope', function($scope) {
			var template = {
					assetId:"",
					name:"",
					description:"",
					url:"",
					legendUrl:"",
					layers:[],
					projection:"EPSG:3857",
					thumbnailUrl:""	
				},
				oldMapData = "";
	
			persistService.getItem("userMaps").then(function(maps) {
				if(maps) {
					maps.forEach(function(map) {
						// Check for legacy form of layers
						if(angular.isString(map.layers)) {
							map.layers = map.layers.split(",");
						}
					});
					$scope.maps = maps;
				} else {
					$scope.maps = [];
				}
				oldMapData = JSON.stringify($scope.maps);
			});
	
			vectorService.restore().then(function(vectors) {
				$scope.vectors = vectors;
			});	
	
			$scope.active = null;
			
			$scope.status = {
				mapOpen : false,
				vectorOpen : false
			};
	
			$scope.clearOpen = function() {
				$scope.status.mapOpen = $scope.status.vectorOpen = false;
			};			
			
			$scope.setOpen = function(name) {
				$scope.clearOpen();
				$scope.status[name + "Open"] = true;
			}
			
			$scope.work = angular.copy(template);
	
			$scope.editMap = function() {
				$scope.status.edit = true;
				$scope.status.editDisplayed = this.map.displayed; 
				$scope.setOpen("map");
				$scope.work = this.map;
				flashService.add("Updates are immediately saved.", 3000);
			};
			
			$scope.toggleShow = function() {
				userMapService.toggleShow(this.map);
			};
	
			$scope.makeActive = function() {
				$scope.active = wrap(this.map);
			};
	
			$scope.addMap = function() {
				var clone = $scope.work;
				if($scope.status.edit) {
					$scope.status.edit = false;
				} else {
					clone.assetId = "map" + Date.now();
					$scope.maps.push(clone);					
				}
				// 	Reset everything
				userMapService.removeLayer(clone);	
				$scope.clearOpen();
				$scope.work = angular.copy(template);
				flashService.add("Your map has been saved.", 3000);
				persistMaps();
			};
	
			$scope.addLayer = function() {
				var quit = false,
				value = this.workLayer.trim();
				if(!value) {
					return;
				}
				$scope.work.layers.forEach(function(item) {
					quit |= item == value; 
				});
				if(quit) {
					flashService.add("Duplicate layer names are not allowed", 3000);
				} else {
					flashService.add("Refreshing view with new layer.", 3000);
					$scope.work.layers.push(value);
					this.workLayer = "";
					userMapService.refreshLayer($scope.work, true);
					persistExistingMaps();
				}
			};
	
			$scope.shuffleUp = function() {
				var index = $scope.work.layers.indexOf(this.layer);
				if(index == 0) {
					return;
				}
				flashService.add("Refreshing view with new layer order.", 3000);
				move($scope.work.layers, index, index - 1);
				userMapService.refreshLayer($scope.work, true);
				persistExistingMaps();
			};
	
			$scope.shuffleDown = function() {
				var index = $scope.work.layers.indexOf(this.layer);	
				if(index == $scope.work.layers.length - 1) {
					return;
				}
				flashService.add("Refreshing view with new layer order.", 3000);
				move($scope.work.layers, index, index + 1);
				userMapService.refreshLayer($scope.work, true);
				persistExistingMaps();
			};
			
			$scope.removeLayer = function() {
				var index = $scope.work.layers.indexOf(this.layer);
				$scope.work.layers.splice(index, 1);
				if($scope.work.layers.length) {
					flashService.add("Refreshing view with new layer order.", 3000);
				} else {
					flashService.add("No preview of map with no layers.", 3000);			
				}
				userMapService.refreshLayer($scope.work, true);
				persistMaps();
			};
	
			$scope.clear = function() {
				$scope.work = angular.copy(template);
				$scope.status.edit = false;
				$scope.clearOpen();
			};
	
			$scope.isTestable = function() {
				return $scope.work && $scope.work.url && $scope.work.layers;
			};
			
			$scope.isComplete = function() {
				return $scope.isTestable() && $scope.work.name;
			};
	
			$scope.removeMap = function() {
				var index = $scope.maps.indexOf(this.map);
				if (index > -1) {
					userMapService.removeLayer(this.map);
					$scope.maps.splice(index, 1);
					if(this.map == $scope.active) {
						$scope.active = null;
					}
				}
				$scope.status.edit = false;
				persistMaps();
			};
			
			$scope.$watch("removalCandidate", function(candidate) {
				if(candidate) {
					// Show modal dialog
				} else {
					// Hide modal dialog
				}
			});

			$scope.$watch("status.open", function(newValue, oldValue) {
				if(newValue != "map" && oldValue == "map") {
					userMapService.refreshLayer($scope.work, $scope.status.editDisplayed);
					$scope.work = angular.copy(template);
					$scope.status.edit = false;
					$scope.status.editDisplayed = false;
					persistMaps();
				}
			});
	
			function move(array, oldIndex, newIndex) {
				if (newIndex >= array.length) {
					var k = newIndex - array.length;
					while ((k--) + 1) {
						array.push(undefined);
					}
				}
				array.splice(newIndex, 0, array.splice(oldIndex, 1)[0]);
				return array; 
			}	
	
			function reduceMap(map) {
				var reduction = {};
				angular.forEach(template, function(item, key) {
					reduction[key] = map[key]; 
				});
				return reduction;
			}
			
			function persistExistingMaps() {
				if($scope.status.edit) {
					persistMaps();
				}
			}
			
			function persistMaps() {
				// 	We don't want all the decorated stuff hanging off it so  we reduce it back.
				var maps = [];
				if($scope.maps) {
					$scope.maps.forEach(function(map) {
						maps.push(reduceMap(map));
					});
				}
				persistService.setItem("userMaps", maps);
			}
	
			function wrap(map) {
				if(map.isWrapped) {
					return map;
				}
				
				map.isWrapped = true;
				if(!map.layer) {
					userMapService.addLayer(map, false);
				}
		
				map.handleShow = function() {
					if(!this.layer.visibility) {
						this.layer.setVisibility(true);
					} else {
						this.layer.setVisibility(false);
					}
					return this.layer.visibility;
				}
				return map;
			}
		}]
	};	
}])

.factory("userMapService", ['mapService', '$q', function(mapService, $q) {
	var maps = [];
	
	return {
		toggleShow : function(details) {
			if(details.layer && details.layer.map) {
				this.removeLayer(details);
			} else {
				this.addLayer(details);
			}			
		},
		
		refreshLayer : function(details, visible) {
			var deferred;
			if(details.layer) {
				deferred = $q.defer();
				this.removeLayer(details).then(function(map) {
					if(visible) {
						this.addLayer(details);
						deferred.resolve(details);
					}					
				}.bind(this));
				return deferred.promise;
			} else if(visible && details.url && details.layers && details.layers.length > 0) {
				return this.addLayer(details);					
			}
			return $q.when(details);
		},
		
		addLayer : function(details, visible) {
			var deferred = $q.defer();
			if(typeof visible == "undefined") {
				visible = true;
			}
			
			details.displayed = visible;
			
			if(details.layer) {
				if(details.layer.map) {
					details.layer.setVisibility(visible);
					return $q.when(details);
				} else {
					mapService.getMap().then(function(map) {
						map.addLayer(details.layer);
						deferred.resolve(details);
					});
				}
			} else {
				details.type = "WMS";
				details.param1 = details.url;
				details.param2 = {
					layers:details.layers,
					transparent:true
				};
				details.param3 = {
					visibility:visible,
					isBaseLayer:false,
					opacity:1,
					legend : details.legend
				}
				details.layer = mapService.createLayer(details);
				mapService.getMap().then(function(map) {
					map.addLayer(details.layer);
					deferred.resolve(details);
				});
			}
			return $q.promise;
		},
				
		removeLayer : function(details) {
			if(details.layer && details.layer.map) {
				var deferred = $q.defer();
				mapService.getMap().then(function(map) {
					map.removeLayer(details.layer);
					details.layer = null;
					details.displayed = false;
					deferred.resolve(details);
				});
				return deferred.promise;
			}
			return $q.when(details)
		}
	};
}]);