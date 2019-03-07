(function() {

"use strict";

var app = angular.module('perflabApp');

app.controller('logViewController', ['$scope', 'LogWatcher',
	function ($scope, LogWatcher) {

		$scope.logwatch = LogWatcher;

		try {
			$scope.host = JSON.parse(localStorage.loghost);
		} catch (e) {
			$scope.host = '';
		}

		$scope.setHost = function(host) {
			$scope.host = host;
			localStorage.loghost = JSON.stringify(host);
		}

		$scope.hasHosts = function() {
			return Object.keys($scope.logwatch.output || {}).length > 1;
		}

		$scope.setHost($scope.host);
	}
]);

app.controller('configListController',
	['$scope', 'ConfigList', 'Agents',
	function($scope, ConfigList, Agents) {

		// load previously selected protocol value
		$scope.proto = localStorage.proto || undefined;
		$scope.configOrder = localStorage.configOrder || "name";
		$scope.inactive = JSON.parse(localStorage.inactive || 'false');
		$scope.archived = JSON.parse(localStorage.archived || 'false');
		$scope.agents = Agents.servers;

		// set up protocol list
		let agentProtocol = {};
		$scope.agents.$promise.then(function(agents) {
			let protocols = {};
			agents.forEach(agent => {
				let proto = protoMap(agent.protocol) || "Unknown";
				protocols[proto] = 1;
				agentProtocol[agent.key] = proto;
			});
			$scope.protocols = Object.keys(protocols);
			$scope.setProto($scope.proto);
		}).then(function() {
			$scope.configs = ConfigList;
		});

		$scope.toggleShowInactive = function(val) {
			localStorage.inactive = $scope.inactive = !$scope.inactive;
		}

		$scope.toggleShowArchived = function(val) {
			localStorage.archived = $scope.archived = !$scope.archived;
		}

		$scope.agentFilter = function(agent) {
			if (!$scope.proto) {
				return true;
			}
			return $scope.proto === protoMap(agent.protocol);
		}

		$scope.configFilter = function(config) {
			let q = config.queue;
			let archived = config.archived;
			let active = (q.enabled || q.running);

			if ($scope.search) {
				let search = $scope.search.trim().toLowerCase();
				if (search.length && config.name.toLowerCase().indexOf(search) < 0) {
					return false;
				}
			}

			if ($scope.proto && $scope.proto !== agentProtocol[config.type]) {
				return false;
			}

			if ($scope.archived) {
				return true;
			} else {
				if (archived) {
					return false;
				}
				return $scope.inactive ? true : active;
			}
		}

		function protoMap(proto) {
			return proto ? proto.replace(/\d/g, '').toUpperCase() : undefined;
		}

		$scope.setProto = function(proto) {
			proto = protoMap(proto);
			if ($scope.protocols.indexOf(proto) < 0) {
				proto = undefined;
			}
			localStorage.proto = $scope.proto = proto;
		}

		$scope.setConfigOrder = function(order) {
			if (order === 'pri') {
				$scope.configOrder = [
					'-archived',
					'-queue.running',
					'-queue.enabled',
					'-queue.priority',
					'queue.completed'
				];
			} else {
				$scope.configOrder = 'name';
			}
			localStorage.configOrder = $scope.configOrder = order;
		}

		// do initial order and filter
		$scope.setConfigOrder($scope.configOrder);
	}
]);

app.controller('systemController',
	['$scope', 'SystemControl',
	function($scope, SystemControl) {
		$scope.control = SystemControl;
	}
]);

app.controller('runListController',
	['$scope', '$route', '$routeParams', '$location',
	 'ConfigResource', 'RunResource', 'TestResource', 'OpLog', 'Notify', 'Stats',
	function($scope, $route, $routeParams, $location,
			 ConfigResource, RunResource, TestResource, OpLog, Notify, Stats) {

		var id = $routeParams.config_id;
		var search = $location.search();
		var skip = +search.skip || 0;
		var limit = +search.limit || 0;
		if (limit <= 0) {
			limit = 15;
		}

		$scope.page = Math.floor(skip / limit) + 1;

		$scope.skipto = function(arg) {
			$location.search(arg);
			$route.reload();
		};

		$scope.getgroup = function(run) {
			return Stats.getgroup(run._id);
		}

		$scope.statsToggle = function(run, group) {
			if (Stats.getgroup(run._id) === group) {
				Stats.del(run._id);
			} else {
				var stats = TestResource.query({run_id: run._id}, function(data) {
					data = data.map(function(d) {
						return d.count;
					});
					data.shift();		// ignore first point
					Stats.setgroup(run._id, data, group);
				}, Notify.danger);
			}
		};

		ConfigResource.get({id: id}, function(config) {
			$scope.config = config;
		}, Notify.danger);

		RunResource.query({config_id: id, skip: skip, limit: limit}, function(runs) {
			$scope.runs = runs;

			var link = {};
			if (skip > 0) {
				link.first = makelink(0, limit);
				link.prev = makelink(Math.max(0, skip - limit), limit);
			}
			if (runs.length >= limit) {
				link.next = makelink(skip + limit, limit);
			}
			$scope.link = link;

		}, Notify.danger);

		function makelink(skip, limit) {
			return "skip=" + skip + "&limit=" + limit;
		}

		OpLog.on('update.run', function(ev, doc) {
			if (doc && doc._id) {
				$scope.runs.forEach(function(run, i, a) {
					if (run._id === doc._id) {
						RunResource.get({id: run._id}, function(data) {
							a[i] = data;
						});
					}
				});
			}
		});

	}
]);

app.controller('testListController',
	['$scope', '$routeParams', 'OpLog', 'TestResource', 'RunResource', 'ConfigResource', 'Notify',
	function($scope, $routeParams, OpLog, TestResource, RunResource, ConfigResource, Notify) {

		var id = $routeParams.run_id;

		TestResource.query({run_id: id}, function(tests) {
			$scope.tests = tests;
		}, Notify.danger);

		RunResource.get({id: id}, function(run) {
			$scope.run = run;
			ConfigResource.get({id: run.config_id}, function(config) {
				$scope.config = config;
			});
		}, Notify.danger);

		OpLog.on('update.run', function(ev, doc) {
			if (doc && (doc._id === id)) {
				TestResource.query({run_id: id}, function(tests) {
					$scope.tests = tests;
				});
			}
		});
	}
]);

app.controller('testDetailController',
	['$scope', '$routeParams', 'TestResource', 'Notify',
	function($scope, $routeParams, TestResource, Notify) {
		TestResource.get({id: $routeParams.test_id}, function(test) {
			$scope.test = test;
		}, Notify.danger);
	}
]);

app.controller('configEditController',
	['$scope', '$route', '$location', '$q', '$routeParams',
	 'Notify', 'RunResource', 'ConfigResource',
	 'Settings', 'Agents',
	 'ServerAgentResource', 'ClientAgentResource',
	function($scope, $route, $location, $q, $routeParams,
			 Notify, RunResource, ConfigResource,
			 Settings, Agents,
			 ServerAgentResource, ClientAgentResource)
	{
		let id = $scope.id = $routeParams.id;
		let config, resetConfig;

		$scope.settings = Settings;
		$scope.agent = ServerAgentResource.get({agent: $routeParams.type});
		$scope.agent.$promise.then(function(agent) {
			$scope.clients = ClientAgentResource.queryByProtocol({protocol: agent.protocol})
		});
		$scope.type = $routeParams.type;

		// creating or cloning
		if ($scope.id === undefined) {

			// create a new resource
			config = $scope.config = new ConfigResource();

			if ($routeParams.clone === undefined) {
				// creating
				setDefaults();
			} else {
				// cloning
				cloneConfig().then(() => {
					setDefaults();
					$scope.configEdit.$setDirty();
				});
			}

		} else {
			// loading
			loadConfig();
		}

		function cloneConfig() {

			// retrieve the original
			let original = ConfigResource.get({ id: $routeParams.clone });

			// copy properties once the resource is retrieved
			return original.$promise.then(() =>  {
				for (let [key, value] of Object.entries(original)) {
					if (key.substring(0, 1) !== '$') {
						config[key] = original[key];
					}
				}

				// remove specific properties that the clone shouldn't have (yet)
				config.name = 'Clone of ' + config.name;
				config.notes = config.name + ' ' + Date().toString();
				delete $scope.id;
				delete config._id;
				delete config.created;
				delete config.updated;

			}).catch(redirectNotify);
		}

		// used to check if this config has any results
		function checkExisting() {
			RunResource.query({config_id: id, limit: 1}, function(data) {
				$scope.existing = !!(data && data.length);
			}, Notify.danger);
		}

		function redirectNotify(e) {
			Notify.danger(e);
			setTimeout(function() {
				$location.path('/config/');
				$route.reload();
			}, 3000);
		}

		function loadConfig() {
			if ($scope.id) {
				$scope.config = config = ConfigResource.get({id: $scope.id});

				config.$promise.then(() => {
					setDefaults();
					$scope.configEdit.$setPristine();
				}).catch(redirectNotify);

			} else {
				setDefaults();
			}
		}

		function setDefaults() {

			config.flags = config.flags || {checkout: false};
			config.wrapper = config.wrapper || [];
			if ($scope.agent.protocol === 'dns' && !config.mode) {
				config.mode = ($scope.agent.subtype && $scope.agent.subtypes[0]) || 'authoritative';
			}

			// set default client
			$q.all([Settings.$promise, $scope.agent.$promise]).then(() => {
				config.client = config.client || Settings.default_clients[$scope.agent.protocol];
			});

			var args = config.args = config.args || {};
			args.configure = args.configure || [];
			args.make = args.make || [];
			args.server = args.server || [];
			args.tester = args.tester || [];

			config.type = $scope.type;
			config.zoneset = config.zoneset || 'root';
			config.queryset = config.queryset || '';
			config.options = config.options || '';
			config.global = config.global || '';
			config.notes = config.notes || '';
			config.preConfigure = config.preConfigure || '';
			config.preBuild = config.preBuild || '';
			config.preRun = config.preRun || '';
			config.preTest = config.preTest || '';
			config.postTest = config.postTest || '';
			config.postRun = config.postRun || '';

			resetConfig = angular.copy(config);
		}

		function doneSaving() {
			$scope.saving = false;
		}

		$scope.reset = function() {
			$scope.config = config = angular.copy(resetConfig);
			$scope.configEdit.$setPristine();
		}

		$scope.save = function() {
			$scope.saving = true;
			if ($scope.id === undefined) {
				config.$save().then(function(res) {
					$scope.id = res._id;
					$location.path('/config/' + config.type + '/' + $scope.id + '/edit').replace();
					Notify.info('Saved');
					$route.reload();
				}).catch(Notify.danger).then(doneSaving);
			} else {
				config.$update().then(() => {
					$scope.configEdit.$setPristine();
					Notify.info('Saved');
				}, Notify.danger).then(doneSaving);
			}
		}

		$scope.delete = function() {
			$scope.saving = true;
			config.$delete({ really: true }).then(() => {
				redirectNotify('Configuration deleted');
			}).catch(Notify.danger).then(doneSaving);
		}

        $scope.toggleArchived = function() {
            if ($scope.id !== undefined) {
                config.archived = !config.archived;
                config.$update().then(() => {
					const msg = 'Configuration ' + (config.archived ? 'archived' : 'restored');
                    Notify.info(msg);
                }).catch(Notify.danger).then(doneSaving);
            }
        }
    }
]);

app.controller('statsController', ['$scope', 'Stats',
	function($scope, Stats) {
		$scope.stats = Stats;

		$scope.open = function() {
			$('#stats').modal();
		}
	}
]);

app.controller('statsResultsController', ['$scope', 'Stats',
	function($scope, Stats) {
		$('#stats').on('show.bs.modal', function() {
			$scope.data = Stats.calculate();
		});
	}
]);

app.controller('beepController', ['$scope', 'Beeper',
	function($scope, Beeper) {
		$scope.beeper = Beeper;
	}
]);

})();
