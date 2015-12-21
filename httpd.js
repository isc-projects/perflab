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

// create HTTP server with WebSocket 'Upgrade' feature
let app = connect();
let server = http.createServer(app);
let wss = new WebSocketServer({server});

// add useful JSON etc methods from 'quip' library
app.use(quip);

// static content comes from this app's 'www' subdirectory
app.use(serveStatic(__dirname + '/www', {
	index: ['index.htm', 'index.html']
}));

// response bodies containing JSON are automatically decoded
app.use(bodyParser.json({strict: false}));

// REST API URLs are all in /api/
app.use(dispatch({
	'/api': require('./httpd-api.js')
}));

server.listen(8000);

// - WebSocket-based oplog notification -----------

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
