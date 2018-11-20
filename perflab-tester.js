#!/usr/bin/env node

'use strict';

let Agents = require('./lib/agents'),
	Database = require('./lib/database'),
	Promise = require('bluebird'),
	fs = Promise.promisifyAll(require('fs-extra')),
	os = require('os');

let	mongoCF = require('./etc/mongo'),
	settings = require('./etc/settings');

Promise.longStackTraces();

(async function() {

	try {

		let db = await new Database(mongoCF).init();
		await db.createIndexes();
		await clearQueue();
		await runQueue();

		// main loop - checks global pause status setting and either attempts
		// to take a job from the queue, or waits one second before looping
		async function runQueue() {
			/* eslint no-constant-condition: 0 */
			while (true) {
				let res = await db.getPaused();
				if (res.paused) {
					await new Promise((resolve) => setTimeout(resolve, 1000));
				} else {
					await doFirstQueueEntry();
				}
			}
		}

		// marks all running jobs as stopped
		async function clearQueue() {
			let filter = settings.queueFilter || {};
			return db.clearQueue(filter);
		}

		// looks for a queue entry, and if found gets the matching config
		// entry, runs it, then marks it as done, and if necessary (for
		// non-repeating queue items disables the item)
		async function doFirstQueueEntry() {
			let filter = settings.queueFilter || {};
			let queue = await db.takeNextFromQueue(filter);
			if (queue) {
				let config = await db.getConfigById(queue._id);
				await runConfig(config);
				await db.markQueueEntryDone(queue._id);
				await db.disableOneshotQueue(queue._id);
			}
		}

		// initiates starting of the daemon under test, then pseudo
		// -recursively starts a number of iterations of the test client
		async function runConfig(config)
		{
			let serverType = config.type;
			let serverClass = Agents.servers[serverType];
			let clientType = config.client || settings.default_clients[serverClass.configuration.protocol];
			let clientClass = Agents.clients[clientType];

			let path = settings.path + '/tests/' + config._id;
			let runPath = path + '/run';

			// clean up environment
			for (let key in process.env) {
				if (/^PERFLAB_/.test(key)) {
					delete process.env[key];
				}
			}

			// create new environment
			process.env.PERFLAB_CONFIG_PATH = path;
			process.env.PERFLAB_CONFIG_RUNPATH = runPath;
			process.env.PERFLAB_CONFIG_ID = config._id;
			process.env.PERFLAB_CONFIG_NAME = config.name;
			process.env.PERFLAB_CONFIG_BRANCH = config.branch;
			process.env.PERFLAB_CONFIG_TYPE = config.type;
			process.env.PERFLAB_CONFIG_PROTOCOL = serverClass.configuration.protocol;
			if (config.mode) {
				process.env.PERFLAB_CONFIG_MODE = config.mode;
			}

			let serverAgent = new serverClass(settings, config);

			await fs.mkdirsAsync(runPath);
			await preRun(serverAgent, config);
			let run_id = await runServerAgent(serverAgent, config);

			try {
				let iter = config.testsPerRun || settings.testsPerRun || 30;

				process.env.PERFLAB_PHASE = 'running';
				process.env.PERFLAB_TEST_MAX = iter;

				for (let count = 1; count <= iter; ++count) {
					process.env.PERFLAB_TEST_COUNT = count;
					let clientAgent = new clientClass(settings, config);
					await setStatus(config, 'test ' + count + '/' + iter);
					await runTestAgent(clientAgent, config, run_id, false);
				}

			} catch (e) {
				console.trace(e);
			}

			await setStatus(config, 'finished');
			if (serverAgent.stop) {
				await serverAgent.stop();
			}
			await postRun(serverAgent, config);
		}

		async function preTest(agent, config)
		{
			process.env.PERFLAB_PHASE = 'pre-test';

			if (config.preTest && config.preTest.length) {
				let [cmd, ...args] = config.preTest;
				try {
					return await agent.spawn(cmd, args, {cwd: process.env.PERFLAB_CONFIG_RUNPATH, quiet: false});
				} catch (e) {
					console.trace(e);
				}
			}
		}

		async function postTest(agent, config, testResult)
		{
			process.env.PERFLAB_PHASE = 'post-test';

			if (config.postTest && config.postTest.length) {
				let [cmd, ...args] = config.postTest;
				try {
					let result = await agent.spawn(cmd, args, {cwd: process.env.PERFLAB_CONFIG_RUNPATH, quiet: false});
					testResult = testResult || { stdout: '', stderr: '' };
					testResult.stdout += (result.stdout || '');
					testResult.stderr += (result.stderr || '');
					return testResult;
				} catch (e) {
					console.trace(e);
				}
			}
		}

		async function preRun(agent, config)
		{
			process.env.PERFLAB_PHASE = 'pre-run';

			if (config.preRun && config.preRun.length) {
				let [cmd, ...args] = config.preRun;
				try {
					return await agent.spawn(cmd, args, {cwd: process.env.PERFLAB_CONFIG_RUNPATH, quiet: true});
				} catch (e) {
					console.trace(e);
				}
			}
		}

		async function postRun(agent, config)
		{
			// clean up environment
			for (let key in process.env) {
				if (/^PERFLAB_TEST_/.test(key)) {
					delete process.env[key];
				}
			}

			if (config.postRun && config.postRun.length) {
				let [cmd, ...args] = config.postRun;
				process.env.PERFLAB_PHASE = 'post-run';
				try {
					return await agent.spawn(cmd, args, {cwd: process.env.PERFLAB_CONFIG_RUNPATH, quiet: true});
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
				let result = await execute('server', agent, config._id, run._id);
				await db.updateRunById(run._id, result);
			} catch (e) {
				await db.updateRunById(run._id, {});
				throw new Error('execution failed'); // propagate the error
			}

			return run._id;
		}

		// starts the testing client with the given configuration
		// and (usually) stores the output in the database
		async function runTestAgent(agent, config, run_id, quiet)
		{
			process.env.PERFLAB_CONFIG_ID = config._id;
			process.env.PERFLAB_RUN_ID = run_id;

			if (quiet) {
				await preTest(agent, config);
				let result = await execute(agent, config._id, run_id);
				return postTest(agent, config, result);
			} else {
				let test = await db.insertTest({config_id: config._id, run_id});

				process.env.PERFLAB_TEST_ID = test._id;
				await preTest(agent, config);
				let result = await execute('client', agent, config._id, run_id);
				result = await postTest(agent, config, result);
				await db.updateTestById(test._id, result);
				await db.updateStatsByRunId(run_id);
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

			let logpath = process.env.PERFLAB_CONFIG_PATH + '/' + logname;
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
	} catch (e) {
		console.trace(e);
	}

})();
