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
class Kea6Agent extends Agents.Builder {

	constructor(settings, config) {

		let path = settings.path;
		let agent = settings.agents.kea6;
		let testPath = path + '/tests/' + config._id;
		let buildPath = testPath + '/build';
		let runPath = testPath + '/run';
		let etcPath = runPath + '/etc';

		super('Kea6', agent, testPath);

		let cmd = agent.command || './sbin/kea-dhcp6';
		let wrapper = (config.wrapper && config.wrapper.length) ? config.wrapper : agent.wrapper;

		config.args = config.args || {};
		config.mode = config.mode || 'auth';

		let rebuild = !!(config.flags && config.flags.checkout);

		let noop = () => undefined;
		let createEtc = () => fs.mkdirsAsync(etcPath);
		let createRun = () => fs.mkdirsAsync(runPath);

		let emptyRunPath = () => fs.emptyDirAsync(runPath);
		let createConfig = () => fs.copyAsync(`${path}/config/kea6/kea.conf`, `${etcPath}/kea.conf`);

		// empties the work directory, then creates the necessary
		// subdirectories for this configuration
		this.target('prepare', '', () =>
			this.clean()
			.then(emptyRunPath)
			.then(createEtc)
			.then(createRun));

		// does 'git clone'
		this.target('checkout', 'prepare', () => this.checkout(config.branch));

		// does 'autoreconf'
		this.target('autoreconf', 'checkout', () => this.autoreconf());

		// does './configure [args...]'
		this.target('configure', 'autoreconf', () =>
			this.configure(['--prefix', runPath, config.args.configure]));

		// does 'make [args...]'
		this.target('build', 'configure', () => this.make(config.args.make));

		// does 'make install'
		this.target('install', 'build', () => this.make('install'));

		// allows access to raw and privileged sockets
		this.target('setcap', 'install', () => this.spawn('/usr/bin/sudo', [
				'/usr/sbin/setcap', 'cap_net_raw,cap_net_bind_service=+ep', cmd
			], {cwd: runPath, quiet: true}));

		// builds the configuration files for this run
		let genConfig = () => createConfig();

		// gets compilation information
		let getVersion = () => this.spawn(cmd, '-V', {cwd: runPath, quiet: true})
				.then(res => res.stdout);

		// combines revision and info
		let getInfo = () => Promise.join(this.commitlog(), getVersion(),
			(commitlog, version) => commitlog + '\n' + version
		);

		// starts the server under test
		let start = () => this.daemon(cmd, [
			agent.args, '-c', 'etc/kea.conf', config.args.server
		], {cwd: runPath, wrapper}, / DHCP6_STARTED /m);

		// main executor function - optionally does a 'prepare' forcing
		// the entire build sequence to start afresh, then gets the latest
		// commit message and runs thes server, adding the commit message
		// to the resulting output
		this.run = (opts) =>
			this.targets.prepare({force: rebuild})
				.then(this.targets.install)
				.then(this.targets.setcap)
				.then(genConfig)
				.then(getInfo)
				.then((info) => start().then(
					(res) => Object.assign(res, { commit: info })));
	}
};

Kea6Agent.configuration = {
	name: 'Kea IPv6',
	type: 'DHCP6'
};

module.exports = Kea6Agent;
