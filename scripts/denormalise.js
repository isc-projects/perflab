#!/usr/bin/env node

'use strict';

let mongoCF = require('../etc/mongo'),
	Database = require('../lib/database'),
	Promise = require('bluebird');

(async function() {
	let db = await new Database(mongoCF).init();
	let configs = await db.getConfigs();

    for (let config of configs) {

		let runs = await db.getRunsByConfigId(config._id);
		for (let run of runs) {
			await db.handle.collection('test').update(
				{run_id: run._id, config_id: {$exists: false}},
				{$set: {config_id: config._id}},
				{multi: true});
			await db.handle.collection('memory').update(
				{run_id: run._id, config_id: {$exists: false}},
				{$set: {config_id: config._id}},
				{multi: true});
		}
	}

    await db.close();
})();
