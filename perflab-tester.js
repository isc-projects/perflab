#!/usr/bin/env node

'use strict';

let Agents = require('./lib/agents'),
	Database = require('./lib/database'),
	Promise = require('bluebird'),
	os = require('os');

let	mongoCF = require('./etc/mongo'),
	settings = require('./etc/settings');

Promise.longStackTraces();

let db = new Database(mongoCF);
try {
	db.createIndexes().then(runQueue);
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

	let clientClass = Agents.clients[config.client] || Agents.servers[serverType].configuration.client;

	return runServerAgent(serverAgent, config).then((run_id) => {
		let iter = config.testsPerRun || settings.testsPerRun || 30;
		let count = 1;

		function loop() {
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

function postTest(agent, config, testResult)
{
	if (config.postTest && config.postTest.length) {
		let runPath = settings.path + '/tests/' + config._id + '/run';
		let [cmd, ...args] = config.postTest;
		return agent.spawn(cmd, args, {cwd: runPath, quiet: false})
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

function postRun(agent, config)
{
	if (config.postRun && config.postRun.length) {
		let runPath = settings.path + '/tests/' + config._id + '/run';
		let [cmd, ...args] = config.postRun;
		return agent.spawn(cmd, args, {cwd: runPath, quiet: true}).catch(console.trace);
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
					return execute(agent, config._id, run._id)
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
	if (quiet) {
		return execute(agent, config._id, run_id)
						.then(result => postTest(agent, config, result));
	} else {
		return db.insertTest({config_id: config._id, run_id})
				.then((test) => {
					return execute(agent, config._id, run_id)
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
function execute(agent, config_id, run_id) {
	let stdout = '', stderr = '';
	var host = os.hostname().split('.')[0];

	if (run_id !== undefined) {
		agent.on('mem', (mem) => {
			db.insertMemoryStats({config_id, run_id, data: mem});
		});
	}

	agent.on('cmd', (t) => {
		let log = {channel: 'command', text: t, host, time: new Date()}
		db.insertLog(log);
	});

	agent.on('stdout', (t) => {
		stdout += t;
		let log = {channel: 'stdout', text: '' + t, host, time: new Date()}
		db.insertLog(log);
	});

	agent.on('stderr', (t) => {
		stderr += t;
		let log = {channel: 'stderr', text: '' + t, host, time: new Date()}
		db.insertLog(log);
	});

	return agent.run().then((result) => Object.assign(result, {
			stdout, stderr,
			completed: new Date()
	}));
}
