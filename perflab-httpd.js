#!/usr/bin/env node

'use strict';

let httpd = require('./lib/httpd'),
	Database = require('./lib/database'),
	Agents = require('./lib/agents');

let mongoCF = require('./etc/mongo'),
	settings = require('./etc/settings');

let db = new Database(mongoCF);

httpd(mongoCF, settings, Agents, db, __dirname + '/www');
