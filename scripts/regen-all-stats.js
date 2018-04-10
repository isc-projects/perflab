#!/usr/bin/env node

'use strict';

let	Database = require('../lib/database'),
	Promise = require('bluebird'),
	settings = require('../settings');

Promise.longStackTraces();

let dbo = new Database(settings);

dbo.query((db) => {
	db.collection('run').find({},{_id:1}).toArray().then((runs) => {
		return Promise.each(runs, (run) => {
			console.log(run._id);
			return dbo.updateStatsByRunId(run._id);
		});
	});
});
