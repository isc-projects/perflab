#!/usr/bin/env node

'use strict';

let settings = require('./settings'),
	http = require('http'),
	connect = require('connect'),
	quip = require('quip'),
	dispatch = require('dispatch'),
	serveStatic = require('serve-static'),
	bodyParser = require('body-parser'),
	OpLog = require('./httpd-oplog');

// create HTTP server
let app = connect();
let server = http.createServer(app);

// attach the OpLog websocket to the server via HTTP Upgrade:
let oplog = new OpLog({server, path: '/oplog'});

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
	'/api': require('./httpd-api')
}));

server.listen(8000);
