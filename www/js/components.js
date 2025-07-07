const app = angular.module('perflabApp');

app.directive('cfgButtonQueue', () => ({
	templateUrl: 'partials/config-queue.html'
}));

app.directive('perflabButton', () => ({
	template: '<a class="icon-button btn btn-sm btn-primary"><span class="fas {{icon}}" title="{{title}}"></span>{{text}}</a>',
	restrict: 'E',
	replace: true,
	scope: { title: '@', icon: '@', text: '@' }
}));

app.directive('cfgButtonGraph', () => ({
	template: '<perflab-button href="#/config/run/{{config._id}}/" icon="fa-chart-bar" title="Graph" />'
}));

app.directive('cfgButtonList', () => ({
	template: '<perflab-button href="#/config/run/{{config._id}}/list/" icon="fa-bars" title="List" />'
}));

app.directive('cfgButtonExport', () => ({
	template: '<perflab-button href="/api/config/batch/stats?ids={{config._id}}" icon="fa-download" title="Export CSV" />',
}));

app.directive('cfgButtonEdit', () => ({
	template: '<perflab-button href="#/config/edit/{{config._id}}" icon="fa-cog" title="Edit" />',
}));

app.directive('runButtonMemory', () => ({
	template: '<perflab-button href="#/run/memory/{{run._id}}/" icon="fa-chart-line" text=" Memory" />'
}));

app.directive('perflabControlButtons', () => ({
	template: `
<button ng-click="control.unpause()" class="icon-button btn btn-sm btn-primary navbar-btn" ng-disabled="!control.paused" title="enable queue">
  <span class="fas fa-play"></span>
</button>
<button ng-click="control.pause()" class="icon-button btn btn-sm btn-primary navbar-btn" ng-disabled="control.paused" title="pause at end of current run">
  <span class="fas fa-pause"></span>
</button>`
}));

app.directive('perflabConfigEntry', () => ({
	replace: false,
	restrict: 'A',
	templateUrl: 'partials/config-list-entry.html'
}));
