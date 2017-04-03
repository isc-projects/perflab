#!/usr/bin/env node

'use strict';

let httpd = require('./lib/httpd'),
	Database = require('./lib/database'),
	settings = require('./settings-httpd');

let db = new Database(settings);

httpd(settings, db, __dirname + '/www');
