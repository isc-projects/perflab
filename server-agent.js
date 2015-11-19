#!/usr/bin/env node

'use strict';

var Promise = require('bluebird'),
	fs = Promise.promisifyAll(require('fs-extra')),
	spawn = require('child_process').spawn;

function exec(cmd, args, opts) {
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

function execMatch(cmd, args, opts, match)
{
	console.log(cmd + ' ' + args.join(' '));
	return new Promise((resolve, reject) => {
		var matched = false;
		var stdout = '', stderr = '';
		var child = spawn(cmd, args, opts);
		child.stdout.on('data', (data) => stdout += data);
		child.stderr.on('data', (data) => {
			stderr += data;
			if (!matched && stderr.match(match)) {
				matched = true;
				resolve({stdout, stderr});
			}
		});
		child.on('exit', (status) => {
			if (matched) {
				// do nothing
			} else {
				reject({stdout, stderr, status});
			}
		});
	});
}

class ServerAgent {
	constructor(perfPath, repo, config) {

		config.name = config.name.toLowerCase();
		config.configure = config.configure || [];
		config.options = config.options || "";
		config.global = config.global || "";

		var path = perfPath + '/tests/' + config.name.replace(/[\s\/]/g, '_');
		var buildPath = path + '/build';
		var runPath = path + '/run';
		var etcPath = runPath + '/etc';

		var createEtc = () => fs.mkdirsAsync(etcPath);
		var createConfig = () => fs.copyAsync('config/named.conf', `${etcPath}/named.conf`);
		var createOptions = () => fs.writeFileAsync(`${etcPath}/named-options.conf`, config.options);
		var createGlobal = () => fs.writeFileAsync(`${etcPath}/named-global.conf`, config.global);
		var createZoneConf = () => fs.copyAsync(`config/zones-${config.zoneset}.conf`, `${etcPath}/named-zones.conf`);

		var checkout = () => exec('/usr/bin/git', [
			'clone', '--depth', 1, '-b', config.branch, repo, '.'
		], {cwd: buildPath});

		this.prepare = () =>
			fs.emptyDirAsync(path)
				.then(createEtc)
				.then(createConfig)
				.then(createOptions)
				.then(createGlobal)
				.then(createZoneConf);

		this.checkout = () =>
			fs.mkdirsAsync(buildPath)
				.then(checkout);

		this.configure = () => {
			var args = ['--prefix', runPath].concat(config.configure);
			return exec('./configure', args, {cwd: buildPath});
		}

		this.build = () => exec('make', [], {cwd: buildPath});

		this.install = () => exec('make', ['install'], {cwd: buildPath});

		this.start = () => execMatch('./sbin/named', ['-g', '-p', 8053], {cwd: runPath}, / running$/m);
	}
}

module.exports = ServerAgent;
