#!/usr/bin/env node

'use strict';

let	Database = require('../lib/database'),
	Agents = require('../lib/agents'),
	Promise = require('bluebird'),
	mongoCF = require('../etc/mongo'),
	settings = require('../etc/settings');

Promise.longStackTraces();

if (process.argv.length < 3) {
	console.error("please supply a config id");
	process.exit();
}

let id = process.argv[2];
let db = new Database(mongoCF);

db.getConfigById(id).then((config) => {
	config.flags = config.flags || {};
	config.flags.checkout = false;
	let type = config.type;
	let agent = new Agents.servers[type](settings, config);
	agent.on('stdout', t => console.log('1:' + t));
	agent.on('stderr', t => console.log('2:' + t));
	return agent.run();
}).catch(console.trace).then(db.close);
