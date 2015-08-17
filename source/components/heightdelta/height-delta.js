/*!
 * Copyright 2015 Geoscience Australia (http://www.ga.gov.au/copyright.html)
 */

'use strict';

angular.module("explorer.height.delta", [])

.directive('heightDelta', ['$timeout', function($timeout) {
	return {
		link : function(scope, element, attrs) {
			function resize(force) {
				var obj, height, newHeight,
					data = attrs.heightDelta;
				if(data) {
					obj = JSON.parse(data);
					height = $(obj.selector).height();
					newHeight = height + obj.delta;
					if(!obj.min || newHeight > obj.min) {
						element.height(newHeight);
					}
				}
			}		
			$(window).on("resize", function() {
				resize(false); 
			});
			$timeout(function() {
				resize(true);
			});
		}
	};
}]);