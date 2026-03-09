#!/usr/bin/env node

'use strict';

let httpd = require('./lib/httpd'),
	Database = require('./lib/database'),
	Agents = require('./lib/agents');

let settings = require('./etc/settings');

try {
	let dbo = new Database(settings.dbPath || (settings.path + '/perflab.db'));
	httpd(settings, Agents, dbo, __dirname + '/www');
} catch (e) {
	console.trace(e);
}
