var app = angular.module('perflabApp');

app.controller('memoryGraphController',
	['$scope', '$route', '$routeParams', '$location',
	 'Notify', 'ConfigResource', 'RunResource', 'MemoryResource',
	function ($scope, $route, $routeParams, $location,
			  Notify, ConfigResource, RunResource, MemoryResource) {

		var id = $routeParams.run_id;

		$scope.graph = {
			data: [],
			options: {
				showRangeSelector: false,
				labels: ['x', 'Resident', 'Data'],
				xlabel: 'Date / Time',
				ylabel: 'Memory (MB)',
				axes: { y: { axisLabelWidth: 80 } },
				height: 500,
				legend: 'follow'
			}
		};

		$scope.run = RunResource.get({id: id});
		$scope.run.$promise.then(function(data) {
			$scope.config = ConfigResource.get({id: data.config_id});
		});

		MemoryResource.query({run_id: id}).$promise.then(function(data) {
			$scope.graph.data = data.map(function(rec) {
				return [
					new Date(rec.ts),
					rec.data[0] * 4096 / 1048576,
					rec.data[5] * 4096 / 1048576
				];
			}).sort(function(a, b) { return a[0] - b[0] });
		}).catch(Notify.danger);
	}
]);
