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
// -  start daemon
//

class EchoAgent extends Agents.Builder {

	constructor(settings, config, path) {

		super('Echo', path);

		let agent = settings.agents.echo || {};
		let cmd = agent.command || './bin/dns-echo';
		let wrapper = (config.wrapper && config.wrapper.length) ? config.wrapper : agent.wrapper;

		config.args = config.args || {};
		config.mode = config.mode || 'auth';

		let rebuild = !!(config.flags && config.flags.checkout);

		let emptyRunPath = () => fs.emptyDirAsync(this.path.run);

		// empties the work directory, then creates the necessary
		// subdirectories for this configuration
		this.target('prepare', '', async () => {
			await this.clean();
			await emptyRunPath();
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

		// allows access to raw and privileged sockets
		this.target('setcap', 'install', () => this.run_phase('/usr/bin/sudo', [
			'/usr/sbin/setcap', 'cap_net_raw=+ep', cmd
		], {quiet: true}));

		// starts the server under test
		let start = () => this.daemon(cmd, [
			agent.args, '-p', 8053, config.args.server
		], {cwd: this.path.run, wrapper}, /starting with /m);

		// main executor function - optionally does a 'prepare' forcing
		// the entire build sequence to start afresh, then gets the latest
		// commit message and runs thes server, adding the commit message
		// to the resulting output
		this.run = async () => {
			await this.targets.prepare({force: rebuild});
			await this.targets.install();
			await this.targets.setcap();
			let commit = await this.get_commit_log();
			let res = await start();
			return Object.assign(res, { commit });
		};
	}
}

EchoAgent.configuration = {
	name: 'Echo',
	protocol: 'dns',
};

module.exports = EchoAgent;
