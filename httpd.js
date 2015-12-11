#!/usr/bin/env node

'use strict';

let connect = require('connect'),
	quip = require('quip'),
	dispatch = require('dispatch'),
	serveStatic = require('serve-static'),
	bodyParser = require('body-parser');

let app = connect();

app.use(quip);

app.use(serveStatic(__dirname + '/www', {
	index: ['index.htm', 'index.html']
}));

app.use(bodyParser.json({strict: false}));

app.use(dispatch({
	'/api': require('./httpd-api.js')
}));

app.listen(8000);
