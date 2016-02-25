#!/usr/bin/env node

'use strict';

let	Database = require('../lib/database'),
	Agents = require('../lib/agents'),
	Promise = require('bluebird'),
	settings = require('../settings');

Promise.longStackTraces();

if (process.argv.length < 3) {
	console.error("please supply a config id");
	process.exit();
}

let id = process.argv[2];
let db = new Database(settings);

db.getConfigById(id).then((config) => {
	let type = config.type || 'bind';
	let agent = new Agents[type].server(settings, config);
	return agent.run(config).then(agent.stop);
}).catch(console.trace);
