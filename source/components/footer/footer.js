/*!
 * Copyright 2015 Geoscience Australia (http://www.ga.gov.au/copyright.html)
 */

'use strict';

angular.module('page.footer', [])

.directive('pageFooter', [function() {
	return {
		restrict:'EA',
		templateUrl:"components/footer/footer.html"
	};
}])

.run(["$templateCache", function($templateCache) {
	  $templateCache.put("components/footer/footer.html",
		'<nav class="navbar navbar-inverse navbar-fixed-bottom ga-footer" role="navigation" explorer-footer>' +
		'  <div class="container-fluid">' +
		'    <div class="navbar-header">' +
		'      <button type="button" class="navbar-toggle" data-toggle="collapse"' +
		'            data-target="#bs-example-navbar-collapse-1">' +
		'        <span class="sr-only">Toggle footer</span>' +
		'        <span class="icon-bar"></span>' +
		'        <span class="icon-bar"></span>' +
		'        <span class="icon-bar"></span>' +
		'      </button>' +
		'    </div>' +
		'    <div class="navbar-nobrand">' +
		'      <div class="collapse navbar-collapse" id="bs-example-navbar-collapse-1">' +
		'        <ul class="nav navbar-nav">' +
		'          <li><a href="http://creativecommons.org/licenses/by/3.0/au/deed.en"><img' +
		'               src="assets/img/cc-by.png" height="20px" alt="CC BY 3.0 AU"/></a></li>' +
		'          <li><a href="http://www.ga.gov.au/copyright">Copyright</a></li>' +
		'          <li><a href="http://www.ga.gov.au/disclaimer">Disclaimer</a></li>' +
		'          <li><a href="http://www.ga.gov.au/privacy">Privacy</a></li>' +
		'          <li><a href="http://www.ga.gov.au/accessibility">Accessibility</a></li>' +
		'          <li><a href="http://www.ga.gov.au/ips">Information Publication Scheme</a></li>' +
		'          <li><a href="http://www.ga.gov.au/ips/foi">Freedom of Information</a></li>' +
		'          <li class="contact"><a href="http://www.ga.gov.au/contact-us" target="_blank">Contact us</a></li>' +
		'        </ul>' +
		'      </div>' +
		'    </div>' +
		'  </div>' +
		'</nav>');
}])

.directive('explorerFooter', ['$timeout', function($timeout) {
	return {
		restrict:'EA',
		controller:['$scope', function($scope) {}],
		link : function(scope, element, attrs) {
			scope.originalHeight = element.height();
			function hide(millis) {
				element.delay(millis).animate({bottom: - scope.originalHeight + 7}, 1000, function() {
					scope.hidden = true;
				});			
			}
			
			function show() {
				element.animate({bottom:0}, 1000, function() {
					scope.hidden = false;
				});			
			}
			
			element.on("mouseenter", function(event) {
				if(scope.timeout) {
					$timeout.cancel(scope.timeout);
					scope.timeout = null;
				}
				scope.timeout = $timeout(function() {
					show();
					scope.timeout = null;
				}, 300);
			});

			element.on("mouseleave", function() {
				if(scope.timeout != null) {
					$timeout.cancel(scope.timeout);
					scope.timeout = null;
				} else {
					hide(0);
				}
			});
			hide(3000);
		}
	};
}]);