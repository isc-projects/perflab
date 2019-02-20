'use strict';

let Agents = require('./_base'),
	Promise = require('bluebird'),
	fs = Promise.promisifyAll(require('fs-extra'));

// somewhat complicated class that's capable of running the following
// sequence, with dependency checking and user-specified settings
//
// -  git clone 
// -  autoreconf
// -  configure
// -  make
// -  make install
// -  kea
//

class Kea4Agent extends Agents.Builder {

	constructor(settings, config, path) {

		super('Kea4', path);

		let agent = settings.agents.kea4 || {};
		let cmd = agent.command || './sbin/kea-dhcp4';
		let wrapper = (config.wrapper && config.wrapper.length) ? config.wrapper : agent.wrapper;

		config.args = config.args || {};
		config.mode = config.mode || 'auth';

		let rebuild = !!(config.flags && config.flags.checkout);

		let createEtc = () => fs.mkdirsAsync(this.path.etc);
		let createRun = () => fs.mkdirsAsync(this.path.run);

		let emptyRunPath = () => fs.emptyDirAsync(this.path.run);
		let createConfig = () => fs.copyAsync(`${settings.path}/config/kea4/kea.conf`, `${this.path.etc}/kea.conf`);

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

		// run any pre-configure script
		this.target('preconf', 'checkout', () => this.build_phase(config.preConfigure));

		// does 'autoreconf'
		this.target('autoreconf', 'preconf', () => this.autoreconf());

		// does './configure [args...]'
		this.target('configure', 'autoreconf', () =>
			this.configure(['--prefix', this.path.run, config.args.configure]));

		// run any pre-build script
		this.target('prebuild', 'configure', () => this.build_phase(config.preBuild));

		// does 'make [args...]'
		this.target('build', 'prebuild', () => this.make(config.args.make));

		// does 'make install'
		this.target('install', 'build', () => this.make('install'));

		// allows access to raw and privileged sockets
		this.target('setcap', 'install', () => this.run_phase('/usr/bin/sudo', [
			'/usr/sbin/setcap', 'cap_net_raw,cap_net_bind_service=+ep', cmd
		], {quiet: true}));

		// builds the configuration files for this run
		let genConfig = () => createConfig();

		// gets compilation information
		let getVersion = async () => this.run_phase(cmd, '-V', {quiet: true}).then(this.stdout);

		let getInfo = async () => {
			let log = await this.get_commit_log(agent.repo);
			let version = await getVersion();
			return { commit: log + '\n' + version };
		};

		// starts the server under test
		let start = () => this.daemon(cmd, [
			agent.args, '-c', 'etc/kea.conf', config.args.server
		], {cwd: this.path.run, wrapper}, / DHCP4_STARTED /m);

		// main executor function - optionally does a 'prepare' forcing
		// the entire build sequence to start afresh, then gets the latest
		// commit message and runs thes server, adding the commit message
		// to the resulting output
		this.run = async () => {
			await this.targets.prepare({force: rebuild});
			await this.targets.install();
			await this.targets.setcap();
			await genConfig();

			let info = await getInfo();
			let res = await start();
			return Object.assign(res, info);
		};
	}
}

Kea4Agent.configuration = {
	name: 'Kea IPv4',
	protocol: 'dhcp4',
	canPreConfigure: true,
	canPreBuild: true,
};

module.exports = Kea4Agent;
