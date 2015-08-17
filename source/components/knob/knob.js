/*!
 * Copyright 2015 Geoscience Australia (http://www.ga.gov.au/copyright.html)
 */

'use strict';

angular.module("knob", [])

.directive("knob", ['$document', function($document){
	var defaultConfig = {
			circleColor : "#A33F1F",
			min : 0,
			max : 10,
			startAngle: 0,
			pointerColor:'#72C7E7',
			degrees:30,
			label : ""
		},
		index = 1;
		
	return {
		templateUrl : "components/knob/knob.html",
		restrict : "AE",
		scope : {
			knob : "=",
			value : "=",
			disabled : "=?",
			mapToPercentage : "=?",
			mapFromPercentage : "=?"
		},
		
		link : function(scope, element) {
			var i,
				events = {
					keydown: handleKeyEvents.bind(this),
					mousewheel: handleWheelEvents.bind(this),
					DOMMouseScroll: handleWheelEvents.bind(this),
					touchstart: handleMove.bind(this, 'touchmove', 'touchend'),
					mousedown: handleMove.bind(this, 'mousemove', 'mouseup')
				};

			
			// Need a unique ID.
			scope.knobShadow = "knobshadow_" + (index++);
			element[0].tabIndex = 0;
			
			for (var event in events) {
			    element.on(event, events[event]);
			}	
			
			if(!scope.knob.ticks && !scope.knob.step && angular.isNumber(scope.knob.min) && angular.isNumber(scope.knob.max)) {
				scope.knob.steps = scope.knob.max - scope.knob.min;
				scope.knob.step = 1;
			}
			
			scope.config = angular.extend({}, defaultConfig, scope.knob);
			
			if(scope.knob && scope.knob.ticks) {
				scope.ticks = scope.config.ticks = scope.knob.ticks;
			} else {
				scope.ticks = [];
				for(i = 0; i <= scope.config.steps; i++) {
					scope.ticks[i] = scope.config.min + i * scope.config.step;
				}
				scope.config.ticks = scope.ticks;
			}			

			scope.range = (scope.ticks.length - 1) * scope.config.degrees; 
			
			scope.checkDisabled = function() {
				if(scope.disabled) {
					return "opacity:0.5;cursor:auto";
				} else {
					return "cursor:grab";
				}
			};
			
			// Use linear mapper if none provided
			if(!scope.mapToPercentage) {
				scope.mapToPercentage = function(value) {
					var range = this.max - this.min;				
					return (value - this.min) / range * 100;
				};
			}

			// Use linear mapper if none provided
			if(!scope.mapFromPercentage) {
				scope.mapFromPercentage = function(percent) {
					return this.min + (this.max - this.min) * percent / 100
				};
			}
			
			scope.$watch("value", function(value) {
				scope.percentage = scope.mapToPercentage.bind(scope.config)(value);
				scope.angle = scope.config.startAngle + scope.range * scope.percentage / 100;
			});						
			
			function handleKeyEvents(e) {	
			   var keycode = e.keyCode;
			   
			   if(!scope.disabled && keycode >= 37 && keycode <= 40) {
				   scope.$apply(function() {
					      e.preventDefault();
					      var f = 1 + e.shiftKey * 9;
					      changed({37: -1, 38: 1, 39: 1, 40: -1}[keycode] * f);
				   });
			   }
			}			
			
			function handleWheelEvents(e) {
				if(scope.disabled) {
					return;
				}
				scope.$apply(function() {
					var deltaX = -e.detail || e.wheelDeltaX,
						deltaY = -e.detail || e.wheelDeltaY,
						val = deltaX > 0 || deltaY > 0 ? 1 : deltaX < 0 || deltaY < 0 ? -1 : 0;
						
					e.preventDefault();
					changed(val);
				});
			}
			
			function handleMove(onMove, onEnd) {
				var bounder = element[0].getBoundingClientRect();
				if(scope.disabled) {
					return;
				}
				
			    scope.centerX = bounder.left + bounder.width / 2;
			    scope.centerY = bounder.top + bounder.height / 2;
			    
			    $document.on(onMove, updateWhileMoving);
			    $document.on(onEnd, function() {
			    	$document.off(onMove, updateWhileMoving);
			    });
			}
			
			function updateWhileMoving(event) {
			    var e = event.changedTouches ? event.changedTouches[0] : event,
			        x = scope.centerX - e.pageX,
			        y = scope.centerY - e.pageY,
			        deg = Math.atan2(-y, -x) * 180 / Math.PI + 90 - scope.config.startAngle,
			        percent, value, step;
			    
			    event.preventDefault();
			    
			    if (deg < 0) {
			      deg += 360;
			    }
			    deg = deg % 360;
			    
			    
			    if (deg <= scope.range) {
			      percent = Math.max(Math.min(1, deg / scope.range), 0);
			    } else {
			      percent = +(deg - scope.range < (360 - scope.range) / 2);
			    }
			    percent = percent * 100;
			    
			    scope.value = scope.mapFromPercentage.bind(scope.config)(percent);			    
			    scope.$apply();
			}
			
			function changed(direction) {
				var percentage;
			    scope.angle = limit(scope.angle + (scope.config.degrees * direction));
			    percentage = (scope.angle - scope.config.startAngle) / scope.range * 100;
			    scope.value = scope.mapFromPercentage.bind(scope.config)(percentage);
			}
			
			function limit(value) {
				var max = scope.config.startAngle + scope.range;
				return value < scope.config.startAngle?scope.config.startAngle : value > max?max : value; 
			}
		}
	}
}]);