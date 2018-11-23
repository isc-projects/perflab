#!/usr/bin/env node

'use strict';

let Database = require('./lib/database'),
	Tester = require('./lib/tester'),
	Queue = require('./lib/tester/queue'),
	mongoCF = require('./etc/mongo'),
	settings = require('./etc/settings');

(async function() {

	try {

		let db = await new Database(mongoCF).init();
		await db.createIndexes();

		let tester = new Tester(db, settings);
		let queue = new Queue(db, settings, tester);

		await queue.clear();
		await queue.run();

	} catch (e) {
		console.trace(e);
	}

})();
