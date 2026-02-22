'use strict';

let spawn = require('child_process').spawn,
	Promise = require('bluebird'),
	os = require('os'),
	fs = Promise.promisifyAll(require('fs-extra')),
	EventEmitter = require('events');

function flatten() {
	let out = [];
	(function f(args) {
		let t = typeof args;
		if (t === 'object' && args.length) {
			[].forEach.call(args, f);
		} else if (t === 'string') {
			out.push(unescape(args));
		} else if (t === 'number') {
			out.push(args);
		}
	})(arguments);
	return out;
}

class Executor extends EventEmitter {

	constructor(progname) {

		super();

		//
		// helper function to factor out common
		// code from 'spawn' and daemon
		//
		let start = (cmd, args, opts) => {
			args = flatten(args);
			if (opts.wrapper && opts.wrapper.length) {
				args.unshift(cmd);
				let wrapper = flatten(opts.wrapper);
				cmd = wrapper.shift();
				args = wrapper.concat(args);
			}

			let cmdline = cmd + ' ' + args.join(' ');

			opts = opts || {};

			let started_at = new Date();
			let child = spawn(cmd, args, opts);
			!opts.quiet && this.emit('cmd', cmdline);
			child.started_at = started_at;
			return child;
		};

		//
		// spawn the given command with the given arguments and options,
		// but catches the output and emits those to anybody whose
		// listening (unless opts.quiet)
		//
		this.spawn = (cmd, args, opts) => {

			var child;

			try {
				child = start(cmd, args, opts);
			} catch (e) {
				return Promise.reject({stdout: e.errno, stderr: e.message, status: 255});
			}

			return new Promise((resolve, reject) => {

				let stdout = '', stderr = '';

				child.stdout.on('data', (data) => {
					if (stdout.length < 1048576) {
						stdout += data;
					}
					!opts.quiet && this.emit('stdout', data);
				});

				child.stderr.on('data', (data) => {
					if (stderr.length < 1048576) {
						stderr += data;
					}
					!opts.quiet && this.emit('stderr', data);
				});

				child.on('close', (status) => {
					if (!status || (progname.match(/^perfdhcp/) && status === 3)) {
						resolve({stdout, stderr, status: status || 0, started: child.started_at});
					} else {
						reject({stdout, stderr, status,	started: child.started_at});
					}
					child = undefined;
				});
			});
		};

		//
		// as above, but automatically runs it via an SSH command
		//
		this.ssh = (host, cmd, args, opts) => {
			let remoteCmd = `${cmd} ${args.join(' ')}`;
			if (opts && opts.env) {
				let envVars = Object.entries(opts.env).map(([k,v]) => `${k}=${v}`).join(' ');
				remoteCmd = `env ${envVars} ${remoteCmd}`;
			}
			return this.spawn('/usr/bin/ssh', [host, remoteCmd], opts);
		};

		//
		// helpers to extract output
		//
		this.stdout = (res) => res.stdout;
		this.stderr = (res) => res.stderr;

		//
		// used to invoke daemons that fork, so instead of waiting
		// for the program to exit, it waits for a certain line
		// matching the given regex to appear in the daemon's
		// stderr output
		//

		this.daemon = (cmd, args, opts, match) => {

			let child = null;

			let mem_timer;
			let emit_mem = () => {
				if (!child || !child.pid) {
					return;
				};
				let file = '/proc/' + child.pid + '/statm';
				try {
					let data = fs.readFileSync(file, 'ASCII');
					data = data.split(/ /).map(Number);
					this.emit('mem', data);
				} catch (err) {
					// daemon died in meanwhile? ignore
				}
			};
			let reaper = (code, signal) => {
				if (signal !== null) {
					this.emit('cmd', `${progname} terminated with signal ${signal}`);
				} else {
					this.emit('cmd', `${progname} terminated with status ${code}`);
				}
				this.emit('exit', code, signal);
			};

			// only background daemons expose the `.stop` method
			this.stop = () => {
				if (child && !child.exitCode && !child.signalCode) {
					this.emit('cmd', `Stopping ${progname}`);
					clearInterval(mem_timer);
					emit_mem();  // synchronously record memory consumption before signal
					return new Promise((resolve) => {

						child.on('exit', resolve);

						// die - use SIGINT instead of SIGTERM because perf needs SIGINT to properly finalize data files
						child.kill('SIGINT');
						setTimeout(() => {
							// die harder
							if (child) {
								child.kill('SIGKILL');
							}
						}, 30000);
					});
				} else {
					return Promise.resolve();
				}
			};

			return new Promise((resolve, reject) => {

				let matched = false;
				child = start(cmd, args, opts);

				// read memory usage periodically (Linux specific)
				if (child.pid && os.platform() === 'linux') {
					mem_timer = setInterval(emit_mem, 5000);
					child.on('error', () => clearInterval(mem_timer));
					child.on('exit', () => clearInterval(mem_timer));
				}

				let stdout = '1:', stderr = '2:';

				child.stdout.on('data', (data) => {
					if (stdout.length < 1048576) {
						stdout += data;
					}
					this.emit('stdout', data);
					let tmp = '' + data;
					if (!matched && tmp.match(match)) {
						matched = true;
						resolve({stdout, stderr, status: 0, started: child.started_at, logMatched: new Date()});
					}
				});

				child.stderr.on('data', (data) => {
					if (stderr.length < 1048576) {
						stderr += data;
					}
					this.emit('stderr', data);
					let tmp = '' + data;
					if (!matched && tmp.match(match)) {
						matched = true;
						resolve({stdout, stderr, status: 0, started: child.started_at, logMatched: new Date()});
					}
				});

				child.on('close', (status) => {
					if (matched) {
						// do nothing - resolve already called
					} else {
						reject({stdout, stderr, status,	started: child.started_at});
					}
				});

				child.on('exit', reaper);
			});
		};

		this.run = () => {
			throw Error('Executor "run" method not overloaded');
		};
	}
}

class Builder extends Executor {

	constructor(progname, path, settings = {}) {

		super(progname);

		this.settings = settings;

		this.path = {
			dep: path + '/.dep',
			build: path + '/build',
			run: path + '/run',
			etc: path + '/run/etc',
		};

		fs.ensureDirSync(this.path.build, (err) => {
			throw err;
		});

		fs.ensureDirSync(this.path.dep, (err) => {
			throw err;
		});

		//
		// adds a method with the name in 'stage' to the current object,
		// which optionally depends on the stage named 'prev' having
		// already been completed.
		//
		// by building a chain of such targets and invoking the last in
		// the chain, the chain is recursively traversed, starting with
		// the earliest "non-met" dependency
		//
		let targets = this.targets = {};

		this.target = (stage, prev, action) => {

			if (targets[stage]) {
				throw Error(`target ${stage} is overwriting existing target`);
			}

			if (prev && !targets[prev]) {
				throw Error(`target ${stage} dependency ${prev} doesn't exist`);
			}

			targets[stage] = async (opts) => {

				let force = !!(opts && opts.force);

				let dep = `${this.path.dep}/${stage}`;
				let checkDependencyMet = () => fs.existsSync(dep);
				let setDependencyMet = () => fs.outputFileAsync(dep, '');

				if (checkDependencyMet() && !force) {
					return;
				} else {
					if (prev) { // call any previous stage recursively
						await targets[prev].call(this);
					}
					await action.call(this);
					await setDependencyMet();
				}
			};
		};

		this.clean = () => Promise.all([
			fs.emptyDirAsync(this.path.dep),
			fs.emptyDirAsync(this.path.build)
		]);

		this.build_phase = (cmd, args, opts = {}) => {
			opts.cwd = opts.cwd || this.path.build;

			if (cmd && cmd.length) {
				return this.spawn(cmd, args, opts);
			} else {
				return Promise.resolve();
			}
		};

		this.run_phase = (cmd, args, opts = {}) => {
			opts.cwd = opts.cwd || this.path.run;
			return this.spawn(cmd, args, opts);
		};

		this.checkout = async (repo, branch) => {
			if (!repo.vcs || repo.vcs === 'git') {
				return this.build_phase('/usr/bin/git', ['clone', '--depth', 1, '-b', branch, repo.url, '.']);
			} else if (repo.vcs === 'svn') {
				return this.build_phase('/usr/bin/svn', ['co', `${repo.url}${branch}`, '.']);
			} else {
				throw Error('unknown repo protocol');
			}
		};

		this.get_commit_log = async (repo) => {
			if (!repo.vcs || repo.vcs === 'git') {
				return this.build_phase('/usr/bin/git', ['log', '-n', 1], {quiet: true}).then(this.stdout);
			} else if (repo.vcs === 'svn') {
				return this.build_phase('/usr/bin/svn', ['log', '-l', 1], {quiet: true}).then(this.stdout);
			} else {
				throw Error('unknown repo protocol');
			}
		};

		this.autoreconf = () => this.build_phase('/usr/bin/autoreconf', '-fi');

		this.configure = (args) => this.build_phase('./configure', args);

		this.make = (args) => this.build_phase('/usr/bin/make', args);

		const mesonBinary = this.settings.mesonBinary || '/usr/bin/meson';

		this.meson_setup = (builddir, installdir, args) => this.build_phase(mesonBinary, ['setup', '--buildtype=release', `--prefix=${installdir}`, ...args, builddir]);

		this.meson_compile = (builddir, args) => this.build_phase(mesonBinary, ['compile', ...args, '-C', builddir]);

		this.meson_install = (builddir) => this.build_phase(mesonBinary, ['install', '-C', builddir])
	}
}

module.exports = { Executor, Builder };
