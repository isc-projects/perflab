#!/usr/bin/env node

'use strict';

let settings = require('./settings'),
	WebSocketServer = require('ws').Server,
	MongoOplog = require('mongo-oplog');

// - WebSocket-based oplog notification -----------

class OpLog {
	constructor(opts) {

		let mongo = settings.mongo;

		let wss = new WebSocketServer(opts);
		let oplog = MongoOplog(mongo.oplog, {ns: mongo.schema}).tail();

		let broadcast = (msg) => {
			let json = JSON.stringify(msg);
			wss.clients.forEach((c) => {
				try {
					c.send(json)
				} catch (e) {
					console.error(e);
				}
			});
		}

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
		}

		oplog.on('insert', send);
		oplog.on('update', send);
		oplog.on('delete', send);
	}
}

module.exports = OpLog;
