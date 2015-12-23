var app = angular.module('perflabApp',
	['ngRoute', 'ngAnimate', 'ngSanitize',
	 'dygraphs-directive',
	 'isc.modules', 'isc.resources']);

app.config(['$routeProvider',
	function($routeProvider) {
		$routeProvider
			.when('/logs/', {
				templateUrl: 'partials/log-view.html',
				controller: 'logViewController'
			})
			.when('/config/', {
				templateUrl: 'partials/config-list.html',
				controller: 'configListController'
			})
			.when('/config/new', {
				templateUrl: 'partials/config-edit.html',
				controller: 'configEditController'
			})
			.when('/config/:id/edit', {
				templateUrl: 'partials/config-edit.html',
				controller: 'configEditController'
			})
			.when('/config/run/:config_id/', {
				templateUrl: 'partials/run-graph.html',
				controller: 'runGraphController'
			})
			.when('/config/run/:config_id/list/', {
				templateUrl: 'partials/run-list.html',
				controller: 'runListController'
			})
			.when('/run/test/:run_id/', {
				templateUrl: 'partials/test-list.html',
				controller: 'testListController'
			})
			.when('/test/:test_id/', {
				templateUrl: 'partials/test-detail.html',
				controller: 'testDetailController'
			})
			.otherwise({
				redirectTo: '/config/'
			});
	}
]);

app.config(['$resourceProvider',
	function($resourceProvider) {
		$resourceProvider.defaults.stripTrailingSlashes = false;
	}
]);
