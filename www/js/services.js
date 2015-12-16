(function() {
var app = angular.module('perflabApp');

app.service('OpLog',
	[ '$rootScope', '$timeout', 'Notify',
	function($rootScope, $timeout, Notify) {
		(function connect() {
			var ops = {'i': 'insert', 'u': 'update', 'd': 'delete'};
			var ws = new WebSocket('ws://' + window.location.hostname + ':8001/');
			ws.onclose = function() {
				Notify.danger('WebSocket closed - retrying in 10s');
				$timeout(connect, 10000);
			}
			ws.onmessage = function(ev) {
				var msg = JSON.parse(ev.data);
				var coll = msg.ns;
				var op = ops[msg.op];
				if (op) {
					$rootScope.$broadcast('oplog.' + op + '.' + coll, msg.doc);
				}
			}
		})();

		return {
			'on': function(ev, handler) {
				$rootScope.$on('oplog.' + ev, handler);
			}
		};
	}
]);

app.service('SystemControl',
	['$http', 'Notify', 'OpLog',
	function($http, Notify, OpLog) {
		var service = {
			pause: function() {
				$http.put('/api/control/paused/', {paused: true});
			},
			unpause: function() {
				$http.put('/api/control/paused/', {paused: false});
			},
			paused: undefined
		};

		function update() {
			return $http.get('/api/control/').then(function(res) {
				if (service.paused === true && !res.data.paused) {
					Notify.info('Queue running');
				} else if (service.paused === false && res.data.paused) {
					Notify.danger('Queue paused');
				}
				service.paused = res.data.paused;
			});
		}

		OpLog.on('update.control', update);
		update();

		return service;
	}
]);

app.service('LogWatcher',
	['$http', 'OpLog', 'Notify',
	function($http, OpLog, Notify) {

		var log = [];

		$http.get('/api/log/').then(function(res) {
			log.push.apply(log, res.data);
		}).then(subscribe).catch(Notify.danger);

		function subscribe() {
			OpLog.on('insert.log', function(ev, data) {
				log.push(data);
				if (log.length > 100) {
					log.shift();
				}
			});
		}

		return {
			output: log
		}
	}
]);
})();
