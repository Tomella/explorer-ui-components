/*!
 * Copyright 2015 Geoscience Australia (http://www.ga.gov.au/copyright.html)
 */

'use strict';

/**
 * Explorer 
 */
angular.module("explorer.modal", [])

.directive("expModal", ['$document', '$animate', 'modalService', function($document, $animate, modalService) {
	return {
		restrict: 'EA',
	    transclude: true,
	    replace:true,
	    scope: { 
	    	iconClass : '@',
	    	title: '@',
	    	containerStyle : '@',
	    	template: '=', 
	    	placement: '@', 
	    	animation: '&', 
	    	onClose : "&",
	    	isOpen: '=',
	    	isModal: '='
	    },
		templateUrl:"components/modal/modal.html",
	    link: function( scope, element ) {    		
    		scope.$watch("isOpen", function(newValue, oldValue) {
    			var extent;
    			if(newValue) {
    				element.css("zIndex", modalService.index())
    				element.on('keyup', keyupHandler);
    			} else {
    				element.off('keyup', keyupHandler);
    				if(newValue != oldValue) {
    					modalService.closed()
    					scope.onClose();
    				}
    			}
	    		scope.$on('$destroy', function () {
	    		    element.off('keyup', keyupHandler);
	    		});
	    	});

    		function keyupHandler(keyEvent) {
    			if(keyEvent.which == 27) {
    				keyEvent.stopPropagation();
    				keyEvent.preventDefault();
    				scope.$apply(function() {
        				scope.isOpen = false;
    				});
    			}
    		}
	    }
	};
}])

.directive("expModalUp", ['$document', '$animate', 'modalService', function($document, $animate, modalService) {
	return {
		link : function(scope, element) {
			element.on("mousedown", function(event) {
				if(scope.isModal) {
					scope.modalIndex = modalService.index();
				}
				element.css("zIndex", modalService.index());
			});
		}
	};
}])

.factory("modalService", [function() {
	// Bootstrap modal backdrop id z-index = 1040 in bootstrap so start modals from here.
	var COUNT_START = 1030,
		count = COUNT_START,
		opened = 0;
	
	return {
		index : function() {
			if(opened == 0) {
				count = COUNT_START;
			}
			opened++;
			return count++;
		},
		closed : function() {
			opened--;
			if(opened < 0) {
				opened = 0;
			}
		}
	}
}]);
