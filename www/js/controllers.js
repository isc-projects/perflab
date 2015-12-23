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
	['$scope', '$http', '$route', '$location',
	 '$routeParams', 'linkHeaderParser', 'Notify',
	 'ConfigResource',
	function($scope, $http, $route, $location, $routeParams, lhp, Notify, ConfigResource) {

		var id = $routeParams.config_id;

		var search = $location.search();
		$scope.skip = search.skip || 0;
		$scope.limit = search.limit || 15;
		$scope.page = Math.floor($scope.skip / $scope.limit) + 1;

		$scope.config = ConfigResource.get({id: id});

		var url = ['/api/config/run/', id, '/?',
				   'skip=', $scope.skip, '&', 'limit=', $scope.limit
				  ].join('');

		$http.get(url).then(function(res) {
			$scope.runs = res.data;
			$scope.link = lhp.parse(res.headers('link'));
		}).catch(Notify.danger);

		$scope.search = function(arg) {
			arg = arg.substr(1);
			$location.search(arg);
			$route.reload();
		};
	}
]);

app.controller('testListController',
	['$scope', '$routeParams', 'TestResource', 'RunResource', 'ConfigResource',
	function($scope, $routeParams, TestResource, RunResource, ConfigResource) {

		var id = $routeParams.run_id;
		$scope.run = RunResource.get({id: id});
		$scope.run.$promise.then(function() {
			$scope.config = ConfigResource.get({id: $scope.run.config_id});
		});
		$scope.tests = TestResource.query({run_id: id});
	}
]);

app.controller('testDetailController',
	['$scope', '$routeParams', 'TestResource',
	function($scope, $routeParams, TestResource) {
		$scope.test = TestResource.get({id: $routeParams.test_id});
	}
]);

app.controller('configEditController',
	['$scope', '$http', '$route', '$location', '$routeParams', 'Notify',
	function($scope, $http, $route, $location, $routeParams, Notify) {

		$scope.id = $routeParams.id;

		if ($scope.id === undefined) {
			setDefaults();
		} else {
			$http.get('/api/config/' + $scope.id).then(function(res) {
				$scope.config = res.data;
				setDefaults();
			}).catch(redirectNotify);

			// just used to check if this config has any results
			$http.get('/api/config/run/' + $scope.id + '/?limit=1').then(function(res) {
				$scope.existing = !!(res.data && res.data.length);
			});
		}

		function redirectNotify(e) {
			Notify.danger(e);
			setTimeout(function() {
				$location.path('/config/');
				$route.reload();
			}, 3000);
		}

		function setDefaults() {
			var data = $scope.config = $scope.config || {};

			data.flags = data.flags || {};

			var args = data.args = data.args || {};
			args.configure = args.configure || [];
			args.make = args.make || [];
			args.bind = args.bind || [];

			data.zoneset = data.zoneset || 'root';
			data.queryset = data.queryset || 'default';
			data.options = data.options || '';
			data.global = data.global || '';
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
