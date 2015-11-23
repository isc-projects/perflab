#!/usr/bin/env node

'use strict';

var Promise = require('bluebird'),
	fs = Promise.promisifyAll(require('fs-extra')),
	Executor = require('executor'),
	EventEmitter = require('events');

class BindAgent extends Executor {

	constructor(config, perfPath, repo) {
		super();

		config.name = config.name.toLowerCase();
		config.args = config.args || {};
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

		this._depPath(path);

		this._target('prepare', '', () =>
			fs.emptyDirAsync(path)
				.then(createEtc)
				.then(createRun)
				.then(createBuild)
				.then(createConfig)
				.then(createOptions)
				.then(createGlobal)
				.then(createZoneConf)
				.then(linkZones));

		this._target('checkout', 'prepare', () => this._run('/usr/bin/git', [
			'clone', '--depth', 1, '-b', config.branch, repo, '.'
		], {cwd: buildPath}));

		this._target('configure', 'checkout', () => {
			var args = ['--prefix', runPath].concat(config.args.configure || []);
			return this._run('./configure', args, {cwd: buildPath});
		});

		this._target('build', 'configure', () => {
			var args = config.args.make || [];
			return this._run('/usr/bin/make', args, {cwd: buildPath});
		});

		this._target('install', 'build', () => this._run('/usr/bin/make', ['install'], {cwd: buildPath}));

		this._target('run', 'install', () => {
			var args = ['-g', '-p', 8053].concat(config.args.bind || []);
			return this._runWatch('./sbin/named', args, {cwd: runPath}, / running$/m)
		});
	}
}

module.exports = BindAgent;
