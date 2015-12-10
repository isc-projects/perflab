(function () {
	angular
		.module('linkHeaderParser', [])
		.factory('linkHeaderParser', linkHeaderParser);

	function linkHeaderParser() {
		return {
			parse: function(header) {
				if (header.length === 0) {
					return {};
				}

				// Split parts by comma
				var parts = header.split(',');

				// Parse each part into a named link
				var links = {};
				for (var i = 0, n = parts.length; i < n; ++i) {
					var section = parts[i].split(';');
					if (section.length !== 2) {
						throw new Error("section could not be split on ';'");
					}
					var url = section[0].replace(/<(.*)>/, '$1').trim();
					var name = section[1].replace(/rel="(.*)"/, '$1').trim();
					links[name] = url;
				}
				return links;
			}
		}
	}
})();

var app = angular.module('perflabApp',
	['ngRoute', 'ngAnimate', 'nvd3', 'linkHeaderParser']);

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

app.controller('logViewController', ['$scope', '$http',
	function ($scope, $http) {

		$http.get('/api/log/').then(function(res) {
			var log = res.data || [];
			$scope.lines = log;
			$scope.$watchCollection('lines', function(){});

			if (!ws) {
				var ws = new WebSocket('ws://' + window.location.hostname + ':8001/');
				ws.onerror = function() {
					notify('WebSocket error', 'danger');
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

app.controller('configListController', ['$scope', '$http', '$q',
	function($scope, $http, $q) {
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
		}).catch(notify);

		$scope.tick = function(b) {
			return 'glyphicon ' + (b ? 'glyphicon-ok' : 'glyphicon-remove');
		}
	}
]);

app.controller('runListController',
	['$scope', '$http', '$route', '$location', '$routeParams', 'linkHeaderParser',
	function($scope, $http, $route, $location, $routeParams, lhp) {
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
		}).catch(notify);
	}
]);

app.controller('runGraphController', ['$scope', '$http', '$routeParams',
	function ($scope, $http, $routeParams) {
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
