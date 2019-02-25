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
			var proto = (window.location.protocol == 'https:') ? 'wss:' : 'ws:';
			var url = proto + '//' + window.location.hostname + ':' +
					  window.location.port + '/oplog';
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
					$rootScope.$applyAsync();		// force Angular to notice
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
// service that exposes the global system state, and
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
			paused: undefined,
			running: {}
		};

		function updateControl() {
			return $http.get('/api/control/').then(function(res) {
				if (service.paused === true && !res.data.paused) {
					Notify.info('Queue running');
				} else if (service.paused === false && res.data.paused) {
					Notify.danger('Queue paused (current job will complete)');
				}
				service.paused = res.data.paused;
			});
		}

		OpLog.on('update.control', updateControl);

		OpLog.on('insert.run', (ev, doc) => {
			if (doc) {
				service.running.config_id = doc.config_id;
				service.running.run_id = doc._id;
			}
		});

		OpLog.on('update.run', (ev, doc) => {
			if (doc) {
				if (doc.completed) {
					delete service.running.run_id;
				} else {
					service.running.config_id = doc.config_id;
					service.running.run_id = doc._id;
				}
			}
		});

		OpLog.on('insert.test', (ev, doc) => {
			if (doc) {
				service.running.test_id = doc._id;
			}
		});

		OpLog.on('update.test', (ev, doc) => {
			if (doc && doc.completed) {
				delete service.running.test_id;
			}
		});

		updateControl();

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

		var log = { "" : [] };
		var byid = { "": {} };		// used to ensure IDs don't get duplicated

		function save(data, host) {

			var key = host || "";
			var idref = byid[key] = byid[key] || {};

			if (data._id in idref) {
				return;
			}

			var ref = log[key] = log[key] || [];
			ref.push(data);
			idref[data._id] = 1;

			if (ref.length > 300) {
				var first = ref.shift();
				delete idref[first._id];
			}
		}

		$http.get('/api/log/').then(function(res) {
			res.data.forEach(function(l) {
				save(l);
				save(l, l.host);
			});
		}).then(subscribe).catch(Notify.danger);

		function subscribe() {
			OpLog.on('insert.log', function(ev, l) {
				save(l);
				save(l, l.host);
			});
		}

		return {
			output: log,
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
app.service('ConfigList',
	['$http', 'Notify', 'Beeper', 'OpLog', 'ConfigListResource',
	function($http, Notify, Beeper, OpLog, ConfigListResource) {

		var configs = [], queue = [];
		var confById = {};
		var loading = true;

		function updateState(conf) {
			conf.progress = 100;
			conf.testing = false;
			if (conf.queue.running) {
				var state = conf.queue.state || '';
				var match = state.match(/^test (\d+)\/(\d+)$/);
				if (match) {
					conf.testing = true;
					conf.progress = 100.0 * (+match[1] / +match[2]);
				}
			}
		}

		function reindex() {
			confById = {};
			configs.forEach(function(conf, index) {
				conf.index = index;
				confById[conf._id] = conf;
				updateState(conf);
			});
		}

		function getConfigs() {
			ConfigListResource.query().$promise.then(function(data) {
				configs.length = 0;
				[].push.apply(configs, data);
				reindex();
				loading = false;
			}).catch(Notify.danger);
		}

		function insertConfig(event, doc) {
			if (doc) {
				return ConfigListResource.get(doc._id).$promise.then(function(data) {
					configs.push(data);
					reindex();
				}).catch(Notify.danger);
			}
		}

		function deleteConfig(event, doc) {
			//@ TODO - make more efficient
			getConfigs();
		}

		function updateConfig(event, doc) {
			if (!doc) return;
			var conf = confById[doc._id];
			if (!conf) return;

			if (doc.$set && doc.$set['queue.completed']) {
				Beeper.play();
				Notify.info({
					message: `Run of ${conf.name} completed`,
					url: `#/config/run/${doc._id}/list`,
					target: '_self'
				}, {
					allow_dismiss: true, delay: 30000
				});
			}

			ConfigListResource.get({id: doc._id}).$promise.then(function(data) {
				conf.name = data.name;
				conf.queue = data.queue;
				conf.type = data.type;
				conf.archived = data.archived;
				updateState(conf);
			});
		}

		function setEnabled(id, enabled)  {
			return $http.put('/api/config/' + id + '/queue/enabled/', {enabled: !!enabled}).catch(Notify.danger);
		}

		function setRepeat(id, repeat)  {
			return $http.put('/api/config/' + id + '/queue/repeat/', {repeat: !!repeat}).catch(Notify.danger);
		}

		function togglePriority(id) {
			if (confById[id] && confById[id].queue) {
				var pri = confById[id].queue.priority || 0;
				pri = pri ? 0 : 1;
				return $http.put('/api/config/' + id + '/queue/priority/', {priority: pri}).catch(Notify.danger);
			}
		}

		getConfigs();

		OpLog.on('update.config', updateConfig);
		OpLog.on('insert.config', insertConfig);
		OpLog.on('delete.config', deleteConfig);

		return {
			all: configs,
			loading: function() {
				return loading;
			},
			setEnabled: setEnabled,
			setRepeat: setRepeat,
			togglePriority: togglePriority
		}
	}
]);

app.service('Stats',
	[function() {

		var defaults = JSON.stringify({a:{}, b:{}});
		var stats = JSON.parse(localStorage.stats || defaults);

		function store() {
			localStorage.stats = JSON.stringify(stats);
		}

		function getData(group) {
			return [].concat.apply([], 
				Object.keys(stats[group]).map(function(k) {
					return stats[group][k];
				})
			)
			.filter(function(n) { return !isNaN(n); })
			.sort(function(a, b) { return a - b });
		}

		function calculate() {

			var a = getData('a');
			var b = getData('b');

			function info(data) {
				return {
					count: data.length,
					mean: ss.mean(data),
					stddev: ss.sampleStandardDeviation(data),
					median: ss.quantileSorted(data, 0.5)
				};
			}

			var t = ss.tTestTwoSample(a, b, 0);
			var p = Math.studentP(t, a.length + b.length - 2);

			return {
				a: info(a),
				b: info(b),
				t: t,
				p: p
			};
		}

		return {
			calculate: calculate,

			ready: function() {
				return !!(Object.keys(stats.a).length && Object.keys(stats.b).length);
			},

			empty: function() {
				return !Object.keys(stats.a).length && !Object.keys(stats.b).length;
			},

			reset: function() {
				stats = JSON.parse(defaults);
				store();
			},

			getgroup: function(id) {
				return id in stats.a ? 'a' :
					   id in stats.b ? 'b' :
					   undefined;
			},

			setgroup: function(id, data, group) {
				if (group === 'a') {
					delete stats.b[id];
				} else if (group === 'b') {
					delete stats.a[id];
				}
				stats[group][id] = data;
				store();
			},

			del: function(id) {
				delete stats.a[id];
				delete stats.b[id];
				store();
			}
		}
	}
]);

})();
