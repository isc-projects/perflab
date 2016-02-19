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
class NSDAgent extends Executor {

	constructor(config) {
		super('NSD');

		let cmd = settings.command.nsd || './sbin/nsd';

		config.args = config.args || {};
		config.options = config.options || '';
		config.global = config.global || '';
		config.mode = config.mode || 'auth';

		let rebuild = !!(config.flags && config.flags.checkout);

		let path = settings.path;
		let repo = settings.repo.nsd;

		let testPath = path + '/tests/' + config._id;
		let buildPath = testPath + '/build';
		let runPath = testPath + '/run';
		let etcPath = runPath + '/etc';
		let zonePath = runPath + '/zones';

		let createEtc = () => fs.mkdirsAsync(etcPath);
		let createRun = () => fs.mkdirsAsync(runPath);
		let createBuild = () => fs.mkdirsAsync(buildPath);
		let linkZones = () => fs.symlinkAsync('../../../zones', zonePath);

		let createTestPath = () => fs.emptyDirAsync(testPath);
		let createConfig = () => fs.copyAsync(`${path}/config/nsd/nsd.conf`, `${etcPath}/nsd/nsd.conf`);
		let createOptions = () => fs.writeFileAsync(`${etcPath}/nsd/options.conf`, config.options);
		let createGlobal = () => fs.writeFileAsync(`${etcPath}/nsd/global.conf`, config.global);
		let createZoneConf = () => fs.copyAsync(`${path}/config/nsd/zones-${config.zoneset}.conf`, `${etcPath}/nsd/zones.conf`);

		// where to store the .dep files
		this._depPath(testPath);

		// empties the work directory, then creates the necessary
		// subdirectories for this configuration
		this._target('prepare', '', () =>
			createTestPath()
				.then(createEtc)
				.then(createRun)
				.then(createBuild)
				.then(linkZones));

		// does 'svn checkout'
		this._target('checkout', 'prepare', () => this._run('/usr/bin/svn', [
			'co', `${repo}${config.branch}`, '.'
		], {cwd: buildPath}));

		// does 'autoreconf'
		this._target('autoreconf', 'checkout', () =>
			this._run('/usr/bin/autoreconf', ['-i'], {cwd: buildPath}));

		// does './configure [args...]'
		this._target('configure', 'autoreconf', () => {
			let args = ['--prefix', runPath, '--enable-root-server'].concat(config.args.configure || []);
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
		let genConfig = () =>
				createConfig()
				.then(createOptions)
				.then(createGlobal)
				.then(createZoneConf);

		// does 'svn log' to extract last commit message
		let getRevision = () => this._run('/usr/bin/svn', ['log', '-l', 1], {cwd: buildPath, quiet: true});

		// gets compilation information
		let getVersion = () => this._run('./sbin/nsd', ['-v'], {cwd: runPath, quiet: true});

		// combines revision and info
		let getInfo = () => getRevision().then((log) => getVersion()
									.then((version) => log.stdout + '\n' + version.stdout))

		// starts the server under test
		let startServer = () => {
			let args = [].concat(settings.args.nsd || []);
			args = args.concat(['-d', '-p', 8053, '-u', process.env.USER]);
			args = args.concat(config.args.nsd || []);
			return this._runWatch(cmd, args, {cwd: runPath}, / nsd started$/m);
		}

		// main executor function - optionally does a 'prepare' forcing
		// the entire build sequence to start afresh, then gets the latest
		// commit message and runs thes server, adding the commit message to the
		// resulting output
		this.run = (opts) =>
			this.prepare({force: rebuild})
				.then(this.install)
				.then(genConfig)
				.then(getInfo)
				.then((info) => startServer().then(
					(res) => Object.assign(res, { commit: info })));
	}
}

module.exports = NSDAgent;
