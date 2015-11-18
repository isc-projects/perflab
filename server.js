#!/usr/bin/env node

'use strict';

var Promise = require('bluebird'),
	fs = Promise.promisifyAll(require('fs-extra')),
	MongoClient = require('mongodb'),
	EventEmitter = require('events'),
	spawn = require('child_process').spawn;

var perfPath = '/home/ray/bind-perflab';

var mongoUrl = 'mongodb://localhost/perflab';
var repoUrl = 'ssh://repo.isc.org/proj/git/prod/bind9';

function Command(cmd, args, opts) {
	var stdout = '', stderr = '';
	var child = spawn(cmd, args, opts);
	child.stdout.on('data', (data) => stdout += data);
	child.stderr.on('data', (data) => stderr += data);
	console.log(cmd + ' ' + args.join(' '));
	return new Promise((resolve, reject) => {
		child.on('exit', (status) => {
			if (status) {
				reject({stdout, stderr, status});
			} else {
				resolve({stdout, stderr});
			}
		});
	});
}

function firstOrReject(a) {
	return new Promise((resolve, reject) => {
		if (Array.isArray(a) && a.length > 0) {
			resolve(a[0]);
		} else {
			reject({stderr: 'no entry found'});
		}
	});
}

class ServerHandler {
	constructor(repo, config) {

		config.name = config.name.toLowerCase();
		config.configure = config.configure || [];

		var path = perfPath + '/' + config.name.replace(/\s/g, '_');
		var buildPath = path + '/build';
		var runPath = path + '/run';

		this.prepare = () => fs.emptyDirAsync(path);

		this.checkout = () => {
			return fs.mkdirsAsync(buildPath).then(() => Command('/usr/bin/git', [
				'clone',
				'--depth', 1,
				'-b', config.branch,
				repo,
				'.'
			], {cwd: buildPath}));
		}

		this.configure = () => {
			var args = ['--prefix', runPath].concat(config.configure);
			return Command('./configure', args, {cwd: buildPath});
		}

		this.build = () => {
			return Command('make', [], {cwd: buildPath});
		}

		this.install = () => {
			return Command('make', ['install'], {cwd: buildPath});
		}

		this.start = () => {
			console.log('starting');
			return Promise.reject({stderr: 'Gotcha!'});
		}
	}
}

function install(config) {
	var s = new ServerHandler(repoUrl, config);
	return s.prepare()
		.then(s.checkout)
		.then(s.configure)
		.then(s.build)
		.then(s.install)
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
