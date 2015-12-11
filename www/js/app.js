var app = angular.module('perflabApp',
	['ngRoute', 'ngAnimate', 'nvd3', 'isc.modules']);

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
}]);

app.service('SystemControl',
	['$http', '$timeout', 'Notify',
	function($http, $timeout, Notify) {
		var service = {
			pause: function() {
				$http.put('/api/control/paused/', {paused: true});
			},
			unpause: function() {
				$http.put('/api/control/paused/', {paused: false});
			},
			paused: undefined
		};

		function update() {
			return $http.get('/api/control/').then(function(res) {
				if (service.paused === true && !res.data.paused) {
					Notify.info('Queue running');
				} else if (service.paused === false && res.data.paused) {
					Notify.danger('Queue paused');
				}
				service.paused = res.data.paused;
			});
		}

		(function loop() {
			update().then(function() { $timeout(loop, 1000); });
		})();

		return service;
	}
]);

app.controller('logViewController', ['$scope', '$http', 'Notify',
	function ($scope, $http, Notify) {

		$http.get('/api/log/').then(function(res) {
			var log = res.data || [];
			$scope.lines = log;
			$scope.$watchCollection('lines', function(){});

			if (!ws) {
				var ws = new WebSocket('ws://' + window.location.hostname + ':8001/');
				ws.onerror = function() {
					Notify.danger('WebSocket error');
				}
			}

			ws.onmessage = function(ev) {
				var obj = JSON.parse(ev.data);
				log.push(obj);
				if (log.length > 100) {
					log.shift();
				}
				$scope.$digest();
			}
		});
	}
]);

app.controller('configListController',
	['$scope', '$http', '$q', 'Notify', 'SystemControl',
	function($scope, $http, $q, Notify, SystemControl) {
		var p1 = $http.get('/api/config/').then(function(res) {
			$scope.configs = res.data;
			$scope.configsById = $scope.configs.reduce(function(p, c) {
				p[c._id] = c; return p;
			}, {});
		});

		var p2 = $http.get('/api/queue/').then(function(res) {
			$scope.queue = res.data;
		});

		$q.all([p1, p2]).then(function() {
			$scope.queue.forEach(function(queue) {
				if (queue.config_id in $scope.configsById) {
					$scope.configsById[queue.config_id].queue = queue;
				}
			});
		}).catch(Notify.danger);

		$scope.tick = (b) => 'glyphicon ' + (b ? 'glyphicon-ok' : 'glyphicon-remove');

		$scope.control = SystemControl;
	}
]);

app.controller('runListController',
	['$scope', '$http', '$route', '$location',
	 '$routeParams', 'linkHeaderParser', 'Notify',
	function($scope, $http, $route, $location, $routeParams, lhp, Notify) {
		$scope.config_id = $routeParams.config_id;

		$scope.search = function(arg) {
			arg = arg.substr(1);
			$location.search(arg);
			$route.reload();
		};

		var search = $location.search();
		$scope.skip = search.skip || 0;
		$scope.limit = search.limit || 15;
		$scope.page = Math.floor($scope.skip / $scope.limit) + 1;
		var url = ['/api/config/run/', $scope.config_id, '/?',
					'skip=', $scope.skip, '&', 'limit=', $scope.limit
			].join('');

		$http.get(url).then(function(res) {
			$scope.runs = res.data;
			$scope.link = lhp.parse(res.headers('link'));
		}).catch(Notify.danger);
	}
]);

app.controller('runGraphController',
	['$scope', '$http', '$routeParams', 'Notify',
	function ($scope, $http, $routeParams, Notify) {
		$scope.config_id = $routeParams.config_id;

		var dateFormat = d3.time.format.multi([
			["%H:%M:%S", function(d) { return d.getSeconds(); }],
			["%H:%M", function(d) { return d.getMinutes(); }],
			["%H:%M", function(d) { return d.getHours(); }],
			["%Y/%m/%d", function(d) { return true }]
		]);

		$scope.config = {
			refreshDataOnly: false,
			deepWatchData: false
		};

		$scope.data = [];

		$scope.options = { chart: {
			type: 'candlestickBarChart',
			x: function(d) { return d.date; },
			y: function(d) { return d.close; },
			xScale: d3.time.scale(),
			height: 600,
			xAxis: { axisLabel: 'Date and Time', showMaxMin: false,
				tickFormat: function(x) { return dateFormat(new Date(x)) }
			},
			yAxis: { axisLabel: 'QPS', showMaxMin: false,
				tickFormat: d3.format('.3r') },
			zoom: { enabled: true, horizontalOff: false, verticalOff: true },
			useInteractiveGuideline: false
		}};

		$http.get('/api/config/run/' + $scope.config_id + '/').then(function(res) {
			var data = res.data.filter(function(run) {
				return run.stats !== undefined && run.created !== undefined;
			}).map(function(run) {
				return {
					date: new Date(run.created).valueOf(),
					high: run.stats.max,
					low: run.stats.min,
					average: run.stats.average,
					open: run.stats.average - run.stats.stddev,
					close: run.stats.average + run.stats.stddev
				}
			});
			$scope.api.refresh();
			$scope.api.updateWithData([{values: data }]);
		}).catch(Notify.danger);
	}
]);

app.controller('testListController',
	['$scope', '$http', '$route', '$location', '$routeParams', 'Notify',
	function($scope, $http, $route, $location, $routeParams, Notify) {
		$scope.run_id = $routeParams.run_id;
		$http.get('/api/run/test/' + $scope.run_id + '/').then(function(res) {
			$scope.tests = res.data;
		}).catch(Notify.danger);
	}
]);

app.controller('testDetailController',
	['$scope', '$http', '$route', '$location', '$routeParams', 'Notify',
	function($scope, $http, $route, $location, $routeParams, Notify) {
		$scope.test_id = $routeParams.test_id;
		$http.get('/api/test/' + $scope.test_id).then(function(res) {
			$scope.run = res.data;
		}).catch(Notify.danger);
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
			var args = data.args = data.args || {};
			args.configure = args.configure || [];
			args.make = args.make || [];
			args.bind = args.bind || [];

			data.zoneset = data.zoneset || "root";
			data.queryset = data.queryset || "default";
			data.options = data.options || "";
			data.global = data.global || "";
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
