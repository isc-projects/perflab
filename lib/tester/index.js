'use strict';

let Agents = require('../agents'),
	Promise = require('bluebird'),
	fs = Promise.promisifyAll(require('fs-extra')),
	os = require('os');

Promise.longStackTraces();

class Tester {

	constructor(db, settings) {

		let $ENV = process.env;

		this.run = async function(config) {

			let serverType = config.type;
			let serverClass = Agents.servers[serverType];

			// create server agent pointing at its instance directory
			let path = settings.path + '/tests/' + config._id;
			let server = new serverClass(settings, config, path);

			// remove existing PERFLAB environment variables
			for (let key in $ENV) {
				if (/^PERFLAB_/.test(key)) {
					delete $ENV[key];
				}
			}

			// create new environment variables
			Object.assign($ENV, {
				PERFLAB_CONFIG_PATH: path,
				PERFLAB_CONFIG_RUNPATH: server.path.run,
				PERFLAB_CONFIG_ID: config._id,
				PERFLAB_CONFIG_NAME: config.name,
				PERFLAB_CONFIG_BRANCH: config.branch,
				PERFLAB_CONFIG_TYPE: config.type,
				PERFLAB_CONFIG_PROTOCOL: serverClass.configuration.protocol
			});

			if (config.mode) {
				$ENV.PERFLAB_CONFIG_MODE = config.mode;
			}

			// run the test
			await fs.mkdirsAsync(server.path.run);
			await preRun(server, config);
			await doRun(server, config);
			await postRun(server, config);
		};

		async function doRun(agent, config) {
			try {

				let serverType = config.type;
				let serverClass = Agents.servers[serverType];

				let clientType = config.client || settings.default_clients[serverClass.configuration.protocol];
				let clientClass = Agents.clients[clientType];

				// start the server running
				let run_id = await runServerAgent(agent, config);

				let iter = config.testsPerRun || settings.testsPerRun || 30;
				for (let count = 1; count <= iter; ++count) {

					Object.assign($ENV, {
						PERFLAB_PHASE: 'running',
						PERFLAB_TEST_MAX: iter,
						PERFLAB_TEST_COUNT: count
					});

					let client = new clientClass(settings, config);
					await setStatus(config, 'test ' + count + '/' + iter);
					await runTestAgent(client, config, run_id, false);
				}

				if (agent.stop) {
					await agent.stop();
				}

				await setStatus(config, 'finished');

			} catch (e) {
				await setStatus(config, 'error');
				console.trace(e);
			}
		}

		async function preTest(agent, config)
		{
			$ENV.PERFLAB_PHASE = 'pre-test';

			if (config.preTest && config.preTest.length) {
				let [cmd, ...args] = config.preTest;
				try {
					return agent.spawn(cmd, args, {cwd: $ENV.PERFLAB_CONFIG_RUNPATH, quiet: false});
				} catch (e) {
					console.trace(e);
				}
			}
		}

		async function postTest(agent, config, testResult)
		{
			$ENV.PERFLAB_PHASE = 'post-test';

			if (config.postTest && config.postTest.length) {
				let [cmd, ...args] = config.postTest;
				try {
					let result = await agent.spawn(cmd, args, {cwd: $ENV.PERFLAB_CONFIG_RUNPATH, quiet: false});
					testResult = testResult || { stdout: '', stderr: '' };
					testResult.stdout += (result.stdout || '');
					testResult.stderr += (result.stderr || '');
				} catch (e) {
					console.trace(e);
				}
			}

			return testResult;
		}

		async function preRun(agent, config)
		{
			$ENV.PERFLAB_PHASE = 'pre-run';

			if (config.preRun && config.preRun.length) {
				let [cmd, ...args] = config.preRun;
				try {
					return agent.spawn(cmd, args, {cwd: $ENV.PERFLAB_CONFIG_RUNPATH, quiet: true});
				} catch (e) {
					console.trace(e);
				}
			}
		}

		async function postRun(agent, config)
		{
			// remove test-related variables from $ENV
			for (let key in $ENV) {
				if (/^PERFLAB_TEST_/.test(key)) {
					delete $ENV[key];
				}
			}

			if (config.postRun && config.postRun.length) {
				let [cmd, ...args] = config.postRun;
				$ENV.PERFLAB_PHASE = 'post-run';
				try {
					return agent.spawn(cmd, args, {cwd: $ENV.PERFLAB_CONFIG_RUNPATH, quiet: true});
				} catch (e) {
					console.trace(e);
				}
			}
		}

		async function setStatus(config, s)
		{
			return db.setQueueState(config._id, s);
		}

		// starts the daemon under test with the given configuration
		// and stores the execution results in the database
		async function runServerAgent(agent, config)
		{
			await setStatus(config, 'building');
			let run = await db.insertRun({config_id: config._id});

			try {
				$ENV.PERFLAB_RUN_ID = run._id;
				let result = await execute('server', agent, config._id, run._id);
				await db.updateRunById(run._id, result);
				return run._id;
			} catch (e) {
				await db.updateRunById(run._id, {});
				throw e;
			}
		}

		// starts the testing client with the given configuration
		// and (usually) stores the output in the database
		async function runTestAgent(agent, config, run_id, quiet)
		{
			$ENV.PERFLAB_CONFIG_ID = config._id;
			$ENV.PERFLAB_RUN_ID = run_id;

			if (quiet) {
				await preTest(agent, config);
				let result = await execute('client', agent, config._id, run_id);
				return postTest(agent, config, result);
			} else {
				let test = await db.insertTest({config_id: config._id, run_id});
				$ENV.PERFLAB_TEST_ID = test._id;

				await preTest(agent, config);
				let result = await execute('client', agent, config._id, run_id);
				result = await postTest(agent, config, result);
				await db.updateTestById(test._id, result);
				await db.updateStatsByRunId(run_id);

				return result;
			}
		}

		//
		// invokes the given agent, and captures any output both for storing
		// one line at a time into the DB for real-time viewing, and also
		// accumulates the entire output and adds that output to the result
		//
		// it's this output that gets stored in the database, because the
		// output accumulated in Executor._run is only captured for one
		// build stage at a time
		//
		async function execute(logname, agent, config_id, run_id) {
			let stdout = '', stderr = '';
			var host = os.hostname().split('.')[0];

			let logpath = $ENV.PERFLAB_CONFIG_PATH + '/' + logname;
			if (logname == 'server') {
				var cout = fs.createWriteStream(logpath + '.out');
				var cerr = fs.createWriteStream(logpath + '.err');
			}

			if (run_id !== undefined) {
				agent.on('mem', (mem) => db.insertMemoryStats({config_id, run_id, data: mem}));
			}

			agent.on('cmd', (t) => {
				console.log(t);
				let log = {channel: 'command', text: t, host, time: new Date()};
				db.insertLog(log);
			});

			agent.on('stdout', (t) => {
				cout && cout.write(t);
				if (stdout.length < 1048576) {
					stdout += t;
				}
				let log = {channel: 'stdout', text: '' + t, host, time: new Date()};
				db.insertLog(log);
			});

			agent.on('stderr', (t) => {
				cerr && cerr.write(t);
				if (stderr.length < 1048576) {
					stderr += t;
				}
				let log = {channel: 'stderr', text: '' + t, host, time: new Date()};
				db.insertLog(log);
			});

			agent.on('exit', () => {
				cout && cout.end();
				cerr && cerr.end();
			});

			let result = await agent.run();
			return Object.assign(result, {
				stdout, stderr,
				completed: new Date()
			});
		}
	}
}

module.exports = Tester;
