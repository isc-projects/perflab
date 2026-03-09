'use strict';

let WebSocket = require('ws');

// - WebSocket-based change notification -----------

module.exports = class OpLog {
	constructor(db, opts) {

		let wss = new WebSocket.Server(opts);

		wss.on('connection', (ws) => {
			ws.send(JSON.stringify({op: 'connected'}));
		});

		let broadcast = (msg) => {
			let json = JSON.stringify(msg);
			wss.clients.forEach((c) => {
				try {
					if (c.readyState === WebSocket.OPEN) {
						c.send(json);
					}
				} catch (e) {
					console.error(e);
				}
			});
		};

		db.on('change', (change) => {
			broadcast(change);
		});
	}
};
