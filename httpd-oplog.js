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
			wss.clients.forEach((c) => c.send(json));
		}
	
		let send = (doc) => {
    		broadcast({
        		op: doc.op,
        		ns: doc.ns.match(/\.(\w+)$/)[1],
        		doc: doc.o
    		});
		}

		oplog.on('insert', send);
		oplog.on('update', send);
		oplog.on('delete', send);
	}
}

module.exports = OpLog;
