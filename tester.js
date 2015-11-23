#!/usr/bin/env node

'use strict';

var DNSPerfAgent = require('./dnsperf-agent.js'),
	Database = require('./database.js');

var mongoUrl = 'mongodb://localhost/perflab';
var perfPath = '/home/ray/bind-perflab';

function run(config) {
	var agent = new DNSPerfAgent(config, perfPath);
	agent.on('stdout', console.log);
	agent.on('stderr', console.error);
	return agent.run();
}

try {
	var db = new Database(mongoUrl);
	db.getConfig("v9_10").then(run).catch(console.error);
} catch (e) {
	console.error('catch: ' + e);
}
