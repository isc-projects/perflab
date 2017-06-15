'use strict';

let http = require('http'),
	connect = require('connect'),
	quip = require('quip'),
	dispatch = require('dispatch'),
	errorHandler = require('errorhandler'),
	serveStatic = require('serve-static'),
	bodyParser = require('body-parser'),
	OpLog = require('./oplog');

module.exports = (mongocf, settings, agents, db, docRoot) => {

	// create HTTP server
	let app = connect();
	let server = http.createServer(app);

	// attach the OpLog websocket to the server via HTTP Upgrade:
	let oplog = new OpLog(mongocf, {server, path: '/oplog', perMessageDeflate: false});

	// add useful JSON etc methods from 'quip' library
	app.use(quip);

	// static content comes from this module's 'www' subdirectory
	app.use(serveStatic(docRoot, {
		index: ['index.htm', 'index.html']
	}));

	// response bodies containing JSON are automatically decoded
	app.use(bodyParser.json({strict: false}));

	// REST API URLs are all in /api/
	let api = require('./api');
	app.use(dispatch({
		'/api': api(settings, agents, db)
	}));

	app.use(errorHandler());

	server.listen(8000);
};
