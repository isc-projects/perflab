#!/usr/bin/env node

'use strict';

let mongoCF = require('../etc/mongo'),
	Database = require('../lib/database'),
	Promise = require('bluebird');

(async function() {
	let db = await new Database(mongoCF).init();
	let dbh = db.handle;

	await db.createIndexes();

	let configs = await db.getConfigs();
	for (let config of configs) {
		console.log(config._id.toString());
		let runs = await db.getRunsByConfigId(config._id);
		for (let run of runs) {
			await dbh.collection('test').update(
				{run_id: run._id, config_id: {$exists: false}},
				{$set: {config_id: config._id}},
				{multi: true});
			await dbh.collection('memory').update(
				{run_id: run._id, config_id: {$exists: false}},
				{$set: {config_id: config._id}},
				{multi: true});
		}
	}

	await db.createIndexes();
	await db.close();
})();
