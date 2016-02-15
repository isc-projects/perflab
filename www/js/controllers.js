(function() {

"use strict";

var app = angular.module('perflabApp');

app.controller('logViewController', ['$scope', 'LogWatcher',
	function ($scope, LogWatcher) {
		$scope.logwatch = LogWatcher;
	}
]);

app.controller('configListController',
	['$scope', 'Configs',
	function($scope, Configs) {
		$scope.configs = Configs;
	}
]);

app.controller('queueController',
	['$scope', 'SystemControl',
	function($scope, SystemControl) {
		$scope.control = SystemControl;
	}
]);

app.controller('runListController',
	['$scope', '$route', '$routeParams', '$location',
	 'ConfigResource', 'RunResource', 'Notify',
	function($scope, $route, $routeParams, $location,
			 ConfigResource, RunResource, Notify) {

		var id = $routeParams.config_id;
		var search = $location.search();
		var skip = +search.skip || 0;
		var limit = +search.limit || 0;
		if (limit <= 0) {
			limit = 15;
		}
		$scope.page = Math.floor(skip / limit) + 1;

		$scope.config = ConfigResource.get({id: id});
		$scope.config.$promise.catch(Notify.danger);

		$scope.runs = RunResource.query({config_id: id, skip: skip, limit: limit});
		$scope.runs.$promise.then(function(data) {
			var link = {};
			if (skip > 0) {
				link.first = makelink(0, limit);
				link.prev = makelink(Math.max(0, skip - limit), limit);
			}
			if (data.length >= limit) {
				link.next = makelink(skip + limit, limit);
			}
			$scope.link = link;
		}).catch(Notify.danger);

		function makelink(skip, limit) {
			return "skip=" + skip + "&limit=" + limit;
		}

		$scope.search = function(arg) {
			$location.search(arg);
			$route.reload();
		};
	}
]);

app.controller('testListController',
	['$scope', '$routeParams', 'TestResource', 'RunResource', 'ConfigResource', 'Notify',
	function($scope, $routeParams, TestResource, RunResource, ConfigResource, Notify) {

		var id = $routeParams.run_id;

		$scope.tests = TestResource.query({run_id: id});
		$scope.tests.$promise.catch(Notify.danger);

		$scope.run = RunResource.get({id: id});
		$scope.run.$promise.then(function() {
			return $scope.config = ConfigResource.get({id: $scope.run.config_id});
		}).catch(Notify.danger);
	}
]);

app.controller('testDetailController',
	['$scope', '$routeParams', 'TestResource', 'Notify',
	function($scope, $routeParams, TestResource, Notify) {
		$scope.test = TestResource.get({id: $routeParams.test_id});
		$scope.test.$promise.catch(Notify.danger);
	}
]);

app.controller('configEditController',
	['$scope', '$http', '$route', '$location', '$routeParams',
	 'Notify', 'RunResource', 'ConfigResource',
	function($scope, $http, $route, $location, $routeParams,
			 Notify, RunResource, ConfigResource) {

		var id = $scope.id = $routeParams.id;

		if ($scope.id === undefined) {
			setDefaults();
		} else {
			$http.get('/api/config/' + $scope.id).then(function(res) {
				$scope.config = res.data;
				setDefaults();
			}).catch(redirectNotify);

			// just used to check if this config has any results
			var results = RunResource.query({config_id: id, limit: 1})
			results.$promise.then(function(data) {
				$scope.existing = !!(data && data.length);
			}).catch(Notify.danger);
		}

		function redirectNotify(e) {
			Notify.danger(e);
			setTimeout(function() {
				$location.path('/config/');
				$route.reload();
			}, 3000);
		}

		function setDefaults() {
			var config = $scope.config = $scope.config || {};

			config.flags = config.flags || {checkout: false};
			config.mode = config.mode || 'auth';

			var args = config.args = config.args || {};
			args.configure = args.configure || [];
			args.make = args.make || [];
			args.bind = args.bind || [];

			config.zoneset = config.zoneset || 'root';
			config.queryset = config.queryset || 'default';
			config.options = config.options || '';
			config.global = config.global || '';
		}

		function doneSaving() {
			$scope.saving = false;
		}

		$scope.save = function() {
			$scope.saving = true;
			if ($scope.id === undefined) {
				$http.post('/api/config/', $scope.config).then(function(res) {
					$scope.id = res.data._id;
					$location.path('/config/' + $scope.id + '/edit').replace();
					Notify.info('Saved');
					$route.reload();
				}).catch(Notify.danger).then(doneSaving);
			} else {
				$http.put('/api/config/' + $scope.id, $scope.config).then(function() {
					Notify.info('Saved');
					$scope.configEdit.$setPristine();
				}).catch(Notify.danger).then(doneSaving);
			}
		}

		$scope.delete = function() {
			$scope.saving = true;
			if ($scope.id !== undefined) {
				$http.delete('/api/config/' + $scope.id).then(function(res) {
					redirectNotify('Configuration deleted');
				}).catch(Notify.danger).then(doneSaving);
			}
		}
	}
]);

app.controller('beepController', ['$scope', 'Beeper',
	function($scope, Beeper) {
		$scope.beeper = Beeper;
	}
]);

})();
