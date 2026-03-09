#!/usr/bin/env node

'use strict';

let httpd = require('./lib/httpd'),
	Database = require('./lib/database'),
	Agents = require('./lib/agents');

let mongoCF = require('./etc/mongo'),
	settings = require('./etc/settings');

(async () => {
	try {
		let dbo = await new Database(mongoCF).init();
		httpd(settings, Agents, dbo, __dirname + '/www');
	} catch (e) {
		console.trace(e);
	}
})();
