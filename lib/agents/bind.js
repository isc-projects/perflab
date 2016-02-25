'use strict';

let Agents = require('./_base'),
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

module.exports = class BindAgent extends Agents.Builder {

	constructor(settings, config) {

		let path = settings.path;
		let testPath = path + '/tests/' + config._id;
		let runPath = testPath + '/run';
		let etcPath = runPath + '/etc';
		let zonePath = runPath + '/zones';

		super('BIND', testPath);

		let cmd = settings.command.bind || './sbin/named';

		config.args = config.args || {};
		config.mode = config.mode || 'auth';

		let rebuild = !!(config.flags && config.flags.checkout);

		let createEtc = () => fs.mkdirsAsync(etcPath);
		let createRun = () => fs.mkdirsAsync(runPath);
		let linkZones = () => fs.symlinkAsync('../../../zones', zonePath);

		let emptyRunPath = () => fs.emptyDirAsync(runPath);
		let createConfig = () => fs.copyAsync(`${path}/config/bind/named.conf-${config.mode}`, `${etcPath}/named.conf`);
		let createOptions = () => fs.writeFileAsync(`${etcPath}/named-options.conf`, config.options || '');
		let createGlobal = () => fs.writeFileAsync(`${etcPath}/named-global.conf`, config.global || '');
		let createZoneConf = () => fs.copyAsync(`${path}/config/bind/zones-${config.zoneset}.conf`, `${etcPath}/named-zones.conf`);

		// empties the work directory, then creates the necessary
		// subdirectories for this configuration
		this.target('prepare', '', () =>
			this.clean()
			.then(emptyRunPath)
			.then(createEtc)
			.then(createRun)
			.then(linkZones));

		// does 'git clone'
		this.target('checkout', 'prepare', () =>
			this.checkout.git(settings.repo.bind, config.branch));

		// does './configure [args...]'
		this.target('configure', 'checkout', () =>
			this.configure(['--prefix', runPath, config.args.configure]));

		// does 'make [args...]'
		this.target('build', 'configure', () => this.make(config.args.make));

		// does 'make install'
		this.target('install', 'build', () => this.make('install'));

		// builds the configuration files for this run
		let genConfig = () =>
				createConfig()
				.then(createOptions)
				.then(createGlobal)
				.then(createZoneConf);

		// gets compilation information
		let getVersion = () => this.spawn('./sbin/named', '-V', {cwd: runPath, quiet: true});

		// combines revision and info
		let getInfo = () => Promise.join(
			this.commitlog.git(),
			getVersion(),
			(commitlog, version) => commitlog.stdout + '\n' + version.stdout
		);

		// starts daemon
		let start = () => this.daemon(cmd, [
			settings.args.bind, '-f', '-p', 8053, config.args.bind
		], {cwd: runPath}, / running$/m);

		// main executor function - optionally does a 'prepare' forcing
		// the entire build sequence to start afresh, then gets the latest
		// commit message and runs BIND, adding the commit message to the
		// BIND result output
		this.run = (opts) =>
			this.targets.prepare({force: rebuild})
				.then(this.targets.install)
				.then(genConfig)
				.then(getInfo)
				.then((info) => start().then(
					(res) => Object.assign(res, { commit: info })));
	}
};
