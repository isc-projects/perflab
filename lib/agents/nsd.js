'use strict';

let Agents = require('./_base'),
	Promise = require('bluebird'),
	fs = Promise.promisifyAll(require('fs-extra'));

// somewhat complicated class that's capable of running the following
// sequence, with dependency checking and user-specified settings
//
// -  svn co
// -  autoreconf
// -  configure
// -  make
// -  make install
// -  named
//
// NB: this code, like much of the rest of this syste, uses
//     "Promises" to encapsulate asynchronous results
//
module.exports = class NSDAgent extends Agents.Builder {

	constructor(settings, config) {

		let path = settings.path;
		let testPath = path + '/tests/' + config._id;
		let runPath = testPath + '/run';
		let etcPath = runPath + '/etc';
		let zonePath = runPath + '/zones';

		super('NSD', testPath);

		let cmd = settings.command.nsd || './sbin/nsd';
		let wrapper = (config.wrapper && config.wrapper.length) ? config.wrapper : settings.wrapper.nsd;

		config.args = config.args || {};
		config.options = config.options || '';
		config.global = config.global || '';
		config.mode = config.mode || 'auth';

		let rebuild = !!(config.flags && config.flags.checkout);

		let createEtc = () => fs.mkdirsAsync(etcPath);
		let createRun = () => fs.mkdirsAsync(runPath);
		let linkZones = () => fs.symlinkAsync('../../../zones', zonePath);

		let emptyRunPath = () => fs.emptyDirAsync(runPath);
		let createConfig = () => fs.copyAsync(`${path}/config/nsd/nsd.conf`, `${etcPath}/nsd/nsd.conf`);
		let createOptions = () => fs.writeFileAsync(`${etcPath}/nsd/options.conf`, config.options);
		let createGlobal = () => fs.writeFileAsync(`${etcPath}/nsd/global.conf`, config.global);
		let createZoneConf = () => fs.copyAsync(`${path}/config/nsd/zones-${config.zoneset}.conf`, `${etcPath}/nsd/zones.conf`);

		// empties the work directory, then creates the necessary
		// subdirectories for this configuration
		this.target('prepare', '', () =>
			this.clean()
			.then(emptyRunPath)
			.then(createEtc)
			.then(createRun)
			.then(linkZones));

		// does 'svn checkout'
		this.target('checkout', 'prepare', () => this.checkout.svn(settings.repo.nsd, config.branch));

		// does 'autoreconf'
		this.target('autoreconf', 'checkout', () => this.autoreconf());

		// does './configure [args...]'
		this.target('configure', 'autoreconf', () =>
			this.configure(['--prefix', runPath, '--enable-root-server', config.args.configure]));

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
		let getVersion = () => this.spawn('./sbin/nsd', '-v', {cwd: runPath, quiet: true})
				.then(res => res.stderr);

		// combines revision and info
		let getInfo = () => Promise.join(this.commitlog.svn(), getVersion(),
			(commitlog, version) => commitlog + '\n' + version
		);

		// starts the server under test
		let start = () => this.daemon(cmd, [
			settings.args.nsd,
			'-d', '-p', 8053, '-u', process.env.USER,
			config.args.bind
		], {cwd: runPath, wrapper: config.wrapper}, / nsd started /m);

		// main executor function - optionally does a 'prepare' forcing
		// the entire build sequence to start afresh, then gets the latest
		// commit message and runs the server, adding the commit message
		// to the resulting output
		this.run = (opts) =>
			this.targets.prepare({force: rebuild})
				.then(this.targets.install)
				.then(genConfig)
				.then(getInfo)
				.then((info) => start().then(
					(res) => Object.assign(res, { commit: info })));
	}
};
