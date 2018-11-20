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
// -  nsd
//

class NSDAgent extends Agents.Builder {

	constructor(settings, config) {

		let path = settings.path;
		let agent = settings.agents.nsd;
		let testPath = path + '/tests/' + config._id;
		let runPath = testPath + '/run';
		let etcPath = runPath + '/etc';
		let zonePath = runPath + '/zones';

		super('NSD', agent, testPath);

		let cmd = agent.command || './sbin/nsd';
		let wrapper = (config.wrapper && config.wrapper.length) ? config.wrapper : agent.wrapper;

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
		this.target('prepare', '', async () => {
			await this.clean();
			await emptyRunPath();
			await createEtc();
			await createRun();
			await linkZones();
		});

		// does 'svn checkout'
		this.target('checkout', 'prepare', () => this.checkout(config.branch));

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
		let genConfig = async () => {
			await createConfig();
			await createOptions();
			await createGlobal();
			await createZoneConf();
		};

		// gets compilation information
		let getVersion = async () => {
			let res = await this.spawn(cmd, '-v', {cwd: runPath, quiet: true});
			return res.stderr;
		};

		// combines revision and info
		let getInfo = async () => {
			let commitlog = await this.commitlog();
			let version = await getVersion();
			return commitlog + '\n' + version;
		};

		// starts the server under test
		let start = () => this.daemon(cmd, [
			agent.args,
			'-d', '-p', 8053, '-u', process.env.USER,
			config.args.server
		], {cwd: runPath, wrapper: wrapper}, / nsd started /m);

		// main executor function - optionally does a 'prepare' forcing
		// the entire build sequence to start afresh, then gets the latest
		// commit message and runs the server, adding the commit message
		// to the resulting output
		this.run = async () => {
			await this.targets.prepare({force: rebuild});
			await this.targets.install();
			await genConfig();
			let info = await getInfo();
			let res = await start();
			return Object.assign(res, { commit: info });
		};
	}
}

NSDAgent.configuration = {
	name: 'NSD',
	protocol: 'dns',
	subtypes: [ 'authoritative' ],
	string: {
		options: 'nsd.conf server: statements',
		global: 'nsd.conf global configuration blocks'
	}
};

module.exports = NSDAgent;
