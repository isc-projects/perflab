(function() {

"use strict";

var app = angular.module('perflabApp');

app.directive('cfgButtonQueue', function() {
    return {
        templateUrl: 'partials/config-queue.html'
	}
});

app.directive('cfgButtonGraph', function() {
    return {
        template: '<a href="#/config/run/{{config._id}}/" class="icon-button btn btn-sm btn-primary"><span class="fas fa-chart-bar" title="Graph"></span></a>',
	}
});

app.directive('cfgButtonList', function() {
    return {
        template: '<a href="#/config/run/{{config._id}}/list/" class="icon-button btn btn-sm btn-primary"><span class="fas fa-bars" title="List"></span></a>',
	}
});

app.directive('cfgButtonExport', function() {
    return {
        template: '<a href="/api/config/run/{{config._id}}/stats" class="icon-button btn btn-sm btn-primary"><span class="fas fa-download" title="Export CSV"></span></a>',
	}
});

app.directive('cfgButtonEdit', function() {
    return {
        template: '<a href="#/config/edit/{{config.type}}/{{config._id}}" class="icon-button btn btn-sm btn-primary"><span class="fas fa-cog" title="Edit"></span></a>',
	}
});

app.directive('runButtonMemory', function() {
    return {
        template: '<a href="#/run/memory/{{run._id}}/" class="fixed-button btn btn-sm btn-primary"><span class="fas fa-chart-line"></span>Memory</a>'
	}
});

})();
