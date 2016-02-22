(function() {

"use strict";

var app = angular.module('perflabApp');

app.controller('configTypeController',
	['$scope', '$routeParams',
	function ($scope, $routeParams) {

		$scope.editor =  {
			bind: {
				name: 'BIND',
				multimode: true,
				options: 'named.conf options {} statements',
				global: 'named.conf global configuration blocks'
			},
			nsd: {
				name: 'NSD',
				multimode: false,
				options: 'nsd.conf server: statements',
				global: 'nsd.conf global configuration blocks'
			},
			knot: {
				name: 'Knot2',
				multimode: false,
				global: 'knot.conf global configuration blocks'
			}
		}[$routeParams.type];

	}
]);

})();
