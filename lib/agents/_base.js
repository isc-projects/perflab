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
		} else if (t === 'string' || t === 'number') {
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
			let child = spawn(cmd, args, opts);
			!opts.quiet && this.emit('cmd', cmdline);

			return child;
		}

		//
		// spawn the given command with the given arguments and options,
		// but catches the output and emits those to anybody whose
		// listening (unless opts.quiet)
		//
		this.spawn = (cmd, args, opts) => {

			return new Promise((resolve, reject) => {

				let child = start(cmd, args, opts);

				let stdout = '', stderr = '';

				child.stdout.on('data', (data) => {
					if (stdout.length < 1048576) {
						stdout += data;
					}
					!opts.quiet && this.emit('stdout', data);
				});

				child.stderr.on('data', (data) => {
					if (stderr.length < 1048576) {
						stderr += data
					}
					!opts.quiet && this.emit('stderr', data);
				});

				child.on('close', (status) => {
					child = undefined;
					if (!status || (progname === 'perfdhcp' && status === 3)) {
						resolve({stdout, stderr, status: status || 0});
					} else {
						reject({stdout, stderr, status});
					}
				});
			});
		}

		//
		// as above, but automatically runs it via an SSH command
		//
		this.ssh = (host, cmd, args, opts) => {
			return this.spawn('/usr/bin/ssh', [host, cmd, args], opts);
		}

		//
		// used to invoke daemons that fork, so instead of waiting
		// for the program to exit, it waits for a certain line
		// matching the given regex to appear in the daemon's
		// stderr output
		//

		this.daemon = (cmd, args, opts, match) => {

			let child = null;

			let reaper = (code, signal) => {
				child = null;
				if (signal !== null) {
					this.emit('cmd', `${progname} terminated with signal ${signal}`);
				} else {
					this.emit('cmd', `${progname} terminated with status ${code}`);
				}
			}

			// only background daemons expose the `.stop` method
			this.stop = () => {
				if (child) {
					this.emit('cmd', `Stopping ${progname}`);
					return new Promise((resolve, reject) => {

						child.on('exit', resolve);

						// die
						child.kill();
						setTimeout(() => {
							// die harder
							if (child) {
								child.kill('SIGKILL')
							}
						}, 5000);
					});
				} else {
					return Promise.resolve();
				}
			}

			return new Promise((resolve, reject) => {

				let matched = false;
				child = start(cmd, args, opts);

				// read memory usage periodically (Linux specific)
				if (child.pid && os.platform() === 'linux') {
					let file = '/proc/' + child.pid + '/statm';
					let timer = setInterval(() => {
						fs.readFile(file, 'ASCII',
							(err, data) => {
								if (!err) {
									data = data.split(/ /).map(Number);
									this.emit('mem', data);
								}
							}
						);
					}, 5000);
					child.on('error', () => clearInterval(timer));
					child.on('exit', () => clearInterval(timer));
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
						resolve({stdout, stderr, status: 0});
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
						resolve({stdout, stderr, status: 0});
					}
				});

				child.on('close', (status) => {
					if (matched) {
						// do nothing - resolve already called
					} else {
						reject({stdout, stderr, status});
					}
				});

				child.on('exit', reaper);
			});
		}

		this.run = () => {
			throw new Error('Executor "run" method not overloaded');
		}
	}
};

class Builder extends Executor {

	constructor(progname, settings, path) {

		super(progname);

		let buildPath = path + '/build';
		let depPath = path + '/.dep';

		fs.ensureDirSync(buildPath, (err) => {
			throw err;
		});

		fs.ensureDirSync(depPath, (err) => {
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
				throw new Error(`target ${stage} is overwriting existing target`);
			}

			if (prev && !targets[prev]) {
				throw new Error(`target ${stage} dependency ${prev} doesn't exist`);
			}

			targets[stage] = (opts) => {

				let force = !!(opts && opts.force);

				let dep = `${depPath}/${stage}`;
				let checkDependencyMet = () => fs.existsSync(dep);
				let setDependencyMet = () => fs.outputFileAsync(dep, '');

				if (checkDependencyMet() && !force) {
					return Promise.resolve();
				} else {
					// "before" invokes any previous stage recursively
					let before = prev ? targets[prev].bind(this) : Promise.resolve;
					let task = action.bind(this);
					let after = setDependencyMet;
					return before().then(task).then(after);
				}
			}
		};

		this.clean = () => Promise.all([
			fs.emptyDirAsync(buildPath),
			fs.emptyDirAsync(depPath)
		]);

		this.checkout = (branch) => {
			let repo = settings.repo;
			if (!repo.vcs || repo.vcs === 'git') {
				return this.spawn('/usr/bin/git', ['clone', '--depth', 1, '-b', branch, repo.url, '.'], {cwd: buildPath});
			} else if (repo.vcs === 'svn') {
				this.spawn('/usr/bin/svn', ['co', `${repo.url}${branch}`, '.'], {cwd: buildPath})
			} else {
				throw new Error('unknown repo protocol');
			}
		};

		this.commitlog = () => {
			let repo = settings.repo;
			if (!repo.vcs || repo.vcs === 'git') {
				return this.spawn('/usr/bin/git', ['log', '-n', 1], {cwd: buildPath, quiet: true}).then(res => res.stdout);
			} else if (repo.vcs === 'svn') {
				return this.spawn('/usr/bin/svn', ['log', '-l', 1], {cwd: buildPath, quiet: true}).then(res => res.stdout)
			} else {
				throw new Error('unknown repo protocol');
			}
		};

		this.make = (args) =>
			this.spawn('/usr/bin/make', args, {cwd: buildPath});

		this.autoreconf = () =>
			this.spawn('/usr/bin/autoreconf', '-i', {cwd: buildPath});

		this.configure = (args) =>
			this.spawn('./configure', args, {cwd: buildPath});
	}
};

module.exports = { Executor, Builder };
