#!/usr/bin/env node

'use strict';

let Promise = require('bluebird'),
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

		let path = perfPath + '/tests/' + config.name.replace(/[\s\/]/g, '_');
		let buildPath = path + '/build';
		let runPath = path + '/run';
		let etcPath = runPath + '/etc';
		let zonePath = runPath + '/zones';

		let createEtc = () => fs.mkdirsAsync(etcPath);
		let createRun = () => fs.mkdirsAsync(runPath);
		let createBuild = () => fs.mkdirsAsync(buildPath);

		let createConfig = () => fs.copyAsync('config/named.conf', `${etcPath}/named.conf`);
		let createOptions = () => fs.writeFileAsync(`${etcPath}/named-options.conf`, config.options);
		let createGlobal = () => fs.writeFileAsync(`${etcPath}/named-global.conf`, config.global);
		let createZoneConf = () => fs.copyAsync(`config/zones-${config.zoneset}.conf`, `${etcPath}/named-zones.conf`);

		let linkZones = () => fs.symlinkAsync('../../../zones', zonePath);

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
			let args = ['--prefix', runPath].concat(config.args.configure || []);
			return this._run('./configure', args, {cwd: buildPath});
		});

		this._target('build', 'configure', () => {
			let args = config.args.make || [];
			return this._run('/usr/bin/make', args, {cwd: buildPath});
		});

		this._target('install', 'build', () => this._run('/usr/bin/make', ['install'], {cwd: buildPath}));

		this._target('run', 'install', () => {
			let args = ['-g', '-p', 8053].concat(config.args.bind || []);
			return this._runWatch('./sbin/named', args, {cwd: runPath}, / running$/m)
		});
	}
}

module.exports = BindAgent;
