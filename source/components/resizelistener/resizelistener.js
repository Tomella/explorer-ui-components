/**
 * @ngdoc object
 * @name explorer.resizelistener
 * @description
 * 
 * <p>Binds to window resize event, exposes windowWidth and windowHeight as $scope vars.</p>
 * 
 * 
 **/

angular.module('explorer.resizelistener', [])

.directive('resizeListener', function($window) {
	
	return function (scope, element) {
        var w = angular.element($window);
        scope.getWindowDimensions = function () {
            return {
                'h': w.height(),
                'w': w.width()
            };
        };
        
        scope.$watch(scope.getWindowDimensions, function (newValue, oldValue) {
            
        	scope.windowHeight = newValue.h;
            scope.windowWidth = newValue.w;

            scope.style = function () {
                return {
                    'height': (newValue.h - 100) + 'px',
                    'width': (newValue.w - 100) + 'px'
                };
            };
            
            // could also broadcast 'resize complete' event if needed..

        }, true);

        w.bind('resize', function () {
            scope.$apply();
        });
    };
});