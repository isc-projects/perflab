#!/usr/bin/env node

'use strict';

let	Database = require('./database.js'),
	BindAgent = require('./bind-agent.js'),
	DNSPerfAgent = require('./dnsperf-agent.js');

const mongoUrl = 'mongodb://localhost/perflab';
const perfPath = '/home/ray/bind-perflab';
const repoUrl = 'ssh://repo.isc.org/proj/git/prod/bind9';

function run(agent) {
	let now = new Date();
	let stdout = '', stderr = '';
	agent.on('stdout', (t) => stdout += t);
	agent.on('stderr', (t) => stderr += t);
	return agent.run().then((result) => {
		return {
			stdout, stderr, 
			created: now,
			status: result.status
		};
	});
}

function runBind(agent, config_id, run_id)
{
	return run(agent).then((results) => {
		results.config_id = config_id;
		results._id = run_id;
		return db.insertRun(results);
	});
}

function runTest(agent, run_id)
{
	return run(agent).then((results) => {
		results.run_id = run_id;
		return db.insertTest(results);
	});
}

try {
	var db = new Database(mongoUrl);	// NB: hoisted
	let run_id = db.getId();

	db.getConfig("v9_10").then((config) => {

		if (config === null) {
			return Promise.reject(new Error("named config not found"));
		}

		let bind = new BindAgent(config, perfPath, repoUrl);
		let dnsperf = new DNSPerfAgent(config, perfPath);
		let config_id = config._id;

		return runBind(bind, config_id, run_id).then(() => {
			let iter = 4;
			return (function loop() {
				let res = runTest(dnsperf, run_id);
				return --iter ? res.then(loop) : res;
			})();
		}).then(bind.stop);

	}) .catch(console.error);

} catch (e) {
	console.error('catch: ' + e);
}
