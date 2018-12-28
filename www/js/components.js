(function() {

"use strict";

var app = angular.module('perflabApp');

app.directive('cfgButtonQueue', function() {
	return {
		templateUrl: 'partials/config-queue.html'
	}
});

app.directive('perflabButton', function() {
	return {
		template: '<a href="{{href}}" class="icon-button btn btn-sm btn-primary"><span class="fas {{icon}}" title="{{title}}"></span>{{text}}</a>',
		restrict: 'E',
		replace: true,
		scope: { href: '@', title: '@', icon: '@', text: '@' }
	}
});

app.directive('cfgButtonGraph', function() {
	return {
		template: '<perflab-button href="#/config/run/{{config._id}}/" icon="fa-chart-bar" title="Graph" />'
	}
});

app.directive('cfgButtonList', function() {
	return {
		template: '<perflab-button href="#/config/run/{{config._id}}/list/" icon="fa-bars" title="List" />'
	}
});

app.directive('cfgButtonExport', function() {
	return {
		template: '<perflab-button href="/api/config/run/{{config._id}}/stats" icon="fa-download" title="Export CSV" />',
	}
});

app.directive('cfgButtonEdit', function() {
	return {
		template: '<perflab-button href="#/config/edit/{{config.type}}/{{config._id}}" icon="fa-cog" title="Edit" />',
	}
});

app.directive('runButtonMemory', function() {
	return {
		template: '<perflab-button href="#/run/memory/{{run._id}}/" icon="fa-chart-line" text=" Memory" />'
	}
});

})();
