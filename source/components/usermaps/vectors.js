/*!
 * Copyright 2015 Geoscience Australia (http://www.ga.gov.au/copyright.html)
 */

'use strict';

angular.module("explorer.vector", ['explorer.flasher', 'explorer.broker', 'explorer.persist.local', 'explorer.message', 'explorer.config'])

.directive("marsVectorEdit", ['vectorService', 'flashService', 'persistService', 'brokerService', 'messageService', 'configService',
                      function(vectorService, flashService, persistService, brokerService, messageService, configService) {	
	return {
		templateUrl : "components/usermaps/vectorEdit.html",
		require:"^addMaps",
		link : function(scope) {
			configService.getConfig().then(function(config) {
				scope.localClientSessionId = config.localClientSessionId;
			}, 
			function(err) {
				// console.log("What the...");
			});
			brokerService.register("addVectorData", { 
				process:function(message) {
					if(message.data) {
						var data = message.data,
							vector = {
								id:"userVector_" + (new Date().getTime()),
								name:data.vectorName.content,
								description:data.vectorDescription.content,
								dataStr:data.vectorFile.content,
								fileName:data.vectorFile.fileName,
								show: true
							};
						
						vector.layer = vectorService.createLayer(vector.dataStr, vector);
						
						if(vector.layer) {
							scope.vectors[vector.name] = vector;
							vectorService.persist(scope.vectors);
						} else {
							messageService.error("No GML or KML features found. Are you sure that was a valid vector data file?");
						}
					}
				}
			});

			scope.saveVectors = function() {
				scope.cancelVectorEdit();
				vectorService.persist(scope.vectors);
			};
			
			scope.cancelVectorEdit = function() {
				scope.clearOpen();
				scope.status.vectorEdit = false;
				scope.editVector = null;
			};
			
			scope.clearVector = function() {
				// console.log("TODO: clear ve");
			};
		}
	};
}]).directive("vectorsDisplay", ['vectorService', function(vectorService) {
	return {
		templateUrl : "components/usermaps/vectorDisplay.html?v=1",
		restrict : "AE",
		require: '^addMaps',
		link : function(scope, element) {
			scope.showElevation = function() {
				vectorService.showElevation(this.vector);
			};

			scope.showFeatureElevation = function() {
				vectorService.showElevation(this.vector, this.feature);
			};
			
			scope.isPath = function() {
				return this.vector.layer && this.vector.layer.features 
					&& this.vector.layer.features.length == 1 && this.vector.layer.features[0].geometry 
					&& this.vector.layer.features[0].geometry.CLASS_NAME == "OpenLayers.Geometry.LineString";
			};
			
			scope.isFeaturePath = function() {
				return this.feature.geometry 
					&& (this.feature.geometry.CLASS_NAME == "OpenLayers.Geometry.LineString"
						|| this.feature.geometry.CLASS_NAME == "OpenLayers.Geometry.MultiLineString");
			};
			
			scope.toggle = function() {
				if(this.vector.show) {
					vectorService.hideLayer(this.vector.layer);
				} else {
					vectorService.showLayer(this.vector.layer);
				}
				this.vector.show = !this.vector.show;
			};
			
			scope.remove = function() {
				vectorService.hideLayer(this.vector.layer);
				delete scope.vectors[this.vector.name];
				vectorService.persist(scope.vectors);
			};
			
			scope.vectorEdit = function() {
				scope.editVector = this.vector;
				scope.setOpen("vector");
				scope.status.vectorEdit = true;
			};

			scope.panToVector = function() {
				vectorService.panTo(this.vector.layer);
			};
			
			scope.panToFeature = function() {
				vectorService.panToFeature(this.feature);
			};
		}
	};
}]).directive("ajaxForm", ['flashService', '$rootScope', 'asynch', 'configService', function(flashService, $rootScope, asynch, configService){
	return {
		scope : {
			update : "&",
			cancel : "&"
		},
		link : function(scope, element) {
			var flasher;
			
			scope.quit = function() {
				scope.cancel();
			};
			
			element.ajaxForm({
		        beforeSubmit: function(a,f,o) {
		        	scope.cancel();
		        	asynch.expect();
		            o.dataType = "xml";
		            $rootScope.safeApply(function() {
		            	flasher = flashService.add("Processing file...", 4000);
		            });
		        },
		        success: function(data) {
		            $rootScope.safeApply(function() {
		            	flashService.remove(flasher);
		            });
		        }
		    });

		    // helper
		    function elementToString(node) {
		        var oSerializer = new XMLSerializer();
		        return oSerializer.serializeToString(node);
		    }
		}
	}
}]).service("vectorService", ['mapService', 'persistService', '$q', '$rootScope', function(mapService, persistService, $q, $rootScope){
	var PERSIST_KEY = "userVectorLayers",
		vectors = {}, map,
		gmlns = "http://www.opengis.net/gml",
		wfsns = "http://www.opengis.net/wfs",
		kmlns = "http://www.opengis.net/kml";
	
	mapService.getMap().then(function(olMap) {
		map = olMap;
	});
	return {

		_whatType : function (dataStr) {
			if(!dataStr) {
				return null;
			}
			if(dataStr.indexOf(kmlns) > -1) {
				return "kml";
			} else if(dataStr.indexOf(wfsns) > -1) {
				return "wfs"; 
			} else if(dataStr.indexOf(gmlns) > -1) {
				return "gml"; 
			}
		},
		
		_boundsPlusPercent : function(bounds, bufferPercent) {
			var xBuff = (bounds.right - bounds.left) * bufferPercent,
				yBuff = (bounds.top - bounds.bottom) * bufferPercent;
			
			return new OpenLayers.Bounds(
						bounds.left - xBuff,
						bounds.bottom - yBuff,
						bounds.right + xBuff,
						bounds.top + yBuff
					);
		},
		
		persist : function(vectors) {
			var persistData = [];
			angular.forEach(vectors, function(item) {
				var vector = {
					id:item.id,
					name:item.name,
					description:item.description,
					dataStr:item.dataStr,
					show:item.show
				};
				persistData.push(vector);
			});	
			persistService.setItem(PERSIST_KEY, persistData, true);
		},		
		
		restore : function() {
			var self = this,
			 	deferred = $q.defer();;
			mapService.getMap().then(function(map) {
				persistService.getItem(PERSIST_KEY).then(function(layers) {
					var response = {};
					if(layers) {
						layers.forEach(function(item) {
							item.show = false;
							item.layer = self.createLayer(item.dataStr, item);
							// Cull out the corrupt.
							if(item.dataStr && item.name && item.id) {
								response[item.name] = item;
							}
						});
					}
					deferred.resolve(response);
				});
			});
			return deferred.promise;			
		},
		
		createLayer : function(dataStr, details) {
			var format, vector = vectors[details.name],
				type = this._whatType(dataStr);

			if(!vector) {
				if(type == "kml") {
					format = new OpenLayers.Format.KML({
						'internalProjection': map.baseLayer.projection,
						'externalProjection': new OpenLayers.Projection("EPSG:4326"),
						extractAttributes:true,
						extractStyles : true
					});
				} else if(type == "wfs" || type == "gml"){
					format = new OpenLayers.Format.GML({
						'internalProjection': map.baseLayer.projection,
						'externalProjection': new OpenLayers.Projection("EPSG:4326"),
						extractAttributes:true,
						extractStyles : true
					});
				}
				
				if(format) { 
				   	vector = new OpenLayers.Layer.Vector(details.name);
					vector.addFeatures(format.read(dataStr));
					vectors[details.name] = vector;
				}
				
			}
			if(vector && details.show && !vector.map) {
				map.addLayer(vector);
			}
			return vector;
		},
		
		showLayer : function(layer){
			this.hideLayer(layer);
			map.addLayer(layer);
		},
		
		hideLayer : function(layer) {
			if(layer.map) {
				map.removeLayer(layer);
			}
		},
		
		panTo : function(layer) {
			var bounds = this._boundsPlusPercent(layer.getDataExtent(), 0.2);
			mapService.getMap().then(function(map) {
				map.zoomToExtent(bounds);
			});
		},
		
		panToFeature : function(feature) {
			feature.geometry.calculateBounds();
			var bounds = this._boundsPlusPercent(feature.geometry.bounds, 0.2);
			mapService.getMap().then(function(map) {
				feature.geometry.calculateBounds();
				map.zoomToExtent(bounds);
			});
		},
		
		showElevation : function(vector, feature) {
			if(!feature) {
				feature = vector.layer.features[0];
			}
			var geometry = feature.geometry, 
				distance = geometry.clone().transform(new OpenLayers.Projection("EPSG:3857"), new OpenLayers.Projection("EPSG:4326")).getGeodesicLength(),
				data = {length:distance, geometry:geometry, heading:"KML"};
			
			$rootScope.$broadcast("elevation.plot.data", data);
		}
	};
}]);