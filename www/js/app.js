var app = angular.module('perflabApp', ['ngRoute']);

app.config(['$routeProvider',
	function($routeProvider) {
		$routeProvider
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
}]);

app.controller('configListController', ['$scope', '$http',
	function($scope, $http) {
		$http.get('/api/config/').then(function(res) {
			$scope.configs = res.data;
		})
	}
]);


app.controller('runListController', ['$scope', '$http', '$route', '$location', '$routeParams',
	function($scope, $http, $route, $location, $routeParams) {
		$scope.config_id = $routeParams.config_id;
		$http.get('/api/config/run/' + $scope.config_id + '/').then(function(res) {
			$scope.runs = res.data;
		})
	}
]);

app.controller('testListController', ['$scope', '$http', '$route', '$location', '$routeParams',
	function($scope, $http, $route, $location, $routeParams) {
		$scope.run_id = $routeParams.run_id;
		$http.get('/api/run/test/' + $scope.run_id + '/').then(function(res) {
			$scope.tests = res.data;
		})
	}
]);

app.controller('testDetailController', ['$scope', '$http', '$route', '$location', '$routeParams',
	function($scope, $http, $route, $location, $routeParams) {
		$scope.test_id = $routeParams.test_id;
		$http.get('/api/test/' + $scope.test_id).then(function(res) {
			$scope.run = res.data;
		})
	}
]);

app.controller('configEditController', ['$scope', '$http', '$route', '$location', '$routeParams',
	function($scope, $http, $route, $location, $routeParams) {

		$scope.id = $routeParams.id;

		if ($scope.id === undefined) {
			setDefaults();
		} else {
			$http.get('/api/config/' + $scope.id).then(function(res) {
				$scope.config = res.data;
				setDefaults();
			}).catch(function(e) {
				redirectError(e.data || e.message);
			});
		}

		function redirectError(text) {
			$scope.status = { level: 'danger', text: text };
			// $scope.configEdit.$setDisabled();
			setTimeout(function() {
				$location.path('/config/');
				$route.reload();
			}, 3000);
		}

		function setDefaults() {
			var data = $scope.config = $scope.config || {};
			var args = data.args = data.args || {};
			args.configure = args.configure || [];
			args.make = args.make || [];
			args.bind = args.bind || [];

			data.zoneset = data.zoneset || "root";
			data.queryset = data.queryset || "default";
			data.options = data.options || "";
			data.global = data.global || "";
		}

		$scope.save = function() {
			if ($scope.id === undefined) {
				$http.post('/api/config/', $scope.config).then(function(res) {
					$scope.id = res.data._id;
					$location.path('/config/' + $scope.id + '/edit').replace();
					$route.reload();
				}).catch(function(e) {
					$scope.error = { level: 'danger', text: e.data || e.message };
				});
			} else {
				$http.put('/api/config/' + $scope.id, $scope.config)
					.then(function() {
						$scope.status = { level: 'info', text: 'Saved' };
						$scope.configEdit.$setPristine();
					}).catch(function(e) {
						$scope.status = { level: 'danger', text: e.data || e.message };
					});
			}
		}

		$scope.delete = function() {
			if ($scope.id !== undefined) {
				$http.delete('/api/config/' + $scope.id).then(function(res) {
					redirectError('Configuration deleted');
				}).catch(function(e) {
					$scope.status = { level: 'danger', text: e.data || e.message };
				});
			}
		}
	}
]);
