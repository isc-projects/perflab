(function() {
var app = angular.module('perflabApp');

"use strict";

//
// uses a WebSocket to receive info about updates to tables from a
// MongoDB oplog tail, and allows listeners to subscribe to those
// updates
//
app.service('OpLog',
	[ '$rootScope', '$timeout', 'Notify',
	function($rootScope, $timeout, Notify) {
		(function connect() {
			var ops = {'i': 'insert', 'u': 'update', 'd': 'delete'};
			var url = 'ws://' + window.location.hostname + ':' + window.location.port;
			var ws = new WebSocket(url);
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
					$rootScope.$apply();		// force Angular to notice
				}
			}
		})();

		return {
			'on': function(ev, handler, scope) {
				scope = scope || $rootScope;
				scope.$on('oplog.' + ev, handler);
			}
		};
	}
]);

//
// service that exposes the global "system paused" state, and
// monitors for changes to that state (via OpLog)
//
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
					Notify.danger('Queue paused (current job will complete)');
				}
				service.paused = res.data.paused;
			});
		}

		OpLog.on('update.control', update);
		update();

		return service;
	}
]);

//
// service that retrieves the last lines of log data stored in
// the 'log' collection over REST, then uses OpLog to watch for
// real-time changes to the collection.
//
app.service('LogWatcher',
	['$rootScope', '$http', 'OpLog', 'Notify',
	function($rootScope, $http, OpLog, Notify) {

		var log = [];
		var byid = {};		// used to ensure IDs don't get duplicated

		$http.get('/api/log/').then(function(res) {
			log.push.apply(log, res.data);
			log.forEach(function(l) {
				byid[l._id] = 1;
			});
		}).then(subscribe).catch(Notify.danger);

		function subscribe() {
			OpLog.on('insert.log', function(ev, data) {
				if (! (data._id in byid)) {
					byid[data._id] = 1;
					log.push(data);
				}
				while (log.length > 100) {
					var id = log[0]._id;
					delete byid[id];
					log.shift();
				}
			});
		}

		return {
			output: log
		}
	}
]);

//
// service that retrieves the current set of configurations and related
// queue items, then uses OpLog to monitor for changes to those.
//
// also supports changing the queue 'enabled' and 'repeat' state for
// individual configurations
//
app.service('Configs',
	['$http', 'Notify', 'Beeper', 'OpLog',
	function($http, Notify, Beeper, OpLog) {

		var configs = [], queue = [];
		var confById = {};

		function merge() {
			var tmp = {};
			configs.forEach(function(conf) {
				tmp[conf._id] = conf;
			});

			queue.forEach(function(queue) {
				if (tmp[queue._id]) {
					tmp[queue._id].queue = queue;
				}
			});
		}

		function getConfigs() {
			return $http.get('/api/config/').then(function(res) {
				configs.length = 0;
				configs.push.apply(configs, res.data);
			}).catch(Notify.danger);
		}

		function getQueue() {
			return $http.get('/api/queue/').then(function(res) {
				queue.length = 0;
				queue.push.apply(queue, res.data);
			}).catch(Notify.danger);
		}

		function updateConfig() {
			return getConfigs().then(merge);
		}

		function updateQueue() {
			Beeper.play();
			return getQueue().then(merge);
		}

		function setEnabled(id, enabled)  {
			return $http.put('/api/queue/' + id + '/enabled/', {enabled: !!enabled}).catch(Notify.danger);
		}

		function setRepeat(id, repeat)  {
			return $http.put('/api/queue/' + id + '/repeat/', {repeat: !!repeat}).catch(Notify.danger);
		}

		getConfigs().then(getQueue).then(merge);

		OpLog.on('update.config', updateConfig);
		OpLog.on('insert.config', updateConfig);
		OpLog.on('delete.config', updateConfig);

		OpLog.on('update.queue', updateQueue);
		OpLog.on('insert.queue', updateQueue);
		OpLog.on('delete.queue', updateQueue);

		return {
			all: configs,
			setEnabled: setEnabled,
			setRepeat: setRepeat
		}
	}
]);

})();
