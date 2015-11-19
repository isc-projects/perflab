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
	var s = new ServerAgent(perfPath, repoUrl, config);
	return s.prepare()
		.then(s.checkout)
		.then(s.configure)
		.then(s.build)
		.then(s.install)
		.then(s.start);
}

function get_config(db, config_name) {
	return db.collection('config')
		.find({name: config_name}).toArray()
		.then(firstOrReject);
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
