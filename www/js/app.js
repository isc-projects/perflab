var app = angular.module('perflabApp', ['ngRoute', 'ngAnimate']);

$.notifyDefaults({
	placement: { from: 'bottom', align: 'right' },
	newest_on_top: true,
	allow_dismiss: false,
	animate: {
		enter: 'animated fadeInUp',
		exit: 'animated fadeOutRight'
	},
});

var notify = function(message, level) {
	if (message instanceof Error) {
		message = message.message;
		level = 'danger';
	} else if (typeof message === 'object' && message.data) {
		message = message.data;
		level = 'danger';
	} else if (typeof message === 'object' && message.status) {
		if (message.status === -1 && message.statusText === '') {
			message = 'could not connect to server';
		}
		level = 'danger';
	}

	$.notify({message}, {type: level});
}

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
		}).catch(notify);

		// (function loop() {
			$http.get('/api/queue/').then(function(res) {
				$scope.queue = res.data;
			}).catch(notify);
		// 	setTimeout(loop, 5000);
		// })();
	}
]);

app.controller('runListController', ['$scope', '$http', '$route', '$location', '$routeParams',
	function($scope, $http, $route, $location, $routeParams) {
		$scope.config_id = $routeParams.config_id;
		$http.get('/api/config/run/' + $scope.config_id + '/').then(function(res) {
			$scope.runs = res.data;
		}).catch(notify);
	}
]);

app.controller('testListController', ['$scope', '$http', '$route', '$location', '$routeParams',
	function($scope, $http, $route, $location, $routeParams) {
		$scope.run_id = $routeParams.run_id;
		$http.get('/api/run/test/' + $scope.run_id + '/').then(function(res) {
			$scope.tests = res.data;
		}).catch(notify);
	}
]);

app.controller('testDetailController', ['$scope', '$http', '$route', '$location', '$routeParams',
	function($scope, $http, $route, $location, $routeParams) {
		$scope.test_id = $routeParams.test_id;
		$http.get('/api/test/' + $scope.test_id).then(function(res) {
			$scope.run = res.data;
		}).catch(notify);
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
			}).catch(redirectError);
		}

		function redirectError(e) {
			notify(e);
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
					notify('Saved');
					$route.reload();
				}).catch(function(e) {
					$scope.error = { level: 'danger', text: e.data || e.message };
				});
			} else {
				$http.put('/api/config/' + $scope.id, $scope.config)
					.then(function() {
						notify('Saved');
						$scope.configEdit.$setPristine();
					}).catch(notify);
			}
		}

		$scope.delete = function() {
			if ($scope.id !== undefined) {
				$http.delete('/api/config/' + $scope.id).then(function(res) {
					redirectError('Configuration deleted');
				}).catch(notify);
			}
		}
	}
]);
