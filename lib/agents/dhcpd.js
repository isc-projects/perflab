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

class DHCPDAgent extends Agents.Builder {

	constructor(settings, config, path) {

		super('dhcpd', path);

		Object.assign(this.path, {
			state: '/ramdisk'
		});

		let agent = settings.agents.dhcpd;
		let cmd = agent.command || './sbin/dhcpd';
		let wrapper = (config.wrapper && config.wrapper.length) ? config.wrapper : agent.wrapper;

		config.args = config.args || {};
		config.mode = config.mode || 'auth';

		let rebuild = !!(config.flags && config.flags.checkout);

		let emptyRunPath = () => fs.emptyDirAsync(this.path.run);
		let emptyStatePath = () => fs.emptyDirAsync(this.path.state);
		let createStateRun = () => fs.mkdirAsync(`${this.path.state}/run`);
		let createStateDB = () => fs.mkdirAsync(`${this.path.state}/db`);
		let createLeaseDB = () => fs.copyAsync('/dev/null', `${this.path.state}/db/dhcpd.leases`);

		let createConfig = () => Promise.all([
			fs.copyAsync(`${settings.path}/config/dhcpd/dhcpd.conf`, `${this.path.etc}/dhcpd.conf`),
			fs.copyAsync(`${settings.path}/config/dhcpd/perflab.conf`, `${this.path.etc}/perflab.conf`)
		]);

		let createState = async () => {
			await emptyStatePath();
			await createStateRun();
			await createStateDB();
			await createLeaseDB();
		};

		// empties the work directory, then creates the necessary
		// subdirectories for this configuration
		this.target('prepare', '', async () => {
			await this.clean();
			await emptyRunPath();
		});

		// does 'git clone'
		this.target('checkout', 'prepare', () => this.checkout(agent.repo, config.branch));

		// fetches the required BIND libraries - somewhat hacky
		this.target('getbind', 'checkout', () => this.build_phase('/usr/bin/git',
			['clone', settings.agents.bind.repo.url, 'bind/bind9']));

		// configures the required BIND libraries
		this.target('confbind', 'getbind', () => this.build_phase('/bin/sh',
			['./util/bind.sh', 'HEAD' ],
			{quiet: true}));

		// does './configure [args...]'
		this.target('configure', 'confbind', () => this.configure([
			'--prefix', this.path.run,
			'--localstatedir', this.path.state,
			config.args.configure]
		));

		// does 'make [args...]'
		this.target('build', 'configure', () => this.make(config.args.make));

		// does 'make install'
		this.target('install', 'build', () => this.make('install'));

		// does 'make install'
		this.target('setcap', 'install', () => this.run_phase('/usr/bin/sudo', [
			'/usr/sbin/setcap', 'cap_net_raw,cap_net_bind_service=+ep', cmd
		], {quiet: true}));

		// gets compilation information
		let getVersion = async () => this.run_phase(cmd, '--version', {quiet: true}).then(this.stdout);

		// combines revision and info
		let getInfo = async () => {
			let log = await this.get_commit_log(agent.repo);
			let version = await getVersion();
			return { commit: log + '\n' + version };
		};

		// starts the server under test
		let start = () => this.daemon(cmd, [
			agent.args, '-f', '-cf', 'etc/dhcpd.conf', config.args.server
		], {cwd: this.path.run, wrapper}, /^Sending on /m);

		// main executor function - optionally does a 'prepare' forcing
		// the entire build sequence to start afresh, then gets the latest
		// commit message and runs thes server, adding the commit message
		// to the resulting output
		this.run = async () => {
			await this.targets.prepare({force: rebuild});
			await this.targets.install();
			await this.targets.setcap();
			await createConfig();
			await createState();
			let info = await getInfo();
			let res = await start();
			return Object.assign(res, info);
		};
	}
}

DHCPDAgent.configuration = {
	name: 'ISC DHCPd',
	protocol: 'DHCP4'
};

module.exports = DHCPDAgent;
