/*!
 * Copyright 2015 Geoscience Australia (http://www.ga.gov.au/copyright.html)
 */

(function(angular) {
	
'use strict';

angular.module('explorer.drag', [])

.directive('dragParent', ['$document', '$timeout', function($document, $timeout) {
    return {
    	link : function(scope, element, attr) {
    		var container = null, offsetX, offsetY, bounds, timeout;
        	element.css({
        		cursor: 'pointer'
        	});

        	element.on('mousedown', function(event) {
        		// Prevent default dragging of selected content
        		event.preventDefault();
        		if(!container) {
        			container = element;
                	if(attr.parentclass) {
                		container = element.closest("." + attr.parentclass);
                	}
        		}

        		
        		timeout = $timeout(mouseup, 2000);
        		
            	bounds = container[0].getBoundingClientRect();
            	offsetY = event.pageY - bounds.top;
            	offsetX = event.pageX - bounds.left;
        		$document.on('mousemove', mousemove);
        		$document.on('mouseup', mouseup);
        	});

        	function mousemove(event) {
        		var x = event.pageX - offsetX, 
        			y = event.pageY - offsetY,
        			rect = document.body.getBoundingClientRect();
        			
        		if(x < 10 - bounds.width ) {
        			x = 10 -bounds.width;
        		} else if(x > rect.width - 10) {
        			x = rect.width - 10;
        		}
    			
        		if(y < 0) {
        			y = 0;
        		} else if(y > rect.height - 25) {
        			y = rect.height - 25;
        		}
        		
        		container.css({
        			top: y + 'px',
        			left:  x + 'px',
        			right: '',
        			bottom:''
        		});	
        		$timeout.cancel(timeout);
        		timeout = $timeout(mouseup, 2000);
        	}

        	function mouseup() {
        		$document.off('mousemove', mousemove);
        		$document.off('mouseup', mouseup);
        	}
    	}
    };
}]);

})(angular);