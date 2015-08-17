/*!
 * Copyright 2015 Geoscience Australia (http://www.ga.gov.au/copyright.html)
 */

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
}])

.run(["$templateCache", function($templateCache) {
	  $templateCache.put("components/flasher/flash.html",
			    '<div class="marsFlash" ng-show="messages.items.length > 0">' +
				'  <div ng-repeat="message in messages.items">' +
				'     <span><img alt="Waiting..." src="resources/img/tinyloader.gif" ng-show="message.spinner" style="position:relative;top:2px;" width="12"></img> {{message.text}}</span>'+
				'  </div>' +
				'</div>');
}]);