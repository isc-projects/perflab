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

		var url = ['/api/config/run/', id, '/paged/?',
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

function plotter(e) {
	// This is the officially endorsed way to plot all the series at once.
	if (e.seriesIndex !== 0) return;

	var BAR_WIDTH = 4;
	var setCount = e.seriesCount;
	if (setCount != 2) {
		throw 'Exactly 2 values for each point must be provided for chart ([mid, err], [low, high])';
	}

	var area = e.plotArea;
	var ctx = e.drawingContext;
	ctx.strokeStyle = '#202020';
	ctx.lineWidth = 0.6;
	ctx.fillStyle ='rgba(44,224,44,1.0)';

	var sets = e.allSeriesPoints;
	for (var p = 0 ; p < sets[0].length; p++) {
		ctx.beginPath();
		var topY = area.h * sets[1][p].y_top + area.y;
		var bottomY = area.h * sets[1][p].y_bottom + area.y;
		var centerX = area.x + sets[0][p].x * area.w;
		ctx.moveTo(centerX, topY);
		ctx.lineTo(centerX, bottomY);
		ctx.closePath();
		ctx.stroke();

		var bodyYmin = area.h * sets[0][p].y_bottom + area.y;
		var bodyYmax = area.h * sets[0][p].y_top + area.y;
		ctx.fillRect(centerX - BAR_WIDTH / 2, bodyYmin, BAR_WIDTH, bodyYmax - bodyYmin);
	}
}

app.controller('runDygraphController',
	['$scope', '$route', '$routeParams', '$location', 'Notify',
	 'ConfigResource', 'RunResource',
	function ($scope, $route, $routeParams, $location, Notify, ConfigResource, RunResource) {
		var id = $routeParams.config_id;
		$scope.graph = {
			data: [],
			options: {
				errorBars: true, sigma: 1, showRangeSelector: false,
				labels: ['x', 'Average', 'Range'],
				legend: 'follow',
				xlabel: 'Date / Time',
				ylabel: 'Queries per second',
				height: 500,
				axes: { y: { axisLabelWidth: 70 } },
				labelsSeparateLines: true,
				dateWindow: [Date.now() - 2 * 86400000, Date.now()],
				plotter: plotter,
				series: {
					Average: { label: 'Average' },
					Range: { label: 'Range', highlightCircleSize: 0 }
				},
				valueFormatter: function(v, o, s, d, r, c) {
					if (s === 'x') {
						return  Dygraph.dateValueFormatter.apply(this, arguments);
					} else if (s === 'Average') {
						var range = d.getValue(r, c);
						return Dygraph.numberValueFormatter.call(this, range[0], o, s, d, r, c)
							   + '&nbsp;±&nbsp;' +
							   Dygraph.numberValueFormatter.call(this, range[1], o, s, d, r, c);
					} else {
						var range = d.getValue(r, c);
						return Dygraph.numberValueFormatter.call(this, range[0] - range[1], o, s, d, r, c)
							   + '&nbsp;&dash;&nbsp;' +
							   Dygraph.numberValueFormatter.call(this, range[0] + range[1], o, s, d, r, c);
					}
				},
				pointClickCallback: function(e, point) {
					var id = $scope.graph.data[point.idx].id;
					$location.path('/run/test/' + id + '/');
					$route.reload();
				}
			}
		};

		$scope.config = ConfigResource.get({id: id});

		RunResource.query({config_id: id}).$promise.then(function(data) {
			$scope.graph.data = data.filter(function(run) {
				return run.stats !== undefined && run.created !== undefined;
			}).map(function(run) {
				var s = run.stats;
				var r = [
					new Date(run.created),
					[s.average, s.stddev],
					[(s.min + s.max) / 2, (s.max - s.min) / 2],
				];
				r.id = run._id;		// slight hack - store ID as an array property
				return r;
			}).sort(function(a, b) { return a[0] - b[0] });
		});
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
			$http.get('/api/config/run/' + $scope.id + '/paged/?limit=1').then(function(res) {
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
