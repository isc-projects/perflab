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
// NB: this code, like much of the rest of this system, uses
//     "Promises" to encapsulate asynchronous results
//
class KnotAgent extends Agents.Builder {

	constructor(settings, config) {

		let path = settings.path;
		let agent = settings.agents.knot;
		let testPath = path + '/tests/' + config._id;
		let buildPath = testPath + '/build';
		let runPath = testPath + '/run';
		let etcPath = runPath + '/etc';
		let zonePath = runPath + '/var/lib/knot/zones';

		super('Knot2', agent, testPath);

		let cmd = agent.command || './sbin/knotd';
		let wrapper = (config.wrapper && config.wrapper.length) ? config.wrapper : agent.wrapper;

		config.args = config.args || {};
		config.mode = config.mode || 'auth';

		let rebuild = !!(config.flags && config.flags.checkout);

		let noop = () => undefined;
		let createEtc = () => fs.mkdirsAsync(etcPath);
		let createRun = () => fs.mkdirsAsync(runPath);
		let linkZones = () => fs.symlinkAsync('../../../../../../zones', zonePath).then(noop, noop);

		let emptyRunPath = () => fs.emptyDirAsync(runPath);
		let createConfig = () => fs.copyAsync(`${path}/config/knot/knot.conf`, `${etcPath}/knot/knot.conf`);
		let createOptions = () => fs.writeFileAsync(`${etcPath}/knot/options.conf`, config.options || '');
		let createGlobal = () => fs.writeFileAsync(`${etcPath}/knot/global.conf`, config.global || '');
		let createZoneConf = () => fs.copyAsync(`${path}/config/knot/zones-${config.zoneset}.conf`, `${etcPath}/knot/zones.conf`);

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

		// builds the configuration files for this run
		let genConfig = () =>
				createConfig()
				.then(createOptions)
				.then(createGlobal)
				.then(createZoneConf)
				.then(linkZones);

		// gets compilation information
		let getVersion = () => this.spawn(cmd, '-V', {cwd: runPath, quiet: true})
				.then(res => res.stdout);

		// combines revision and info
		let getInfo = () => Promise.join(this.commitlog(), getVersion(),
			(commitlog, version) => commitlog + '\n' + version
		);

		// starts the server under test
		let start = () => this.daemon(cmd, [
			agent.args, '-v', config.args.server
		], {cwd: runPath, wrapper}, / server started /m);

		// main executor function - optionally does a 'prepare' forcing
		// the entire build sequence to start afresh, then gets the latest
		// commit message and runs thes server, adding the commit message
		// to the resulting output
		this.run = (opts) =>
			this.targets.prepare({force: rebuild})
				.then(this.targets.install)
				.then(genConfig)
				.then(getInfo)
				.then((info) => start().then(
					(res) => Object.assign(res, { commit: info })));
	}
};

KnotAgent.configuration = {
	name: 'Knot',
	protocol: 'dns',
	subtypes: [ 'authoritative' ],
	string: {
		global: 'knot.conf global configuration blocks'
	}
};

module.exports = KnotAgent;
