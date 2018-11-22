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

	constructor(settings, config, path) {

		super('NSD', path);

		Object.assign(this.path, {
			zone: this.path.run + '/zones'
		});

		let agent = settings.agents.nsd || {};
		let cmd = agent.command || './sbin/nsd';
		let wrapper = (config.wrapper && config.wrapper.length) ? config.wrapper : agent.wrapper;

		config.args = config.args || {};
		config.options = config.options || '';
		config.global = config.global || '';
		config.mode = config.mode || 'auth';

		let rebuild = !!(config.flags && config.flags.checkout);

		let createEtc = () => fs.mkdirsAsync(this.path.etc);
		let createRun = () => fs.mkdirsAsync(this.path.run);
		let linkZones = () => fs.symlinkAsync('../../../zones', this.path.zone);

		let emptyRunPath = () => fs.emptyDirAsync(this.path.run);
		let createConfig = () => fs.copyAsync(`${settings.path}/config/nsd/nsd.conf`, `${this.path.etc}/nsd/nsd.conf`);
		let createOptions = () => fs.writeFileAsync(`${this.path.etc}/nsd/options.conf`, config.options);
		let createGlobal = () => fs.writeFileAsync(`${this.path.etc}/nsd/global.conf`, config.global);
		let createZoneConf = () => fs.copyAsync(`${settings.path}/config/nsd/zones-${config.zoneset}.conf`, `${this.path.etc}/nsd/zones.conf`);

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
		this.target('checkout', 'prepare', () => this.checkout(agent.repo, config.branch));

		// does 'autoreconf'
		this.target('autoreconf', 'checkout', () => this.autoreconf());

		// does './configure [args...]'
		this.target('configure', 'autoreconf', () =>
			this.configure(['--prefix', this.path.run, '--enable-root-server', config.args.configure]));

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
		let getVersion = async () => this.run_phase(cmd, '-v', {quiet: true}).then(this.stderr);

		// combines revision and info
		let getInfo = async () => {
			let log = await this.get_commit_log(agent.repo);
			let version = await getVersion();
			return { commit: log + '\n' + version };
		};

		// starts the server under test
		let start = () => this.daemon(cmd, [
			agent.args,
			'-d', '-p', 8053, '-u', process.env.USER,
			config.args.server
		], {cwd: this.path.run, wrapper: wrapper}, / nsd started /m);

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
			return Object.assign(res, info);
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
