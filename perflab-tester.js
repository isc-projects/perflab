#!/usr/bin/env node

'use strict';

let ApiClient = require('./lib/api-client'),
	Tester = require('./lib/tester'),
	Queue = require('./lib/queue'),
	settings = require('./etc/settings');

(async function() {

	try {

		let db = new ApiClient(settings.apiUrl || 'http://localhost:8000/api');

		let tester = new Tester(db, settings);
		let queue = new Queue(db, settings, tester);

		await queue.clear();
		await queue.run();

	} catch (e) {
		console.trace(e);
	}

})();
