#!/usr/bin/env node

'use strict';

var BindAgent = require('./bind-agent.js'),
	Database = require('./database.js');

var mongoUrl = 'mongodb://localhost/perflab';
var perfPath = '/home/ray/bind-perflab';
var repoUrl = 'ssh://repo.isc.org/proj/git/prod/bind9';

function run(config) {
	var agent = new BindAgent(config, perfPath, repoUrl);
	var stdout = '', stderr = '';
	agent.on('stdout', (t) => stdout += t);
	agent.on('stderr', (t) => stderr += t);
	return agent.run().then((status) => {
		return { config_id: config._id, status, stdout, stderr }
	});
}

try {
	var db = new Database(mongoUrl);

	db.getConfig("v9_10").then(run).then(db.insertRun).catch(console.error);
} catch (e) {
	console.error('catch: ' + e);
}
