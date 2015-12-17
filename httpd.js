#!/usr/bin/env node

'use strict';

let http = require('http'),
	connect = require('connect'),
	quip = require('quip'),
	dispatch = require('dispatch'),
	serveStatic = require('serve-static'),
	bodyParser = require('body-parser'),
	WebSocketServer = require('ws').Server,
	MongoOplog = require('mongo-oplog'),
	settings = require('./settings');

let app = connect();
let server = http.createServer(app);
let wss = new WebSocketServer({server});

app.use(quip);

app.use(serveStatic(__dirname + '/www', {
	index: ['index.htm', 'index.html']
}));

app.use(bodyParser.json({strict: false}));

app.use(dispatch({
	'/api': require('./httpd-api.js')
}));

server.listen(8000);

wss.broadcast = (msg) => {
	let json = JSON.stringify(msg);
	wss.clients.forEach((c) => c.send(json));
}

function sendOplog(doc) {
    wss.broadcast({
        op: doc.op,
        ns: doc.ns.match(/\.(\w+)$/)[1],
        doc: doc.o
    });
}

let oplog = MongoOplog(settings.oplogUrl, {ns: 'perflab'}).tail();
oplog.on('insert', sendOplog);
oplog.on('update', sendOplog);
oplog.on('delete', sendOplog);
