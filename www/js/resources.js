(function() {

"use strict";

var module = angular.module('isc.resources', ['ngResource']);

module.factory('TestResource', ['$resource',
	function($resource) {
		return $resource('/api/test/:id', {}, {
			query: {
				url: '/api/run/test/:run_id/',
				isArray: true
			}
		});
	}
]);

module.factory('RunResource', ['$resource',
	function($resource) {
		return $resource('/api/run/:id', {}, {
			query: {
				url: '/api/config/run/:config_id/',
				isArray: true
			}
		});
	}
]);

module.factory('ConfigResource', ['$resource',
	function($resource) {
		return $resource('/api/config/:id', {}, {});
	}
]);

module.factory('QueueResource', ['$resource',
	function($resource) {
		return $resource('/api/queue/:id', {}, {});
	}
]);

})();
