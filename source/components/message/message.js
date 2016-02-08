/*!
 * Copyright 2015 Geoscience Australia (http://www.ga.gov.au/copyright.html)
 */
(function(angular) {

'use strict';

angular.module("explorer.message", [])

.directive('explorerMessages', ['messageService', function(messageService) {
	return {
		restrict:'AE',
		controller : 'MessageController',
		templateUrl : 'components/message/messages.html',
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
		$timeout(function() {
			$scope.message = message;
			$timeout.cancel($scope.timeout);
			$scope.timeout = $timeout(function() {
				$scope.$apply(function() {
					$scope.removeMessage();
				});
			}, $scope.persistDuration);
		});
	});
	
	$rootScope.$on("message.cleared", $scope.removeMessage);
	
	$scope.removeMessage = function() {
		$scope.timeout = null;
		$scope.historic.splice(0, 1, $scope.message);
		while($scope.historic.length > 10) {
			$scope.historic.pop();
		}
		$scope.message = null;
	};	
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
    $rootScope.$on("message:clear", function (message) {
        messageService.warn(message);
    });
    $rootScope.$on("messages", function (event, messages) {
    	messages = messages?angular.isArray(messages)?messages:[messages]:[];
    	angular.forEach(messages, function(message) {
    		$rootScope.$broadcast("message:" + message.type.toLowerCase(), message.text);
    	}); 
    });
}]);

})(angular);