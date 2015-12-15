(function() {

var app = angular.module('perflabApp');

app.controller('logViewController', ['$scope', 'LogWatcher',
	function ($scope, LogWatcher) {
		$scope.logwatch = LogWatcher;
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
		}).catch(Notify.danger);

		var p2 = $http.get('/api/queue/').then(function(res) {
			$scope.queue = res.data;
		}).catch(Notify.danger);

		$q.all([p1, p2]).then(function() {
			$scope.queue.forEach(function(queue) {
				if (queue.config_id in $scope.configsById) {
					$scope.configsById[queue.config_id].queue = queue;
				}
			});
		});

		$scope.tick = (b) => 'glyphicon ' + (b ? 'glyphicon-ok' : 'glyphicon-remove');

		$scope.control = SystemControl;
	}
]);

app.controller('runListController',
	['$scope', '$http', '$route', '$location',
	 '$routeParams', 'linkHeaderParser', 'Notify',
	function($scope, $http, $route, $location, $routeParams, lhp, Notify) {

		$scope.config_id = $routeParams.config_id;

		var search = $location.search();
		$scope.skip = search.skip || 0;
		$scope.limit = search.limit || 15;
		$scope.page = Math.floor($scope.skip / $scope.limit) + 1;

		$http.get('/api/config/' + $scope.config_id).then(function(res) {
			$scope.config = res.data;
		}).catch(Notify.danger);

		var url = ['/api/config/run/', $scope.config_id, '/paged/?',
					'skip=', $scope.skip, '&', 'limit=', $scope.limit].join('');

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

function plotter(e) {
	// This is the officially endorsed way to plot all the series at once.
	if (e.seriesIndex !== 0) return;

	var BAR_WIDTH = 4;
	var setCount = e.seriesCount;
	if (setCount != 4) {
		throw 'Exactly 4 values for each point must be provided for chart (open close high low)';
	}

	var prices = [];
	var price;
	var sets = e.allSeriesPoints;
	for (var p = 0 ; p < sets[0].length; p++) {
		price = {
			open : sets[0][p].yval,
			close : sets[1][p].yval,
			high : sets[2][p].yval,
			low : sets[3][p].yval,
			openY : sets[0][p].y,
			closeY : sets[1][p].y,
			highY : sets[2][p].y,
			lowY : sets[3][p].y
		};
		prices.push(price);
	}

	var area = e.plotArea;
	var ctx = e.drawingContext;
	ctx.strokeStyle = '#202020';
	ctx.lineWidth = 0.6;

	for (p = 0 ; p < prices.length; p++) {
		ctx.beginPath();

		price = prices[p];
		var topY = area.h * price.highY + area.y;
		var bottomY = area.h * price.lowY + area.y;
		var centerX = area.x + sets[0][p].x * area.w;
		ctx.moveTo(centerX, topY);
		ctx.lineTo(centerX, bottomY);
		ctx.closePath();
		ctx.stroke();
		var bodyY;
		if (price.open > price.close) {
			ctx.fillStyle ='rgba(224,44,44,1.0)';
			bodyY = area.h * price.openY + area.y;
		}
		else {
			ctx.fillStyle ='rgba(44,224,44,1.0)';
			bodyY = area.h * price.closeY  + area.y;
		}
		var bodyHeight = area.h * Math.abs(price.openY - price.closeY);
		ctx.fillRect(centerX - BAR_WIDTH / 2, bodyY, BAR_WIDTH,  bodyHeight);
	}
}

app.controller('runDygraphController',
	['$scope', '$http', '$routeParams', 'Notify',
	function ($scope, $http, $routeParams, Notify) {
		$scope.config_id = $routeParams.config_id;
		$scope.graph = {
			data: [],
			options: {
				labels: ['x', 'open', 'close', 'high', 'low'],
				showRangeSelector: false, ylabel: 'Queries per second',
				dateWindow: [Date.now() - 2 * 86400000, Date.now()],
				plotter: plotter
			},
			legend: {
				series: {
					open: { label: 'Open', format: 1 },
					close: { label: 'Close', format: 1 },
					high: { label: 'High', format: 1 },
					low: { label: 'Low', format: 1 }
				},
				dateFormat: 'YYYY/MM/DD HH:mm:ss'
			}
		};

		$http.get('/api/config/' + $scope.config_id).then(function(res) {
			$scope.config = res.data;
		}).catch(Notify.danger);

		$http.get('/api/config/run/' + $scope.config_id + '/').then(function(res) {
			window.data = $scope.graph.data = res.data.filter(function(run) {
				return run.stats !== undefined && run.created !== undefined;
			}).map(function(run) {
				return [
					new Date(run.created),
					run.stats.average - run.stats.stddev,
					run.stats.average + run.stats.stddev,
					run.stats.max, run.stats.min,
				];
			}).sort(function(a, b) { return a[0] - b[0] });
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

		$http.get('/api/run/' + $scope.run_id).then(function(res) {
			$scope.run = res.data;
			return $http.get('/api/config/' + $scope.run.config_id).then(function(res) {
				$scope.config = res.data;
			});
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

})();
