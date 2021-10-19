const app = angular.module('perflabApp');

app.controller('runGraphController',
	['$scope', '$route', '$routeParams', '$location',
	 'Notify', 'ConfigResource', 'RunResource',
	function ($scope, $route, $routeParams, $location,
			  Notify, ConfigResource, RunResource)
	{
		var id = $routeParams.config_id;

		$scope.graph = {
			data: [],
			options: {
				errorBars: true, sigma: 1, showRangeSelector: false,
				labels: ['x', 'Average', 'Range'],
				series: {
					Average: { /* label: 'Average' */  },
					Range: { /* label: 'Range', */ highlightCircleSize: 0 }
				},
				xlabel: 'Date / Time',
				ylabel: 'Ops per second',
				valueRange: [0, null],
				axes: {
					x: { axisLabelWidth: 70 },
					y: { axisLabelWidth: 70 }
				},
				height: 500,
				legend: 'follow',
				labelsSeparateLines: true,
				dateWindow: [Date.now() - 56 * 86400000, Date.now()],
				pointClickCallback: function(e, point) {
					var id = $scope.graph.data[point.idx].id;
					$location.path('/run/test/' + id + '/');
					$route.reload();
				},
				plotter: plotter,
				valueFormatter: formatter,
				underlayCallback: drawRegression,
				ready: function(g) {
					if ($scope.annotations) {
						g.setAnnotations($scope.annotations);
					}
				}
			}
		};

		$scope.config = ConfigResource.get({id: id});

		RunResource.query({config_id: id}).$promise.then(function(data) {

			data = data.filter(function(run) {
				return run.stats !== undefined && run.created !== undefined;
			}).map(function(run) {
				var s = run.stats;
				var r = [
					new Date(run.created),
					[s.average, s.stddev ? s.stddev : 0],
					[(s.min + s.max) / 2, (s.max - s.min) / 2],
				];
				r.id = run._id;		// slight hack - r is now an array with properties
				r.version = run.version;
				return r;
			}).sort(function(a, b) { return a[0] - b[0] });

			var version;
			$scope.annotations = data.filter(function(run) {
				if (run.version === undefined) {
					return false;
				}
				if (run.version !== version) {
					version = run.version;
					return true;
				}
			}).map(function(run) {
				return {
					x: +run[0],
					shortText: '*',
					text: run.version,
					series: 'Average',
					attachAtBottom: true
				}
			});

			$scope.graph.data = data;

		}).catch(Notify.danger);
	}
]);

function plotter(e) {
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
		let crosshair_size = 2;
		if (Math.abs(topY - bottomY) > crosshair_size) {
			ctx.moveTo(centerX, topY);
			ctx.lineTo(centerX, bottomY);
		} else {  // a single point, draw it as crosshair
			ctx.moveTo(centerX + crosshair_size, topY + crosshair_size);
			ctx.lineTo(centerX - crosshair_size, topY - crosshair_size);
			ctx.moveTo(centerX - crosshair_size, topY + crosshair_size);
			ctx.lineTo(centerX + crosshair_size, topY - crosshair_size);
		}
		ctx.closePath();
		ctx.stroke();

		var bodyYmin = area.h * sets[0][p].y_bottom + area.y;
		var bodyYmax = area.h * sets[0][p].y_top + area.y;
		ctx.fillRect(centerX - BAR_WIDTH / 2, bodyYmin, BAR_WIDTH, bodyYmax - bodyYmin);
	}
}

function drawRegression(ctx, area, g) {

	if (g === undefined) return;

	// work out coefficients
	var range = g.xAxisRange();
	var sum_xy = 0.0, sum_x = 0.0, sum_y = 0.0, sum_x2 = 0.0, num = 0;
	for (var i = 0, n = g.numRows(); i < n; i++) {
		var x = g.getValue(i, 0);
		if (x < range[0] || x > range[1]) continue;

		var y = g.getValue(i, 1);
		if (y == null) continue;
		y = y[0];

		num++;
		sum_x += x;
		sum_y += y;
		sum_xy += x * y;
		sum_x2 += x * x;
	}

	var a = (sum_xy - sum_x * sum_y / num) / (sum_x2 - sum_x * sum_x / num);
	var b = (sum_y - a * sum_x) / num;
	if (isNaN(a) || isNaN(b)) return;

	var x1 = range[0], x2 = range[1];
	var y1 = a * x1 + b, y2 = a * x2 + b;

	var p1 = g.toDomCoords(x1, y1);
	var p2 = g.toDomCoords(x2, y2);

	ctx.save();
	ctx.strokeStyle = '#4040c0';
	ctx.lineWidth = 1.5;
	ctx.beginPath();
	ctx.moveTo(p1[0], p1[1]);
	ctx.lineTo(p2[0], p2[1]);
	ctx.stroke();
	ctx.restore();
}

function formatter(v, o, s, d, r, c) {
	var dvf = Dygraph.dateValueFormatter;
	var nvf = Dygraph.numberValueFormatter;

	if (s === 'x') {
		return dvf.apply(this, arguments);
	} else if (s === 'Average') {
		var range = d.getValue(r, c);
		return nvf.call(this, range[0], o, s, d, r, c)
			   + '&nbsp;±&nbsp;' +
			   nvf.call(this, range[1], o, s, d, r, c);
	} else {
		var range = d.getValue(r, c);
		return nvf.call(this, range[0] - range[1], o, s, d, r, c)
			   + '&nbsp;&dash;&nbsp;' +
			   nvf.call(this, range[0] + range[1], o, s, d, r, c);
	}
}
