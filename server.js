#!/usr/bin/env node

'use strict';

var	Database = require('./database.js'),
	BindAgent = require('./bind-agent.js'),
	DNSPerfAgent = require('./dnsperf-agent.js');

var mongoUrl = 'mongodb://localhost/perflab';
var perfPath = '/home/ray/bind-perflab';
var repoUrl = 'ssh://repo.isc.org/proj/git/prod/bind9';

function run(agent) {
	var now = new Date();
	var stdout = '', stderr = '';
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
	var db = new Database(mongoUrl);
	var run_id = db.getId();

	db.getConfig("v9_10").then((config) => {

		var bind = new BindAgent(config, perfPath, repoUrl);
		var dnsperf = new DNSPerfAgent(config, perfPath);
		var config_id = config._id;

		return runBind(bind, config_id, run_id).then(() => {
			var iter = 4;
			return (function loop() {
				var res = runTest(dnsperf, run_id);
				return --iter ? res.then(loop) : res;
			})();
		}).then(bind.stop);

	}) .catch(console.error);

} catch (e) {
	console.error('catch: ' + e);
}
