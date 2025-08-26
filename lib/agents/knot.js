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
// -  knotd
//

class KnotAgent extends Agents.Builder {

	constructor(settings, config, path) {

		super('Knot2', path);

		Object.assign(this.path, {
			zone: this.path.run + '/var/lib/knot/zones',
		});

		let agent = settings.agents.knot || {};
		let cmd = agent.command || './sbin/knotd';
		let wrapper = (config.wrapper && config.wrapper.length) ? config.wrapper : agent.wrapper;

		config.args = config.args || {};
		config.mode = config.mode || 'auth';

		let rebuild = !!(config.flags && config.flags.checkout);

		let createEtc = () => fs.mkdirsAsync(this.path.etc);
		let createRun = () => fs.mkdirsAsync(this.path.run);
		let linkZones = () => {
			try {
				return fs.symlinkAsync('../../../../../../zones', this.path.zone);
			} catch (e) {
				// ignored
			}
		};

		let emptyRunPath = () => fs.emptyDirAsync(this.path.run);
		let createConfig = () => fs.copyAsync(`${settings.path}/config/knot/knot.conf`, `${this.path.etc}/knot/knot.conf`);
		let createOptions = () => fs.writeFileAsync(`${this.path.etc}/knot/options.conf`, config.options || '');
		let createGlobal = () => fs.writeFileAsync(`${this.path.etc}/knot/global.conf`, config.global || '');
		let createZoneConf = () => fs.copyAsync(`${settings.path}/config/knot/zones-${config.zoneset}.conf`, `${this.path.etc}/knot/zones.conf`);

		// empties the work directory, then creates the necessary
		// subdirectories for this configuration
		this.target('prepare', '', async () => {
			await this.clean();
			await emptyRunPath();
			await createEtc();
			await createRun();
		});

		// does 'git clone'
		this.target('checkout', 'prepare', () => this.checkout(agent.repo, config.branch));

		// does 'autoreconf'
		this.target('autoreconf', 'checkout', () => this.autoreconf());

		// does './configure [args...]'
		this.target('configure', 'autoreconf', () =>
			this.configure(['--prefix', this.path.run, '--disable-documentation', config.args.configure]));

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
			await linkZones();
		};

		// gets compilation information
		let getVersion = async () => this.run_phase(cmd, '-V', {quiet: true}).then(this.stdout);

		// combines revision and info
		let getInfo = async () => {
			let log = await this.get_commit_log(agent.repo);
			let version = await getVersion();
			return { commit: log + '\n' + version };
		};

		// starts the server under test
		let start = () => this.daemon(cmd, [
			agent.args, '-v', config.args.server
		], {cwd: this.path.run, wrapper}, / server started/m);

		// main executor function - optionally does a 'prepare' forcing
		// the entire build sequence to start afresh, then gets the latest
		// commit message and runs thes server, adding the commit message
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

KnotAgent.configuration = {
	name: 'Knot',
	protocol: 'dns',
	subtypes: [ 'authoritative' ],
	string: {
		global: 'knot.conf global configuration blocks'
	}
};

module.exports = KnotAgent;
