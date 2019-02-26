'use strict';

let WebSocket = require('ws'),
	MongoOplog = require('mongo-oplog');

// - WebSocket-based oplog notification -----------

module.exports = class OpLog {
	constructor(mongocf, opts) {

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

		let send = (doc) => {
			let msg = {
				op: doc.op,
				ns: doc.ns.match(/\.(\w+)$/)[1],
				doc: doc.o
			};
			if (doc.op === 'u' && doc.o2 && doc.o2._id) {
				msg.doc._id = doc.o2._id;
			}
			broadcast(msg);
		};

		const oplog = MongoOplog(mongocf.oplog, {ns: mongocf.schema});
		oplog.tail();
		oplog.on('insert', send);
		oplog.on('update', send);
		oplog.on('delete', send);
	}
};
