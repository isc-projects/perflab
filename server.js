#!/usr/bin/env node

'use strict';

var ServerAgent = require('./server-agent.js'),
	MongoClient = require('mongodb');

var mongoUrl = 'mongodb://localhost/perflab';
var repoUrl = 'ssh://repo.isc.org/proj/git/prod/bind9';
var perfPath = '/home/ray/bind-perflab';

function firstOrReject(a) {
	return new Promise((resolve, reject) => {
		if (Array.isArray(a) && a.length > 0) {
			resolve(a[0]);
		} else {
			reject({stderr: 'no entry found'});
		}
	});
}

function install(config) {
	var agent = new ServerAgent(perfPath, repoUrl, config);
	agent.on('targetStart', (t) => console.log(`starting target ${t}`));
	agent.on('targetFinish', (t) => console.log(`finished target ${t}`));
	return agent.run();
}

function get_config(db, config_name) {
	return db.collection('config')
		.find({name: config_name}).next();
		// .then(firstOrReject);
}

try {
	MongoClient.connect(mongoUrl).then((db) => {
		var close = () => db.close();
		var res = get_config(db, "v9_9");
		res.then(close, close);
		return res.then(install);
	}).catch(console.error);
} catch (e) {
	console.error('catch: ' + e);
}
