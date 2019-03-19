const module = angular.module('isc.resources', ['ngResource']);

module.factory('TestResource',
	['$resource',
	($resource) => $resource('/api/test/:id', { id: '@_id' }, {
			query: {
				url: '/api/run/test/:run_id/',
				isArray: true
			}
		})
]);

module.factory('MemoryResource',
	['$resource',
	($resource) => $resource('/api/run/memory/:run_id/')
]);

module.factory('RunResource',
	['$resource',
	$resource => $resource('/api/run/:id', { id: '@_id' }, {
			query: {
				url: '/api/config/run/:config_id/',
				isArray: true
			}
	})
]);

module.factory('ConfigListResource',
	['$resource',
	($resource) => $resource('/api/config_list/:id', { id: '@_id' })
]);

module.factory('ConfigResource',
	['$resource',
	($resource) => $resource('/api/config/:id', { id: '@_id' }, {
			update: {
				method: 'PUT',
				transformResponse: (data) => angular.fromJson(data).value
			}
	})
]);

module.factory('ServerAgentResource',
	['$resource',
	($resource) => $resource('/api/agent/server/:agent', {}, {
			query: { isArray: false }
	})
]);

module.factory('ClientAgentResource',
	['$resource',
	($resource) => $resource('/api/agent/client/:agent', {}, {
			query: { isArray: false },
	})
]);

module.factory('SettingsResource',
	['$resource',
	($resource) => $resource('/api/settings/')
]);
