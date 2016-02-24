#!/usr/bin/env node

'use strict';

let settings = require('../settings'),
	Database = require('../database'),
	Promise = require('bluebird');


let dbapi = new Database(settings);

dbapi.getConfigs().then((configs) => {
	return Promise.each(configs, (config) => {
		return dbapi.getRunsByConfigId(config._id).then((runs) => {
			return Promise.each(runs, (run) => {
				return dbapi.query((db) => {
						db.collection('test').update(
							{run_id: run._id, config_id: {$exists: false}},
							{$set: {config_id: config._id}},
							{multi: true}
						);
					}).then(() => 
					dbapi.query((db) => {
						db.collection('memory').update(
							{run_id: run._id, config_id: {$exists: false}},
							{$set: {config_id: config._id}},
							{multi: true}
						);
					}));
			});
		});
	});
}).then(dbapi.close);
