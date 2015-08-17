/*!
 * Copyright 2015 Geoscience Australia (http://www.ga.gov.au/copyright.html)
 */

'use strict';

angular.module("explorer.message", [])

.directive('explorerMessages', ['messageService', function(messageService) {
	return {
		restrict:'AE',
		controller : 'MessageController',
		templateUrl : 'components/message/messages.html?v=1',
		link : function(scope, element, attrs, controller) {
		}
	};	
}])

.factory("messageService", ["$rootScope", function($rootScope) {
    return {
    	warn : function(message) {
    		this._message("warn", message);
    	},
    	success : function(message) {
    		this._message("success", message);
    	},
    	info : function(message) {
    		this._message("info", message);
    	},
    	error : function(message) {
    		this._message("error", message);
    	},
    	clear : function() {
    		$rootScope.$broadcast('message.clear');
    	},    	
    	_message : function(type, message) {
    		$rootScope.$broadcast('message.posted', {
    			type : type,
    			text : message,
    			time : new Date()
    		});
    	}
    };
}])

.controller('MessageController', ['$scope', '$timeout', '$rootScope', function($scope, $timeout, $rootScope) {
	$scope.controller = "MessageController";
	$scope.persistDuration = 12000;
	$scope.historicCount = 10;
	$scope.message = null;
	$scope.historic = [];
	
	$rootScope.$on('message.posted', function(event, message) {
		var phase = $scope.$root.$$phase;
		if(phase == '$apply' || phase == '$digest') {
			$scope.message = message;
		} else {
		   this.$apply(function() {
				$scope.message = message;
			});
		}
		
		$timeout.cancel($scope.timeout);
		$scope.timeout = $timeout(function() {
			$scope.$apply(function() {
				$scope.removeMessage();
			});
		}, $scope.persistDuration);
	});
	
	$rootScope.$on("message.cleared", $scope.removeMessage);
	
	$scope.removeMessage = function() {
		$scope.timeout = null;
		$scope.historic.splice(0, 1, $scope.message);
		while($scope.historic.length > 10) {
			$scope.historic.pop();
		}
		$scope.message = null;
	}
	
}])

.run(['$rootScope', 'messageService',  
         function($rootScope, messageService) {
	//make current message accessible to root scope and therefore all scopes
    $rootScope.$on("message:info", function (event, message) {
        messageService.info(message);
    });
    $rootScope.$on("message:error", function (event, message) {
        messageService.error(message);
    });
    $rootScope.$on("message:success", function (event, message) {
        messageService.success(message);
    });
    $rootScope.$on("message:warn", function (event, message) {
        messageService.warn(message);
    });
    $rootScope.$on("message:clear", function () {
        messageService.warn(message);
    });
    $rootScope.$on("messages", function (event, messages) {
    	messages = messages?angular.isArray(messages)?messages:[messages]:[];
    	angular.forEach(messages, function(message) {
    		$rootScope.$broadcast("message:" + message.type.toLowerCase(), message.text);
    	}); 
    });
}])

.run(["$templateCache", function($templateCache) {
	$templateCache.put("components/message/messages.html",
			    '<span ng-controller="MessageController" style="z-index:3">' +
				'  <span ng-show="historic.length > 10000">' +
				'    <a href="javascript:;" title="Show recent messages"><i class="fa fa-comments-o" style="color:black"></i></a>' +
				'  </span>' +
				'  <div ng-show="message" class="alert" role="alert" ng-class=\'{"alert-success":(message.type=="success"),"alert-info":(message.type=="info"),"alert-warning":(message.type=="warn"),"alert-danger":(message.type=="error")}\'>' +
				'    {{message.text}} <a href="javascript:;" ng-click="removeMessage()"><i class="fa fa-times-circle" style="font-size:120%"></i></a>' +
				'  </div>' +
				'</div>');
}]);