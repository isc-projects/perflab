const app = angular.module('perflabApp');

app.controller('logViewController',
	['$scope', 'LogWatcher',
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
	['$scope', '$routeParams', '$location', '$http', 'ConfigList', 'Agents', 'Settings', 'Notify',
	function($scope, $routeParams, $location, $http, ConfigList, Agents, Settings, Notify) {

		// NB: 'Settings' unused, but referenced here to trigger a load
		//	 ready in time for the configuration editor

		// URL parameters
		$scope.search = $routeParams.search;

		// Multi-selection state
		$scope.selectedConfigs = {};
		$scope.selectAll = false;

		// set up protocol list
		Agents.$promise.then(function() {
			$scope.agents = Agents.servers();
			$scope.agentMap = {};

			let protos = $scope.protocols = {};
			$scope.agents.forEach(agent => {
				let name = protoName(agent.protocol) || 'Unknown';
				agent.protoName = name;
				protos[name] = protos[name] || [];
				protos[name].push(agent);
				$scope.agentMap[agent.key] = agent;
			});
			$scope.protoCount = Object.keys(protos).length;

			// start downloading the configs
			$scope.configs = ConfigList;
		});

		// load and track configuration sort order
		try {
			$scope.$watch('configOrder', (order) => {
				localStorage.configOrder = JSON.stringify(order);
				updateConfigView();
			});
			$scope.configOrder = JSON.parse(localStorage.configOrder);
		} catch {
			$scope.configOrder = "name";
		}

		// load and track "archived" flag
		try {
			$scope.$watch('archived', (val) => {
				localStorage.archived = JSON.stringify(val);
				updateConfigView();
			});
			$scope.archived = JSON.parse(localStorage.archived);
		} catch {
			$scope.archived = false;
		}

		// load and track protocol filter field
		try {
			$scope.$watch('proto', (proto) => {
				localStorage.proto = JSON.stringify(proto);
				updateConfigView();
			});
			$scope.proto = JSON.parse(localStorage.proto);
		} catch {
			$scope.proto = null;
		}

		// track changes to the config lists
		$scope.$watch('configs', updateConfigView, true);

		// track changes to the search box
		$scope.$watch('search', (search) => {
			if (typeof search === "string") {
				if (search.trim().length === 0) {
					search = null;
				}
				$location.search({search}).replace();
			}
			updateConfigView();
		});

		// filter list of agents by selected protocol
		$scope.agentFilter = function(agent) {
			if (!$scope.proto) {
				return true;
			}
			return $scope.proto === protoName(agent.protocol);
		}

		// filter visible configs
		let re = null;

		$scope.configFilter = function(config) {
			let q = config.queue;
			let active = (q.enabled || q.running);

			// check it doesn't match the protocol filter
			if ($scope.proto && $scope.proto !== $scope.agentMap[config.type].protoName) {
				return false;
			}

			// check it doesn't match the search string
			if ($scope.search) {
				let tmp = $scope.search.trim();
				if (tmp.length) {
					try {
						re = new RegExp(tmp, 'i');
					} catch {
						// ignored
					}
					if (re && !re.test(config.name)) {
						return false;
					}
				}
			}

			// check if archived items are hidden
			if (!$scope.archived && config.archived) {
				return false;
			}

			return true;
		}

		function updateConfigView() {
			if (!$scope.configs) return;

			$scope.configs.all.$promise.then(function(configs) {
				const pred = ($scope.configOrder === 'name') ? sortByName : sortByPriority;
				$scope.configView = configs.filter($scope.configFilter).sort(pred);
			});
		}

		function sortByName(a, b) {
			return a.name.localeCompare(b.name, { sensitivity: 'base' });
		}

		function sortByPriority(a, b) {
			const qa = a.queue, qb = b.queue;

			// compare running status (descending)
			let r = (~~qb.running) - (~~qa.running);
			if (r) return r;

			// compare priority (descending)
			r = (qb.priority || 0) - (qa.priority || 0);
			if (r) return r;

			// compare enabled (descending)
			r = (~~qb.enabled) - (~~qa.enabled);
			if (r) return r;

			// compare completion times (ascending)
			let qac = qa.completed || '';
			let qbc = qb.completed || '';
			return (qac.localeCompare(qbc));
		}

		function protoName(proto) {
			return proto ? proto.replace(/\d/g, '').toUpperCase() : undefined;
		}

		// Multi-selection functions
		$scope.toggleSelectAll = function() {
			$scope.selectAll = !$scope.selectAll;
			if ($scope.configView) {
				$scope.configView.forEach(function(config) {
					$scope.selectedConfigs[config._id] = $scope.selectAll;
				});
			}
		};

		$scope.getSelectedIds = function() {
			return Object.keys($scope.selectedConfigs).filter(id => $scope.selectedConfigs[id]);
		};

		$scope.getDateFromPeriod = function(period) {
			const now = new Date();
			let date;
			
			switch (period) {
				case '1month':
					date = new Date(now.getFullYear(), now.getMonth() - 1, 1);
					break;
				case '3months':
					date = new Date(now.getFullYear(), now.getMonth() - 3, 1);
					break;
				case '6months':
					date = new Date(now.getFullYear(), now.getMonth() - 6, 1);
					break;
				case '1year':
					date = new Date(now.getFullYear() - 1, now.getMonth(), 1);
					break;
				case 'ytd':
					date = new Date(now.getFullYear(), 0, 1);
					break;
				default:
					return '';
			}
			
			return date.toISOString();
		};

		$scope.downloadSelectedCSV = function(period) {
			const selectedIds = $scope.getSelectedIds();
			if (selectedIds.length === 0) {
				Notify.warning('Please select at least one configuration');
				return;
			}
			
			let url = `/api/batch/stats?ids=${selectedIds.join(',')}`;
			if (period) {
				const fromDatetime = $scope.getDateFromPeriod(period);
				url += `&from_datetime=${encodeURIComponent(fromDatetime)}`;
			}
			
			window.open(url, '_blank');
		};

		$scope.clearSelection = function() {
			$scope.selectedConfigs = {};
			$scope.selectAll = false;
		};

		$scope.archiveSelected = function() {
			const selectedIds = $scope.getSelectedIds();
			if (selectedIds.length === 0) {
				Notify.warning('Please select at least one configuration');
				return;
			}

			$http.put(`/api/batch/archive?ids=${selectedIds.join(',')}`)
				.then(function(response) {
					Notify.info(`Successfully archived ${selectedIds.length} configuration(s)`);
					$scope.clearSelection();
					// Config list will update automatically via OpLog
				})
				.catch(Notify.danger);
		};

		// Batch clone
		$scope.batchClone = { branch: '', configureArgs: '', namePattern: '' };

		function applyNamePattern(name, pattern, branch) {
			let vars = { BRANCH: branch || '' };
			name.split('/').forEach(function(p, i) { vars[i + 1] = p; });
			return pattern.replace(/\$\{(\w+)\}/g, function(_, key) { return vars[key] || ''; });
		}

		$scope.openBatchClone = function() {
			$scope.batchClone = { branch: '', configureArgs: '', namePattern: '${1}/${BRANCH}/${3}/${4}' };
			updateBatchClonePreview();
			$('#batchCloneModal').modal('show');
		};

		$scope.batchClonePreview = [];

		function updateBatchClonePreview() {
			const selectedIds = $scope.getSelectedIds();
			if (!$scope.configs || !$scope.configs.all) {
				$scope.batchClonePreview = [];
				return;
			}
			$scope.batchClonePreview = $scope.configs.all.filter(c => selectedIds.indexOf(c._id) >= 0).map(function(config) {
				let newName = config.name;
				if ($scope.batchClone.namePattern) {
					newName = applyNamePattern(config.name, $scope.batchClone.namePattern, $scope.batchClone.branch);
				}
				return { original: config.name, newName: newName };
			});
		}

		$scope.$watchGroup(['batchClone.branch', 'batchClone.configureArgs', 'batchClone.namePattern'], updateBatchClonePreview);

		$scope.executeBatchClone = function() {
			const selectedIds = $scope.getSelectedIds();
			if (selectedIds.length === 0) return;

			let overrides = {};
			if ($scope.batchClone.branch) {
				overrides.branch = $scope.batchClone.branch;
			}
			if ($scope.batchClone.namePattern) {
				overrides.namePattern = $scope.batchClone.namePattern;
			}
			if ($scope.batchClone.configureArgs) {
				overrides.args = { configure: $scope.batchClone.configureArgs };
			}

			$http.post(`/api/batch/clone?ids=${selectedIds.join(',')}`, { overrides: overrides })
				.then(function() {
					$('#batchCloneModal').modal('hide');
					Notify.info(`Successfully cloned ${selectedIds.length} configuration(s)`);
					$scope.clearSelection();
				})
				.catch(Notify.danger);
		};

		$scope.deleteSelected = function() {
			const selectedIds = $scope.getSelectedIds();
			if (selectedIds.length === 0) {
				Notify.warning('Please select at least one configuration');
				return;
			}
			
			if (!confirm(`DELETE ${selectedIds.length} configuration(s) and all their test data? This cannot be undone!`)) {
				return;
			}

			$http.delete(`/api/batch/?ids=${selectedIds.join(',')}&really=true`)
				.then(function(response) {
					Notify.info(`Successfully deleted ${selectedIds.length} configuration(s)`);
					$scope.clearSelection();
					// Config list will update automatically via OpLog
				})
				.catch(Notify.danger);
		};
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
			 ConfigResource, RunResource, TestResource, OpLog, Notify, Stats)
	{
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
					if (data.length > 1) {
						data.shift();		// ignore first point
					}
					Stats.setgroup(run._id, data, group);
				}, Notify.danger);
			}
		};

		ConfigResource.get({id}, function(config) {
			$scope.config = config;
		}, Notify.danger);

		RunResource.query({config_id: id, skip, limit}, function(runs) {
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
			return {skip, limit};
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
	['$scope', '$route', '$location', '$q', '$routeParams', '$http',
	 'Notify', 'RunResource', 'ConfigResource',
	 'Settings', 'Agents',
	function($scope, $route, $location, $q, $routeParams, $http,
			 Notify, RunResource, ConfigResource,
			 Settings, Agents)
	{
		let resetConfig;

		$scope.settings = Settings;
		$scope.config = getConfig();

		const ready = $q.all([ $scope.config.$promise, Agents.$promise ]);
		ready.then(() => {

			$scope.agent = Agents.server($scope.config.type);
			$scope.clients = Agents.clients($scope.agent.protocol);

			setDefaults($scope.config, $scope.agent.protocol);
			resetConfig = angular.copy($scope.config);
		});

		function getConfig() {
			let id = $routeParams.id;

			// existing config
			if (id) {
				return loadConfig(id);
			}

			// creating or cloning
			if ($routeParams.clone === undefined) {
				return newConfig($routeParams.type);
			} else {
				return cloneConfig(id);
			}
		}

		function newConfig(type) {
			const config = new ConfigResource();
			config.type = type;
			return config;
		}

		function loadConfig(id) {
			const config = ConfigResource.get({ id });
			config.$promise.then(() => checkExisting(id));
			return config;
		}

		function cloneConfig() {

			// get the original config
			const config = ConfigResource.get({ id: $routeParams.clone });

			// update it a bit
			config.$promise.then(() => {

				// change default name and add note
				config.name = `Clone of ${config.name}`;
				config.notes = `${config.name} ${Date()}`;

				// remove specific properties that the clone shouldn't have (yet)
				delete config._id;
				delete config.created;
				delete config.updated;
				$scope.form.$setDirty();
			});

			return config;
		}

		function setDefaults(config, protocol) {

			config.flags = config.flags || {checkout: false};
			config.wrapper = config.wrapper || [];

			// set default client
			config.client = config.client || Settings.default_clients[protocol];

			// set default mode
			if ($scope.agent.protocol === 'dns' && !config.mode) {
				config.mode = ($scope.agent.subtype && $scope.agent.subtypes[0]) || 'authoritative';
			}

			var args = config.args = config.args || {};
			args.configure = args.configure || [];
			args.make = args.make || [];
			args.server = args.server || [];
			args.tester = args.tester || [];

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
		}

		// used to check if this config has any results
		function checkExisting(id) {
			RunResource.query({ config_id: id, limit: 1}, function(data) {
				$scope.existing = !!(data && data.length);
			}, Notify.danger);
		}

		function redirectNotify(e) {
			Notify.danger(e);
			setTimeout(() => {
				$location.path('/config/');
				$route.reload();
			}, 3000);
		}

		function doneSaving() {
			$scope.saving = false;
		}

		function save() {
			$scope.config.$save().then(function(config) {
				$location.path(`/config/edit/${config._id}`).search({}).replace();
				Notify.info('Saved');
			}).catch(Notify.danger).then(doneSaving);
		}

		function update() {
			$scope.config.$update().then(() => {
				$scope.form.$setPristine();
				Notify.info('Saved');
			}).catch(Notify.danger).then(doneSaving);
		}

		$scope.reset = function() {
			$scope.config = angular.copy(resetConfig);
			$scope.form.$setPristine();
		}

		$scope.save = function() {
			$scope.saving = true;
			if ($scope.config._id === undefined) {
				save();
			} else {
				update();
			}
		}

		$scope.delete = function() {
			$scope.saving = true;
			$scope.config.$delete({ really: true }).then(() => {
				redirectNotify('Configuration deleted');
			}).catch(Notify.danger).then(doneSaving);
		}

		$scope.toggleArchived = function() {
			$scope.config.archived = !$scope.config.archived;
			$scope.form.$setDirty();
		}
	}
]);

app.controller('statsController',
	['$scope', 'Stats',
	function($scope, Stats) {
		$scope.stats = Stats;

		$scope.open = function() {
			$('#stats').modal();
		}
	}
]);

app.controller('statsResultsController',
	['$scope', 'Stats',
	function($scope, Stats) {
		$('#stats').on('show.bs.modal', function() {
			$scope.data = Stats.calculate();
		});
	}
]);

app.controller('beepController',
	['$scope', 'Beeper',
	function($scope, Beeper) {
		$scope.beeper = Beeper;
	}
]);
