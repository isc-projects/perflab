(function() {

"use strict";

var app = angular.module('perflabApp');

app.controller('configTypeController',
	['$scope', '$routeParams',
	function ($scope, $routeParams) {

		$scope.editor =  {
			bind: {
				name: 'BIND',
				type: {
					auth: true,
					recursive: true
				},
				options: 'named.conf options {} statements',
				global: 'named.conf global configuration blocks'
			},
			nsd: {
				name: 'NSD',
				type: {
					auth: true,
				},
				options: 'nsd.conf server: statements',
				global: 'nsd.conf global configuration blocks'
			},
			knot: {
				name: 'Knot2',
				type: {
					auth: true,
				},
				global: 'knot.conf global configuration blocks'
			},
			echo: {
				name: 'Echo',
				type: { }
			}
		}[$routeParams.type];

		$scope.editor.multimode = Object.keys($scope.editor.type).length > 1;
	}
]);

})();
