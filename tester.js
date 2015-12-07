#!/usr/bin/env node

'use strict';

let	Database = require('./database.js'),
	BindAgent = require('./bind-agent.js'),
	DNSPerfAgent = require('./dnsperf-agent.js');

const mongoUrl = 'mongodb://localhost/perflab';
const perfPath = '/home/ray/bind-perflab';
const repoUrl = 'ssh://repo.isc.org/proj/git/prod/bind9';

function execute(agent) {
	let stdout = '', stderr = '';
	agent.on('stdout', (t) => stdout += t);
	agent.on('stderr', (t) => stderr += t);
	return agent.run().then((result) => Object.assign(result, {
			stdout, stderr
	}));
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
	let bind = new BindAgent(config, perfPath, repoUrl);

	return runBind(bind, config._id).then((run_id) => {
		let iter = 10;
		return (function loop() {
			let dnsperf = new DNSPerfAgent(config, perfPath);
			let res = runTest(dnsperf, run_id).catch(console.error);
			return (--iter > 0) ? res.then(loop) : res;
		})();
	}).then(bind.stop);
}

function handleQueue() {
	db.takeNextFromQueue().then((queue) => {
		if (!queue) {
			return new Promise((resolve, reject) => setTimeout(resolve, 1000));
		} else {
			var requeue = () => db.reQueueEntry(queue._id);
			var done = () => db.markQueueEntryDone(queue._id);
			return db.getConfigById(queue.config_id)
				.then(runConfig)
				.then(done, done)
				.then(requeue);
		}
	}).catch(console.error).then(handleQueue);
}

try {
	var db = new Database(mongoUrl);	// NB: hoisted
	handleQueue();
} catch (e) {
	console.error('catch: ' + e);
}
