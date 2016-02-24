#!/usr/bin/env node

'use strict';

let	Database = require('../lib/database'),
	Agents = require('../lib/agents');

let db = new Database();
db.getConfigById('56caec922ac471e80b900245').then((config) => {
	let type = config.type || 'bind9';
	let agent = new Agents[type].server(config);
	return agent.run(config);
}).then(console.log).catch(console.error);
