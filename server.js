#!/usr/bin/env node

'use strict';

var ServerAgent = require('./server-agent.js'),
	MongoClient = require('mongodb');

var mongoUrl = 'mongodb://localhost/perflab';
var repoUrl = 'ssh://repo.isc.org/proj/git/prod/bind9';
var perfPath = '/home/ray/bind-perflab';

var notNull = (o) => new Promise((res, rej) => o === null ? rej('npe') : res(o));

function install(config) {
	var agent = new ServerAgent(perfPath, repoUrl, config);
	agent.on('targetStart', (t) => console.log(`starting target ${t}`));
	agent.on('targetFinish', (t) => console.log(`finished target ${t}`));
	return agent.run();
}

function get_config(db, config_name) {
	return db.collection('config')
		.findOne({name: config_name})
		.then(notNull);
}

try {
	MongoClient.connect(mongoUrl).then((db) => {
		var close = () => db.close();
		var res = get_config(db, "v9_10");
		res.then(close, close);
		return res.then(install);
	}).catch(console.error);
} catch (e) {
	console.error('catch: ' + e);
}
