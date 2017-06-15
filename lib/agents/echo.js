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
// NB: this code, like much of the rest of this system, uses
//     "Promises" to encapsulate asynchronous results
//
class EchoAgent extends Agents.Builder {

	constructor(settings, config) {

		let path = settings.path;
		let agent = settings.agents.echo;
		let testPath = path + '/tests/' + config._id;
		let buildPath = testPath + '/build';
		let runPath = testPath + '/run';

		super('Echo', agent, testPath);

		let cmd = agent.command || './bin/dns-echo';
		let wrapper = (config.wrapper && config.wrapper.length) ? config.wrapper : agent.wrapper;

		config.args = config.args || {};
		config.mode = config.mode || 'auth';

		let rebuild = !!(config.flags && config.flags.checkout);

		let emptyRunPath = () => fs.emptyDirAsync(runPath);

		// empties the work directory, then creates the necessary
		// subdirectories for this configuration
		this.target('prepare', '', () =>
			this.clean()
			.then(emptyRunPath));

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
			'/usr/sbin/setcap', 'cap_net_raw=+ep', cmd
        ], {cwd: runPath, quiet: true}));

		// starts the server under test
		let start = () => this.daemon(cmd, [
			agent.args, '-p', 8053, config.args.server
		], {cwd: runPath, wrapper}, /starting with /m);

		// main executor function - optionally does a 'prepare' forcing
		// the entire build sequence to start afresh, then gets the latest
		// commit message and runs thes server, adding the commit message
		// to the resulting output
		this.run = (opts) =>
			this.targets.prepare({force: rebuild})
				.then(this.targets.install)
				.then(this.targets.setcap)
				.then(this.commitlog)
				.then((info) => start().then(
					(res) => Object.assign(res, { commit: info })));
	}
};

EchoAgent.configuration = {
	name: 'Echo',
	type: 'DNS',
	client: require('./dnsperf')
};

module.exports = EchoAgent;
