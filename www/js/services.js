const app = angular.module('perflabApp');

//
// uses a WebSocket to receive info about updates to tables from a
// MongoDB oplog tail, and allows listeners to subscribe to those
// updates
//
app.service('OpLog', [
	'$rootScope', '$timeout', 'Notify',
	function ($rootScope, $timeout, Notify) {

		(function connect() {

			const loc = window.location;
			const ops = {'i': 'insert', 'u': 'update', 'd': 'delete'};
			const proto = (loc.protocol === 'https:') ? 'wss:' : 'ws:';
			const url = `${proto}//${loc.hostname}:${loc.port}/oplog`;

			const ws = new WebSocket(url);
			ws.onclose = function() {
				Notify.danger('WebSocket closed - retrying in 10s');
				$timeout(connect, 10000);
			}
			ws.onmessage = function(ev) {
				const msg = JSON.parse(ev.data);
				const coll = msg.ns;
				const op = ops[msg.op];
				if (op) {
					$rootScope.$applyAsync(() => {
						$rootScope.$emit('oplog.' + op + '.' + coll, msg.doc);
					});
				}
			}
		})();

		const on = (ev, handler) => $rootScope.$on(`oplog.${ev}`, handler);

		return { on };
	}
]);

//
// service that exposes the global system state, and
// monitors for changes to that state (via OpLog)
//
app.service('SystemControl', [
	'$http', 'OpLog', 'Notify',
	function ($http, OpLog, Notify) {

		const service = {
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
app.service('LogWatcher', [
	'$http', 'OpLog', 'Notify',
	function($http, OpLog, Notify) {

		const log = { '' : [] };
		const byid = { '': {} };		// used to ensure IDs don't get duplicated

		function save(data, host) {

			const key = host || '';
			const idref = byid[key] = byid[key] || {};

			if (data._id in idref) {
				return;
			}

			const ref = log[key] = log[key] || [];
			ref.push(data);
			idref[data._id] = 1;

			if (ref.length > 300) {
				const first = ref.shift();
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
app.service('ConfigList', [
	'$http', 'Notify', 'Beeper', 'OpLog', 'ConfigListResource',
	function($http, Notify, Beeper, OpLog, ConfigListResource) {

		const configs = ConfigListResource.query();
		configs.$promise.then(updateAll);

		function configIndex(id) {
			const index = configs.findIndex(config => config._id === id);
			if (index < 0) {
				throw new Error('request for unexpected configuration ID');
			}
			return index;
		}

		function configById(id) {
			const index = configIndex(id);
			return configs[index];
		}

		function updateState(config) {
			config.progress = 100;
			config.testing = false;
			if (config.queue.running) {
				const state = config.queue.state || '';
				const match = state.match(/^test (\d+)\/(\d+)$/);
				if (match) {
					config.testing = true;
					config.progress = 100.0 * (+match[1] / +match[2]);
				}
			}
		}

		function updateAll(configs) {
			configs.forEach(updateState);
		}

		function insertConfig(event, doc) {
			if (doc) {
				return ConfigListResource.get({id: doc._id}).$promise.then(function(config) {
					configs.push(config);
					updateState(config);
				}).catch(Notify.danger);
			}
		}

		function deleteConfig(event, doc) {
			if (!doc) return;
			const index = configIndex(doc._id);
			configs.splice(index, 1);
		}

		function updateConfig(event, doc) {
			if (!doc) return;
			let config = configById(doc._id);

			if (doc.$set && doc.$set['queue.completed']) {
				Beeper.play();
				Notify.info({
					message: `Run of ${config.name} completed`,
					url: `#/config/run/${doc._id}/list`,
					target: '_self'
				}, {
					allow_dismiss: true, delay: 30000
				});
			}

			ConfigListResource.get({id: doc._id}).$promise.then(function(data) {
				config.name = data.name;
				config.queue = data.queue;
				config.type = data.type;
				config.archived = data.archived;
				updateState(config);
			});
		}

		function setEnabled(id, enabled)  {
			enabled = !!enabled;
			return $http.put(`/api/config/${id}/queue/enabled/`, {enabled}).catch(Notify.danger);
		}

		function setRepeat(id, repeat)  {
			repeat = !!repeat;
			return $http.put(`/api/config/${id}/queue/repeat/`, {repeat}).catch(Notify.danger);
		}

		function togglePriority(id) {
			let config = configById(id);
			if (config.queue) {
				const priority = config.queue.priority ? 0 : 1;
				return $http.put(`/api/config/${id}/queue/priority/`, {priority}).catch(Notify.danger);
			}
		}

		OpLog.on('update.config', updateConfig);
		OpLog.on('insert.config', insertConfig);
		OpLog.on('delete.config', deleteConfig);

		return {
			all: configs,
			setEnabled, setRepeat, togglePriority
		}
	}
]);

app.service('Stats', [
	function() {

		const defaults = JSON.stringify({a:{}, b:{}});
		const stats = JSON.parse(localStorage.stats || defaults);

		function store() {
			localStorage.stats = JSON.stringify(stats);
		}

		function getData(group) {
			return [].concat.apply([], 
				Object.keys(stats[group]).map(function(k) {
					return stats[group][k];
				})
			)
			.filter((n) => !isNaN(n))
			.sort((a, b) => a - b);
		}

		function calculate() {

			const a = getData('a');
			const b = getData('b');

			const info = (data) => ({
				count: data.length,
				mean: ss.mean(data),
				stddev: ss.sampleStandardDeviation(data),
				median: ss.quantileSorted(data, 0.5)
			});

			const t = ss.tTestTwoSample(a, b, 0);
			const p = Math.studentP(t, a.length + b.length - 2);

			return {
				a: info(a),
				b: info(b),
				t, p
			};
		}

		return {
			calculate,

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


app.service('Agents',
	['$q', 'ClientAgentResource', 'ServerAgentResource',
	function($q, ClientAgentResource, ServerAgentResource) {

		const clients = ClientAgentResource.query();
		const servers = ServerAgentResource.query();
		const $promise = $q.all([clients.$promise, servers.$promise]);

		function getAgents(set, protocol) {
			let r = [];
			for (let [key, agent] of Object.entries(set)) {
				if (key.substring(0, 1) === '$') continue;
				if (protocol && (agent.protocol !== protocol)) {
					continue;
				}
				agent.key = key;
				r.push(agent);
			}
			return r;
		}

		const service = {
			clients: protocol => getAgents(clients, protocol),
			servers: protocol => getAgents(servers, protocol),
			server: type => servers[type],
			$resolved: false,
			$promise
		}

		$promise.then(() => service.$resolved = true);

		return service;
	}
]);

app.service('Settings',
	['SettingsResource',
	function(SettingsResource) {
		return SettingsResource.get();
	}
]);
