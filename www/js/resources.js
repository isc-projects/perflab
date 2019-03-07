(function() {

"use strict";

var module = angular.module('isc.resources', ['ngResource']);

module.factory('TestResource', ['$resource',
	function($resource) {
		return $resource('/api/test/:id', { id: '@_id' }, {
			query: {
				url: '/api/run/test/:run_id/',
				isArray: true
			}
		});
	}
]);

module.factory('MemoryResource', ['$resource',
	function($resource) {
		return $resource('/api/run/memory/:run_id/');
	}
]);

module.factory('RunResource', ['$resource',
	function($resource) {
		return $resource('/api/run/:id', { id: '@_id' }, {
			query: {
				url: '/api/config/run/:config_id/',
				isArray: true
			}
		});
	}
]);

module.factory('ConfigListResource', ['$resource',
	function($resource) {
		return $resource('/api/config_list/:id', { id: '@_id' });
	}
]);

module.factory('ConfigResource', ['$resource',
	function($resource) {
		return $resource('/api/config/:id', { id: '@_id' }, {
			update: {
				method: 'PUT',
				transformResponse: (data) => angular.fromJson(data).value
			}
		});
	}
]);

module.factory('ServerAgentResource', ['$resource',
	function($resource) {
		return $resource('/api/agent/server/:agent');
	}
]);

module.factory('ClientAgentResource', ['$resource',
	function($resource) {
		return $resource('/api/agent/client/:agent', {}, {
			queryByProtocol: {
				url: '/api/agent/client/_protocol/:protocol',
				isArray: true
			}
		});
	}
]);

module.factory('SettingsResource', ['$resource',
	function($resource) {
		return $resource('/api/settings/');
	}
]);

})();
