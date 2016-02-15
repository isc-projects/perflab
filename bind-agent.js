#!/usr/bin/env node

'use strict';

let settings = require('./settings'),
	Executor = require('./executor'),
	Promise = require('bluebird'),
	fs = Promise.promisifyAll(require('fs-extra'));

// somewhat complicated class that's capable of running the following
// sequence, with dependency checking and user-specified settings
//
// -  git clone 
// -  configure
// -  make
// -  make install
// -  named
//
// NB: this code, like much of the rest of this syste, uses
//     "Promises" to encapsulate asynchronous results
//
class BindAgent extends Executor {

	constructor(config) {
		super("BIND");

		let cmd = settings.command.bind || './sbin/named';

		config.args = config.args || {};
		config.options = config.options || "";
		config.global = config.global || "";

		let rebuild = !!(config.flags && config.flags.checkout);

		let path = settings.path;
		let repo = settings.repo.bind9;

		let testPath = path + '/tests/' + config._id;
		let buildPath = testPath + '/build';
		let runPath = testPath + '/run';
		let etcPath = runPath + '/etc';
		let zonePath = runPath + '/zones';

		let createEtc = () => fs.mkdirsAsync(etcPath);
		let createRun = () => fs.mkdirsAsync(runPath);
		let createBuild = () => fs.mkdirsAsync(buildPath);
		let linkZones = () => fs.symlinkAsync('../../../zones', zonePath);

		let createConfig = () => fs.copyAsync('config/named.conf', `${etcPath}/named.conf`);
		let createOptions = () => fs.writeFileAsync(`${etcPath}/named-options.conf`, config.options);
		let createGlobal = () => fs.writeFileAsync(`${etcPath}/named-global.conf`, config.global);
		let createZoneConf = () => fs.copyAsync(`${path}/config/zones-${config.zoneset}.conf`, `${etcPath}/named-zones.conf`);

		// where to store the .dep files
		this._depPath(testPath);

		// empties the work directory, then creates the necessary
		// subdirectories for this configuration
		this._target('prepare', '', () =>
			fs.emptyDirAsync(testPath)
				.then(createEtc)
				.then(createRun)
				.then(createBuild)
				.then(linkZones));

		// does 'git clone'
		this._target('checkout', 'prepare', () => this._run('/usr/bin/git', [
			'clone', '--depth', 1, '-b', config.branch, repo, '.'
		], {cwd: buildPath}));

		// does './configure [args...]'
		this._target('configure', 'checkout', () => {
			let args = ['--prefix', runPath].concat(config.args.configure || []);
			return this._run('./configure', args, {cwd: buildPath});
		});

		// does 'make [args...]'
		this._target('build', 'configure', () => {
			let args = config.args.make || [];
			return this._run('/usr/bin/make', args, {cwd: buildPath});
		});

		// does 'make install'
		this._target('install', 'build', () => this._run('/usr/bin/make', ['install'], {cwd: buildPath}));

		// builds the configuration files for this run
		let genconfig = () =>
				createConfig()
				.then(createOptions)
				.then(createGlobal)
				.then(createZoneConf);

		// does 'git log' to extract last commit message
		let gitlog = () => this._run('/usr/bin/git', ['log', '-n', 1], {cwd: buildPath, quiet: true});

		// gets BIND compilation information
		let bindVersion = () => this._run('./sbin/named', ['-V'], {cwd: runPath, quiet: true});

		// combines 'git log' and 'bind -V' output
		let getinfo = () => gitlog().then((log) => bindVersion()
									.then((version) => log.stdout + "\n" + version.stdout))

		// starts BIND
		let startBind = () => {
			let args = [].concat(settings.args.bind || []);
			args = args.concat(['-f', '-p', 8053]);
			args = args.concat(config.args.bind || []);
			return this._runWatch(cmd, args, {cwd: runPath}, / running$/m);
		}

		// main executor function - optionally does a 'prepare' forcing
		// the entire build sequence to start afresh, then gets the latest
		// commit message and runs BIND, adding the commit message to the
		// BIND result output
		this.run = (opts) =>
			this.prepare({force: rebuild})
				.then(this.install)
				.then(genconfig)
				.then(getinfo)
				.then((info) => startBind().then(
					(res) => Object.assign(res, { commit: info })));
	}
}

module.exports = BindAgent;
