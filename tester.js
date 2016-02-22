#!/usr/bin/env node

'use strict';

const system = require('./system'),
	Database = require('./database'),
	Promise = require('bluebird');

Promise.longStackTraces();

let db = new Database();
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
	return db.takeNextFromQueue().then((queue) => {
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
	let type = config.type || 'bind';
	let serverAgent = new system.agents[type].server(config);

	return runServer(serverAgent, config._id).then((run_id) => {
		let iter = config.testsPerRun || 30;
		let first = true;
		serverAgent.on('mem', (mem) => db.insertMemoryStatsByRunId(run_id, mem));
		return (function loop() {
			let clientAgent = new system.agents[type].client(config);

			let quiet = (first && config.mode === 'recursive');
			let res = runClient(clientAgent, run_id, quiet);
			first = false;
			return (--iter > 0) ? res.then(loop) : res;
		})();
	}).catch((err) => console.trace).then(serverAgent.stop)
}

// starts the daemon under test with the given configuration
// and stores the execution results in the database
function runServer(agent, config_id)
{
	return db.insertRun({config_id})
				.then((run) => {
					return execute(agent)
						.then(
							(result) => db.updateRunById(run._id, result),
							(result) => {
								db.updateRunById(run._id, result);
								throw new Error("execution failed");
							}
						).then(() => run._id);
				});
}

// starts the testing client with the given configuration
// and (usually) stores the output in the database
function runClient(agent, run_id, quiet)
{
	if (quiet) {
		return execute(agent);
	} else {
		return db.insertTest({run_id})
				.then((test) => {
					return execute(agent)
						.then((result) => db.updateTestById(test._id, result))
						.then(() => db.updateStatsByRunId(run_id))
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
function execute(agent) {
	let stdout = '', stderr = '';

	agent.on('cmd', (t) => {
		let log = {channel: 'command', text: t, time: new Date()}
		db.insertLog(log);
	});

	agent.on('stdout', (t) => {
		stdout += t;
		let log = {channel: 'stdout', text: '' + t, time: new Date()}
		db.insertLog(log);
	});

	agent.on('stderr', (t) => {
		stderr += t;
		let log = {channel: 'stderr', text: '' + t, time: new Date()}
		db.insertLog(log);
	});

	return agent.run().then((result) => Object.assign(result, {
			stdout, stderr
	}));
}
