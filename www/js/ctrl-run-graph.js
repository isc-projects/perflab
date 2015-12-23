(function() {

"use strict";

var app = angular.module('perflabApp');

app.controller('runGraphController',
	['$scope', '$route', '$routeParams', '$location',
	 'ConfigResource', 'RunResource',
	function ($scope, $route, $routeParams, $location, ConfigResource, RunResource) {
		var id = $routeParams.config_id;
		$scope.graph = {
			data: [],
			options: {
				errorBars: true, sigma: 1, showRangeSelector: false,
				labels: ['x', 'Average', 'Range'],
				series: {
					Average: { label: 'Average' },
					Range: { label: 'Range', highlightCircleSize: 0 }
				},
				xlabel: 'Date / Time',
				ylabel: 'Queries per second',
				axes: { y: { axisLabelWidth: 70 } },
				height: 500,
				legend: 'follow',
				labelsSeparateLines: true,
				dateWindow: [Date.now() - 2 * 86400000, Date.now()],
				pointClickCallback: function(e, point) {
					var id = $scope.graph.data[point.idx].id;
					$location.path('/run/test/' + id + '/');
					$route.reload();
				},
				plotter: plotter,
				valueFormatter: formatter
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
		ctx.moveTo(centerX, topY);
		ctx.lineTo(centerX, bottomY);
		ctx.closePath();
		ctx.stroke();

		var bodyYmin = area.h * sets[0][p].y_bottom + area.y;
		var bodyYmax = area.h * sets[0][p].y_top + area.y;
		ctx.fillRect(centerX - BAR_WIDTH / 2, bodyYmin, BAR_WIDTH, bodyYmax - bodyYmin);
	}
}

function formatter(v, o, s, d, r, c) {
	if (s === 'x') {
		return Dygraph.dateValueFormatter.apply(this, arguments);
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
}

})();
