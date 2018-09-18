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

let db = new Database(mongoCF);
try {
	db.createIndexes().then(clearQueue).then(runQueue);
} catch (e) {
	console.error('catch: ' + e);
}

// main "recursive" loop - checks global pause status setting
// and either attempts to take a job from the queue, or waits
// one second before looping
function runQueue() {
	db.getPaused().then((res) => {
		if (res.paused) {
			setTimeout(runQueue, 1000);
		} else {
			doFirstQueueEntry().then(() => setTimeout(runQueue, 1000))
		}
	})
}

// marks all running jobs as stopped
function clearQueue() {
	let filter = settings.queueFilter || {};
	return db.clearQueue(filter);
}

// looks for a queue entry, and if found gets the matching config
// entry, runs it, then marks it as done, and if necessary (for
// non-repeating queue items disables the item)
function doFirstQueueEntry() {
	let filter = settings.queueFilter || {};
	return db.takeNextFromQueue(filter).then((queue) => {
		if (queue) {
			return db.getConfigById(queue._id)
				.then(runConfig)
				.then(() => db.markQueueEntryDone(queue._id))
				.then(() => db.disableOneshotQueue(queue._id));
		}
	});
}

// initiates starting of the daemon under test, then pseudo
// -recursively starts a number of iterations of the test client
function runConfig(config)
{
	let serverType = config.type;
	let serverAgent = new Agents.servers[serverType](settings, config);
	let clientType = config.client || settings.default_clients[serverAgent.type];
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
	process.env.PERFLAB_CONFIG_PATH = path
	process.env.PERFLAB_CONFIG_RUNPATH = runPath;
	process.env.PERFLAB_CONFIG_ID = config._id;
	process.env.PERFLAB_CONFIG_NAME = config.name;
	process.env.PERFLAB_CONFIG_BRANCH = config.branch;
	process.env.PERFLAB_CONFIG_TYPE = config.type;
	if (config.mode) {
		process.env.PERFLAB_CONFIG_MODE = config.mode;
	}

	return fs.mkdirsAsync(runPath)
		.then(() => preRun(serverAgent, config))
		.then(() => runServerAgent(serverAgent, config))
		.then((run_id) => {
			let iter = config.testsPerRun || settings.testsPerRun || 30;
			let count = 1;

			process.env.PERFLAB_PHASE = "running";
			process.env.PERFLAB_TEST_MAX = iter;

			function loop() {
				process.env.PERFLAB_TEST_COUNT = count;
				let clientAgent = new clientClass(settings, config);
				let res = setStatus(config, 'test ' + count + '/' + iter)
							.then(() => runTestAgent(clientAgent, config, run_id, false));
				return (++count <= iter) ? res.then(loop).catch(console.trace) : res;
			};

			return loop().then(() => setStatus(config, 'finished'));
		}).catch((err) => {
			console.trace(err);
		}).then(() => {
			return serverAgent.stop ? serverAgent.stop() : Promise.resolve();
		}).then(() => {
			return postRun(serverAgent, config);
		});
}

function preTest(agent, config)
{
	process.env.PERFLAB_PHASE = "pre-test";

	if (config.preTest && config.preTest.length) {
		let [cmd, ...args] = config.preTest;
		return agent.spawn(cmd, args, {cwd: process.env.PERFLAB_CONFIG_RUNPATH, quiet: false})
	} else {
		return Promise.resolve();
	}
}

function postTest(agent, config, testResult)
{
	process.env.PERFLAB_PHASE = "post-test";

	if (config.postTest && config.postTest.length) {
		let [cmd, ...args] = config.postTest;
		return agent.spawn(cmd, args, {cwd: process.env.PERFLAB_CONFIG_RUNPATH, quiet: false})
			.then((result) => {
				testResult = testResult || { stdout: "", stderr: "" };
				testResult.stdout += (result.stdout || "");
				testResult.stderr += (result.stderr || "");
				return testResult;
			})
			.catch(console.trace);
	} else {
		return Promise.resolve(testResult);
	}
}

function preRun(agent, config)
{
	process.env.PERFLAB_PHASE = "pre-run";

	if (config.preRun && config.preRun.length) {
		let [cmd, ...args] = config.preRun;
		return agent.spawn(cmd, args, {cwd: process.env.PERFLAB_CONFIG_RUNPATH, quiet: true}).catch(console.trace);
	} else {
		return Promise.resolve();
	}
}

function postRun(agent, config)
{
	// clean up environment
	for (let key in process.env) {
		if (/^PERFLAB_TEST_/.test(key)) {
			delete process.env[key];
		}
	}

	if (config.postRun && config.postRun.length) {
		let [cmd, ...args] = config.postRun;
		process.env.PERFLAB_PHASE = "post-run";
		return agent.spawn(cmd, args, {cwd: process.env.PERFLAB_CONFIG_RUNPATH, quiet: true}).catch(console.trace);
	} else {
		return Promise.resolve();
	}
}

function setStatus(config, s)
{
	return db.setQueueState(config._id, s);
}

// starts the daemon under test with the given configuration
// and stores the execution results in the database
function runServerAgent(agent, config)
{
	return setStatus(config, 'building').then(() =>
			db.insertRun({config_id: config._id})
				.then((run) => {
					return execute("server", agent, config._id, run._id)
						.then(
							(result) => db.updateRunById(run._id, result),
							(result) => {
								db.updateRunById(run._id, result);
								throw new Error("execution failed"); // propagate the error
							}
						).then(() => run._id);
				}));
}

// starts the testing client with the given configuration
// and (usually) stores the output in the database
function runTestAgent(agent, config, run_id, quiet)
{
	process.env.PERFLAB_CONFIG_ID = config._id;
	process.env.PERFLAB_RUN_ID = run_id;

	if (quiet) {
		return preTest(agent, config)
			.then(() => execute(agent, config._id, run_id))
			.then(result => postTest(agent, config, result));
	} else {
		return db.insertTest({config_id: config._id, run_id})
				.then((test) => {
					process.env.PERFLAB_TEST_ID = test._id;
					return preTest(agent, config)
						.then(() => execute("client", agent, config._id, run_id))
						.then((result) => postTest(agent, config, result))
						.then((result) => db.updateTestById(test._id, result))
						.then(() => db.updateStatsByRunId(run_id));
				});
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
function execute(logname, agent, config_id, run_id) {
	let stdout = '', stderr = '';
	var host = os.hostname().split('.')[0];

	let logpath = process.env.PERFLAB_CONFIG_PATH + '/' + logname;
	if (logname == 'server') {
		var cout = fs.createWriteStream(logpath + '.out');
		var cerr = fs.createWriteStream(logpath + '.err');
	}

	if (run_id !== undefined) {
		agent.on('mem', (mem) => {
			db.insertMemoryStats({config_id, run_id, data: mem});
		});
	}

	agent.on('cmd', (t) => {
		console.log(t);
		let log = {channel: 'command', text: t, host, time: new Date()}
		db.insertLog(log);
	});

	agent.on('stdout', (t) => {
		cout && cout.write(t);
		if (stdout.length < 1048576) {
			stdout += t;
		}
		let log = {channel: 'stdout', text: '' + t, host, time: new Date()}
		db.insertLog(log);
	});

	agent.on('stderr', (t) => {
		cerr && cerr.write(t);
		if (stderr.length < 1048576) {
			stderr += t;
		}
		let log = {channel: 'stderr', text: '' + t, host, time: new Date()}
		db.insertLog(log);
	});

	agent.on('exit', () => {
		cout && cout.end();
		cerr && cerr.end();
	});

	return agent.run().then((result) => Object.assign(result, {
			stdout, stderr,
			completed: new Date()
	}));
}
