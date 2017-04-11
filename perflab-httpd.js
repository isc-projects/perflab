#!/usr/bin/env node

'use strict';

let httpd = require('./lib/httpd'),
	Database = require('./lib/database'),
	Agents = require('./lib/agents'),
	mongoCF = require('./etc/mongo'),
	Settings = require('./settings');

let db = new Database(mongoCF);

httpd(mongoCF, Settings, Agents, db, __dirname + '/www');
