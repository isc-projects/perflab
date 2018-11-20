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

	constructor(settings, config) {

		let path = settings.path;
		let agent = settings.agents.dhcpd;
		let testPath = path + '/tests/' + config._id;
		let buildPath = testPath + '/build';
		let statePath = '/ramdisk';
		let runPath = testPath + '/run';
		let etcPath = runPath + '/etc';

		super('dhcpd', agent, testPath);

		let cmd = agent.command || './sbin/dhcpd';
		let wrapper = (config.wrapper && config.wrapper.length) ? config.wrapper : agent.wrapper;

		config.args = config.args || {};
		config.mode = config.mode || 'auth';

		let rebuild = !!(config.flags && config.flags.checkout);

		let emptyRunPath = () => fs.emptyDirAsync(runPath);
		let emptyStatePath = () => fs.emptyDirAsync(statePath);
		let createStateRun = () => fs.mkdirAsync(`${statePath}/run`);
		let createStateDB = () => fs.mkdirAsync(`${statePath}/db`);
		let createLeaseDB = () => fs.copyAsync('/dev/null', `${statePath}/db/dhcpd.leases`);

		let createConfig = () => Promise.all([
			fs.copyAsync(`${path}/config/dhcpd/dhcpd.conf`, `${etcPath}/dhcpd.conf`),
			fs.copyAsync(`${path}/config/dhcpd/perflab.conf`, `${etcPath}/perflab.conf`)
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
		this.target('checkout', 'prepare', () => this.checkout(config.branch));

		// fetches the required BIND libraries - somewhat hacky
		this.target('getbind', 'checkout', () => this.spawn('/usr/bin/git',
			['clone', settings.agents.bind.repo.url, 'bind/bind9'],
			{cwd: buildPath}));

		// configures the required BIND libraries
		this.target('confbind', 'getbind', () => this.spawn('/bin/sh', ['./util/bind.sh', 'HEAD' ],
			{cwd: buildPath, quiet: true}));

		// does './configure [args...]'
		this.target('configure', 'confbind', () => this.configure([
			'--prefix', runPath,
			'--localstatedir', statePath,
			config.args.configure]
		));

		// does 'make [args...]'
		this.target('build', 'configure', () => this.make(config.args.make));

		// does 'make install'
		this.target('install', 'build', () => this.make('install'));

		// does 'make install'
		this.target('setcap', 'install', () => this.spawn('/usr/bin/sudo', [
			'/usr/sbin/setcap', 'cap_net_raw,cap_net_bind_service=+ep', cmd
		], {cwd: runPath, quiet: true}));

		// gets compilation information
		let getVersion = async () => {
			let res = await this.spawn(cmd, '--version', {cwd: runPath, quiet: true});
			return res.stdout;
		};

		// combines revision and info
		let getInfo = async () => {
			let commitlog = await this.commitlog();
			let version = await getVersion();
			return commitlog + '\n' + version;
		};

		// starts the server under test
		let start = () => this.daemon(cmd, [
			agent.args, '-f', '-cf', 'etc/dhcpd.conf', config.args.server
		], {cwd: runPath, wrapper}, /^Sending on /m);

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
			return Object.assign(res, { commit: info });
		};
	}
}

DHCPDAgent.configuration = {
	name: 'ISC DHCPd',
	protocol: 'DHCP4'
};

module.exports = DHCPDAgent;
