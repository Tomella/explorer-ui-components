/*!
 * Copyright 2015 Geoscience Australia (http://www.ga.gov.au/copyright.html)
 */
(function (angular) {

    'use strict';

    angular.module("explorer.httpdata", [])

        .provider('httpData', function HttpDataProvider() {
            var _servicesLocation = "", _localPrefixes = [];

            function fixUrl(url) {
                // serve resources and partials locally
                for (var i = _localPrefixes.length; --i >= 0; )
                    if (url.indexOf(_localPrefixes[i]) === 0)
                        return url;

                return _servicesLocation + url;
            }

            this.localPrefixes = function (where) {
                _localPrefixes = where || [];
            };

            this.servicesLocation = function (where) {
                _servicesLocation = where;
            };

            this.$get = ['$http', '$q', function ($http, $q) {
                // Just a convenience wrapper around $http
                return {
                    get: function (url, options) {
                        return $http.get(fixUrl(url), options);
                    },

                    post: function (url, data, options) {
                        return $http.post(fixUrl(url), data, options);
                    },

                    put: function (url, data, options) {
                        return $http.put(fixUrl(url), data, options);
                    }
                };
            }];
        });

})(angular);