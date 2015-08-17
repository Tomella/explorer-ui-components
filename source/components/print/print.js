/*!
 * Copyright 2015 Geoscience Australia (http://www.ga.gov.au/copyright.html)
 */

'use strict';

angular.module('mars.print', [])

.directive('marsPrintMap', [function() {
	return {
		template : '<i class="fa fa-print"></i>',
		link : function(scope, element) {	
			element.on("click", function() {
				window.print();
			});
		}
	};
}]);