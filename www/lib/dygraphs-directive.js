angular.module("dygraphs-directive", [])
	.directive('dygraphs', ['$window', function($window) {
		return {
			restrict: 'E', // Use as element
			scope: { // Isolate scope
				data: '=', // Two-way bind data to local scope
				opts: '=?', // '?' means optional
				view: '=?' // '?' means optional
			},
			template: '<div class="dygraphs"></div>',
			link: function(scope, elem, attrs) {

				var ready = scope.opts.ready;
				delete scope.opts.ready;

				var graph = new Dygraph(elem.children()[0], scope.data, scope.opts);

				if (!scope.view) {
					scope.view = {};
				}

				if (typeof ready === 'function') {
					graph.ready(ready);
				}

				scope.$watch("data", function(){
					graph.updateOptions({
						file: scope.data,
						drawCallback: scope.drawCallback
					});
					resize();
				}, true);

				scope.drawCallback = function(data){
					var xAxisRange = data.xAxisRange();
					if (!scope.view) {
						scope.view = {};
					}
					scope.view.from = xAxisRange[0];
					scope.view.to = xAxisRange[1];
					if (!scope.$root.$$phase) {
						scope.$apply();
					}
				};

				function resize() {
					var parent = elem.parent();
					graph.resize(parent.width(), parent.height());
				}

				angular.element($window).bind('resize', resize);
			}
		};
	}]);
