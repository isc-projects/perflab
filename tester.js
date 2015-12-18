#!/usr/bin/env node

'use strict';

let	Database = require('./database.js'),
	BindAgent = require('./bind-agent.js'),
	DNSPerfAgent = require('./dnsperf-agent.js'),
	settings = require('./settings');

try {
	var db = new Database(settings.mongoUrl);		// NB: hoisted
	runQueue();

} catch (e) {
	console.error('catch: ' + e);
}

function runQueue() {
	db.getPaused().then((res) => {
		if (res.paused) {
			return new Promise((resolve, reject) => setTimeout(resolve, 1000));
		} else {
			return doFirstQueueEntry();
		}
	}).catch(console.error).then(runQueue);
}

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

function runBind(agent, config_id)
{
	return db.insertRun({config_id})
			.then((run) => execute(agent)
				.then((result) => db.updateRunById(run._id, result))
				.then(() => run._id));
}

function runTest(agent, run_id)
{
	return db.insertTest({run_id}).then((test) =>
		execute(agent)
			.then((result) => db.updateTestById(test._id, result))
			.then(() => db.updateStatsByRunId(run_id)));
}

function runConfig(config)
{
	let bind = new BindAgent(config, settings.perfPath, settings.repoUrl);

	return runBind(bind, config._id).then((run_id) => {
		let iter = config.testsPerRun || 10;
		return (function loop() {
			let dnsperf = new DNSPerfAgent(config, settings.perfPath);
			let res = runTest(dnsperf, run_id).catch(console.error);
			return (--iter > 0) ? res.then(loop) : res;
		})();
	}).then(bind.stop, bind.stop);
}

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
