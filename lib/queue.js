#!/usr/bin/env node

'use strict';

class Queue {

	constructor(db, settings, tester) {
	
		// looks for a queue entry, and if found gets the matching config
		// entry, runs it, then marks it as done, and if necessary (for
		// non-repeating queue items disables the item)
		async function runOne() {
			let filter = settings.queueFilter || {};
			let queue = await db.takeNextFromQueue(filter);
			if (queue) {
				let config = await db.getConfigById(queue._id);
				await tester.run(config);
				await db.markQueueEntryDone(queue._id);
				await db.disableOneshotQueue(queue._id);
			}
		}

		// marks all running jobs as stopped
		this.clear = async function() {
			let filter = settings.queueFilter || {};
			return db.clearQueue(filter);
		};

		// main loop - checks global pause status setting and either attempts
		// to take a job from the queue, or waits one second before looping
		this.run = async function() {

			/* eslint no-constant-condition: 0 */
			while (true) {
				let res = await db.getPaused();
				if (!res.paused) {
					try {
						await runOne();
					} catch (e) {
						console.trace(e);
					}
				}
				await new Promise((resolve) => setTimeout(resolve, 2000));
			}
		};
	}
}

module.exports = Queue;
