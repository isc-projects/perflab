(function() {
var app = angular.module('perflabApp');

app.service('SystemControl',
	['$http', '$timeout', 'Notify',
	function($http, $timeout, Notify) {
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

		(function loop() {
			update().then(function() { $timeout(loop, 1000); });
		})();

		return service;
	}
]);

app.service('LogWatcher',
	['$http', '$timeout', 'Notify',
	function($http, $timeout, Notify) {

		var log = [];

		$http.get('/api/log/').then(function(res) {
			log.push.apply(log, res.data);
		}).catch(Notify.danger).then(connect);

		function connect() {
			var ws = new WebSocket('ws://' + window.location.hostname + ':8001/');
			ws.onclose = function() {
				Notify.danger('WebSocket closed - retrying in 30s');
				$timeout(connect, 10000);
			}
			ws.onmessage = function(ev) {
				var obj = JSON.parse(ev.data);
				log.push(obj);
				if (log.length > 100) {
					log.shift();
				}
			}
		}

		return {
			output: log
		}
	}
]);
})();
