'use strict';

let Agents = require('./_base'),
	Promise = require('bluebird'),
	fs = Promise.promisifyAll(require('fs-extra')),
	path = require('path');

// somewhat complicated class that's capable of running the following
// sequence, with dependency checking and user-specified settings
//
// -  git clone
// -  meson setup
// -  meson compile
// -  meson install
// -  named
//

async function symlinkDirContent(srcdir, destdir) {
	const files = await fs.readdirAsync(srcdir)
	for (const file of files) {
		let target = `${srcdir}/${file}`
		let newPath = `${destdir}/${file}`
		let relLink = path.relative(destdir, target)
		await fs.ensureSymlinkAsync(relLink, newPath)
	}
}

class BindMesonAgent extends Agents.Builder {

	constructor(settings, config, path) {

		super('BIND (meson)', path);

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
		// symlink zones so zone write-back does not mangle the original files
		let emptyZones = () => fs.emptyDirAsync(this.path.zone);
		let linkZones = () => symlinkDirContent(`${settings.path}/zones`, this.path.zone);

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
			await emptyZones();
			await linkZones();
		});

		// does 'git clone'
		this.target('checkout', 'prepare', () => this.checkout(agent.repo, config.branch));
		
		// does 'meson setup'
		this.target('meson_setup', 'checkout', () => this.meson_setup('./builddir', this.path.run, config.args.configure));

		// does 'meson compile'
		this.target('meson_compile', 'meson_setup', () => this.meson_compile('./builddir', config.args.make));

		this.target('meson_install', 'meson_compile', () => this.meson_install('./builddir'));

		// builds the configuration files for this run
		let genConfig = async () => {
			await createConfig();
			await createOptions();
			await createGlobal();
			await createZoneConf();
		};

		// create environment with LD_LIBRARY_PATH
		let createEnv = () => Object.assign({}, process.env, {
			LD_LIBRARY_PATH: `${this.path.run}/lib64:${this.path.run}/lib:${this.path.run}/lib/x86_64-linux-gnu`
		});

		// gets compilation information
		let getVersion = async (env) => this.run_phase(cmd, '-V', {quiet: true, env}).then(this.stdout);

		// combines revision and info
		let getInfo = async (env) => {
			let log = await this.get_commit_log(agent.repo);
			let version = await getVersion(env);

			let res = {
				commit: log + '\n' + version
			};

			var match = version.match(/^BIND (.*?) </m);
			if (match && match.length > 1) {
				res.version = match[1];
			}

			return res;
		};

		// test environment variables
		let testEnv = (env) => this.spawn('/bin/bash', ['-c', 'echo "LD_LIBRARY_PATH=$LD_LIBRARY_PATH"'], {
			cwd: this.path.run,
			env
		});

		// starts daemon
		let start = (env) => this.daemon(cmd, [
			agent.args, '-f', '-p', 8053, config.args.server
		], {
			cwd: this.path.run, 
			wrapper,
			env
		}, / running$/m);

		// main executor function - optionally does a 'prepare' forcing
		// the entire build sequence to start afresh, then gets the latest
		// commit message and runs BIND, adding the commit message to the
		// BIND result output
		this.run = async () => {
			await this.targets.prepare({force: rebuild});
			await this.targets.meson_install();
			await genConfig();

			// await (ms => new Promise(resolve => setTimeout(resolve, ms)))(5000 * 1000); // 5000 seconds

			let env = createEnv();
			await testEnv(env);
			let info = await getInfo(env);
			let res = await start(env);
			return Object.assign(res, info);
		};
	}
}

BindMesonAgent.configuration = {
	name: 'BIND (meson)',
	protocol: 'dns',
	subtypes: [ 'authoritative', 'recursive' ],
	string: {
		options: 'named.conf options {} statements',
		global: 'named.conf global configuration blocks'
	},
};

module.exports = BindMesonAgent;
