/*!
 * Copyright 2015 Geoscience Australia (http://www.ga.gov.au/copyright.html)
 */

(function(angular) {

'use strict';

angular.module("explorer.flasher", [])

.factory('flashService', ['$timeout', function($timeout) {
	var data = {
			items:[]
	};
	return {
		getData : function() {
			return data;
		},
		
		add : function(message, duration, spinner) {
			if(typeof spinner == "undefined") {
				spinner = false;
			}
			
			var item = {
					text:message,
					spinner:spinner,
					service:this,
					remove:function() {
						this.service.remove(this);
					}
			}, self = this;
			// Set a sane timeout in milliseconds
			duration = duration?duration:10000;
			
			data.items.push(item);
			item.timer = $timeout(function() {
				item.timer = null;
				self.remove(item);
			}, duration);
			
			return item;
		},
	
		remove : function(item) {
			if(!item) {
				// Nothing to do here.
				return;
			}
			if(item.timer) {
				$timeout.cancel(item.timer);
			}
			var index = data.items.indexOf(item);
			if(index > -1) {
				data.items.splice(index, 1);
			}
		}
	};
}])

.directive('explorerFlash', ['flashService', '$timeout', function(flashService, $timeout) {
	return {
		restrict : "AE",
		controller : ['$scope', 'flashService', function($scope, flashService) {
			$scope.messages = flashService.getData();			
		}],
		templateUrl: "components/flasher/flash.html",
		link : function(scope, element, attrs){
			element.addClass("marsFlash");
		}
	};
}]);

})(angular);