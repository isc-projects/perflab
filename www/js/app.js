var app = angular.module('perflabApp', ['ngRoute']);

app.config(['$routeProvider',
	function($routeProvider) {
		$routeProvider
			.when('/config/', {
				templateUrl: 'partials/config-list.html',
				controller: 'configsController'
			})
			.when('/config/new', {
				templateUrl: 'partials/config-edit.html',
				controller: 'configController'
			})
			.when('/config/:id/edit', {
				templateUrl: 'partials/config-edit.html',
				controller: 'configController'
			})
			.otherwise({
				redirectTo: '/config/'
			});
}]);

app.controller('configsController', ['$scope', '$http',
	function($scope, $http) {
		$http.get('/api/config/').then(function(res) {
			$scope.configs = res.data;
		})
	}
]);

app.controller('configController', ['$scope', '$http', '$location', '$routeParams',
	function($scope, $http, $location, $routeParams) {

		var id = $routeParams.id;

		if (id !== undefined) {
			$http.get('/api/config/' + $routeParams.id).then(function(res) {
				$scope.config = res.data;
				setDefaults();
			})
		} else {
			setDefaults();
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
			if (id === undefined) {
				$http.post('/api/config/', $scope.config).then(function(res) {
					var id = res.data._id;
					$location.path('/#/config/' + id + '/edit');
				}).catch(function(e) {
					$scope.error = { level: 'danger', text: e.data };
				});
			} else {
				$http.put('/api/config/' + id, $scope.config)
					.then(function() {
						$scope.status = { level: 'info', text: 'Saved' };
					}).catch(function(e) {
						$scope.status = { level: 'danger', text: e.data };
					});
			}
		}
	}
]);
