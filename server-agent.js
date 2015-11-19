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

		var target = (stage, prev, action) => {
			this[stage] = () => {
				var guard = `${path}/.dep/${stage}`;
				if (fs.existsSync(guard)) {
					return Promise.resolve();
				} else {
					var dep = prev ? this[prev] : Promise.resolve;
					return dep().then(action).then(() => fs.outputFileAsync(guard, ''));
				}
			}
		}

		config.name = config.name.toLowerCase();
		config.configure = config.configure || [];
		config.options = config.options || "";
		config.global = config.global || "";

		var path = perfPath + '/tests/' + config.name.replace(/[\s\/]/g, '_');
		var buildPath = path + '/build';
		var runPath = path + '/run';
		var etcPath = runPath + '/etc';
		var zonePath = runPath + '/zones';

		var createEtc = () => fs.mkdirsAsync(etcPath);
		var createRun = () => fs.mkdirsAsync(runPath);
		var createBuild = () => fs.mkdirsAsync(buildPath);

		var createConfig = () => fs.copyAsync('config/named.conf', `${etcPath}/named.conf`);
		var createOptions = () => fs.writeFileAsync(`${etcPath}/named-options.conf`, config.options);
		var createGlobal = () => fs.writeFileAsync(`${etcPath}/named-global.conf`, config.global);
		var createZoneConf = () => fs.copyAsync(`config/zones-${config.zoneset}.conf`, `${etcPath}/named-zones.conf`);

		var linkZones = () => fs.symlinkAsync('../../../zones', zonePath);

		target('prepare', '', () =>
			fs.emptyDirAsync(path)
				.then(createEtc)
				.then(createRun)
				.then(createBuild)
				.then(createConfig)
				.then(createOptions)
				.then(createGlobal)
				.then(createZoneConf)
				.then(linkZones));

		target('checkout', 'prepare', () => exec('/usr/bin/git', [
			'clone', '--depth', 1, '-b', config.branch, repo, '.'
		], {cwd: buildPath}));

		target('configure', 'checkout', () => {
			var args = ['--prefix', runPath].concat(config.configure);
			return exec('./configure', args, {cwd: buildPath});
		});

		target('build', 'configure', () => exec('/usr/bin/make', [], {cwd: buildPath}));

		target('install', 'build', () => exec('/usr/bin/make', ['install'], {cwd: buildPath}));

		this.start = () => this.install().then(() => execMatch('./sbin/named', ['-g', '-p', 8053], {cwd: runPath}, / running$/m));
	}
}

module.exports = ServerAgent;
