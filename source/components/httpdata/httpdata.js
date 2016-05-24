/*!
 * Copyright 2015 Geoscience Australia (http://www.ga.gov.au/copyright.html)
 */
(function (angular) {

    'use strict';

    angular.module("explorer.httpdata", [])

        .provider('httpData', function HttpDataProvider() {
            var _redirects = [];

            function fixUrl(url) {
                for (var i = _redirects.length; --i >= 0; ) {
                    var prefixes = _redirects[i].prefixes;
                    for (var j = prefixes.length; --j >= 0; ) {
                        if (url.indexOf(prefixes[j]) === 0)
                            return _redirects[i].where + url;
                    }
                }

                return url;
            }

            this.redirect = function (where, prefixes) {
                _redirects.push({
                    where: where,
                    prefixes: prefixes
                });
            };

            this.$get = ['$http', '$q', function ($http, $q) {
                return {
                    baseUrlForPkg: function(pkg) {
                        var regexp1 = new RegExp('((?:.*\/)|^)' + pkg + '[\w-]*\.js(?:\W|$)', 'i');
                        var regexp2 = new RegExp('((?:.*\/)|^)' + pkg + '\.min[\w-]*\.js(?:\W|$)', 'i');
                        var scripts = document.getElementsByTagName('script');
                        for ( var i = 0, len = scripts.length; i < len; ++i) {
                            var result, src = scripts[i].getAttribute('src');
                            result = regexp1.exec(src);
                            if (result !== null) return result[1];
                            result = regexp2.exec(src);
                            if (result !== null) return result[1];
                        }
                    },
                    fixUrl: fixUrl,
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