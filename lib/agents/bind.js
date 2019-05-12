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

class BindAgent extends Agents.Builder {

	constructor(settings, config, path) {

		super('BIND', path);

		Object.assign(this.path, {
			zone: this.path.run + '/zones'
		});

		let agent = settings.agents.bind;
		let cmd = agent.command || './sbin/named';
		let wrapper = (config.wrapper && config.wrapper.length) ? config.wrapper : agent.wrapper;

		config.args = config.args || {};
		config.mode = config.mode || 'auth';

		let rebuild = !!(config.flags && config.flags.checkout);

		let createEtc = () => fs.mkdirsAsync(this.path.etc);
		let createRun = () => fs.mkdirsAsync(this.path.run);
		let linkZones = () => fs.symlinkAsync('../../../zones', this.path.zone);

		let emptyRunPath = () => fs.emptyDirAsync(this.path.run);
		let createConfig = () => fs.copyAsync(`${settings.path}/config/bind/named.conf-${config.mode}`, `${this.path.etc}/named.conf`);
		let createOptions = () => fs.writeFileAsync(`${this.path.etc}/named-options.conf`, config.options || '');
		let createGlobal = () => fs.writeFileAsync(`${this.path.etc}/named-global.conf`, config.global || '');
		let createZoneConf = () => fs.copyAsync(`${settings.path}/config/bind/zones-${config.zoneset}.conf`, `${this.path.etc}/named-zones.conf`);

		// empties the work directory, then creates the necessary
		// subdirectories for this configuration
		this.target('prepare', '', async () => {
			await this.clean();
			await emptyRunPath();
			await createEtc();
			await createRun();
			await linkZones();
		});

		// does 'git clone'
		this.target('checkout', 'prepare', () => this.checkout(agent.repo, config.branch));

		// does 'autoreconf'
		this.target('autoreconf', 'checkout', () => this.autoreconf());

		// does './configure [args...]'
		this.target('configure', 'autoreconf', () =>
			this.configure(['--prefix', this.path.run, config.args.configure]));

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
		let getVersion = async () => this.run_phase(cmd, '-V', {quiet: true}).then(this.stdout);

		// combines revision and info
		let getInfo = async () => {
			let log = await this.get_commit_log(agent.repo);
			let version = await getVersion();

			let res = {
				commit: log + '\n' + version
			};

			var match = version.match(/^BIND (.*?) </m);
			if (match && match.length > 1) {
				res.version = match[1];
			}

			return res;
		};

		// starts daemon
		let start = () => this.daemon(cmd, [
			agent.args, '-f', '-p', 8053, config.args.server
		], {cwd: this.path.run, wrapper}, / running$/m);

		// main executor function - optionally does a 'prepare' forcing
		// the entire build sequence to start afresh, then gets the latest
		// commit message and runs BIND, adding the commit message to the
		// BIND result output
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

BindAgent.configuration = {
	name: 'BIND',
	protocol: 'dns',
	subtypes: [ 'authoritative', 'recursive' ],
	string: {
		options: 'named.conf options {} statements',
		global: 'named.conf global configuration blocks'
	},
};

module.exports = BindAgent;
