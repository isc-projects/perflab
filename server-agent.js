#!/usr/bin/env node

'use strict';

var Promise = require('bluebird'),
	fs = Promise.promisifyAll(require('fs-extra')),
	exec = require('executor'),
	EventEmitter = require('events');

class ServerAgent extends EventEmitter {
	constructor(perfPath, repo, config) {
		super();
		var target = (stage, prev, action) => {
			this[stage] = () => {
				var guard = `${path}/.dep/${stage}`;
				if (fs.existsSync(guard)) {
					return Promise.resolve();
				} else {
					var before = prev ? this[prev] : Promise.resolve;
					var task = () => {
						this.emit('targetStart', stage);
						return action();
					};
					var after = () => {
						this.emit('targetFinish', stage);
						return stage === "run" ? Promise.resolve() : fs.outputFileAsync(guard, '');
					};
					return before().then(task).then(after);
				}
			}
		}

		config.name = config.name.toLowerCase();
		config.configure = config.configure || [];
		config.options = config.options || "";
		config.global = config.global || "";
		config.cmdline = config.cmdline || [];

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

		target('checkout', 'prepare', () => exec.run('/usr/bin/git', [
			'clone', '--depth', 1, '-b', config.branch, repo, '.'
		], {cwd: buildPath}));

		target('configure', 'checkout', () => {
			var args = ['--prefix', runPath].concat(config.configure);
			return exec.run('./configure', args, {cwd: buildPath});
		});

		target('build', 'configure', () => exec.run('/usr/bin/make', [], {cwd: buildPath}));

		target('install', 'build', () => exec.run('/usr/bin/make', ['install'], {cwd: buildPath}));

		target('run', 'install', () => {
			var args = ['-g', '-p', 8053].concat(config.cmdline);
			return exec.runWatch('./sbin/named', args, {cwd: runPath}, / running$/m)
		});
	}
}

module.exports = ServerAgent;
