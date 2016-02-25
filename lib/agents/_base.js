'use strict';

let spawn = require('child_process').spawn,
	Promise = require('bluebird'),
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
		// spawn the given command with the given arguments and options,
		// but catches the output and emits those to anybody whose
		// listening (unless opts.quiet)
		//
		this.spawn = (cmd, args, opts) => {

			args = flatten(args);
			let cmdline = cmd + ' ' + args.join(' ');
			console.log(cmdline);

			opts = opts || {};
			return new Promise((resolve, reject) => {

				let child = spawn(cmd, args, opts);

				!opts.quiet && this.emit('cmd', cmdline);

				let stdout = '', stderr = '';

				child.stdout.on('data', (data) => {
					stdout += data;
					!opts.quiet && this.emit('stdout', data);
				});

				child.stderr.on('data', (data) => {
					stderr += data
					!opts.quiet && this.emit('stderr', data);
				});

				child.on('exit', (status) => {
					child = undefined;
					if (status) {
						reject({stdout, stderr, status});
					} else {
						resolve({stdout, stderr, status: 0});
					}
				});
			});
		}

		//
		// as above, but automatically runs it via an SSH command
		//
		this.ssh = (host, cmd, args) => {
			return this.spawn('/usr/bin/ssh', [host, cmd, args]);
		}

		//
		// used to invoke daemons that fork, so instead of waiting
		// for the program to exit, it waits for a certain line
		// matching the given regex to appear in the daemon's
		// stderr output
		//
		let child = null;

		this.daemon = (cmd, args, opts, match) => {
			if (child) {
				throw new Error("child still running");
			}
			args = flatten(args);
			let cmdline = cmd + ' ' + args.join(' ');
			console.log(cmdline);

			return new Promise((resolve, reject) => {

				let matched = false;
				child = spawn(cmd, args, opts);

				this.emit('cmd', cmdline);

				// read memory usage periodically (Linux specific)
				if (child.pid) {
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
					}, 1000);
					child.on('error', () => clearInterval(timer));
					child.on('exit', () => clearInterval(timer));
				}

				let stdout = '', stderr = '';

				child.stdout.on('data', (data) => {
					stdout += data;
					this.emit('stdout', data);
					if (!matched && stdout.match(match)) {
						matched = true;
						resolve({stdout, stderr, status: 0});
					}
				});

				child.stderr.on('data', (data) => {
					stderr += data;
					this.emit('stderr', data);
					if (!matched && stderr.match(match)) {
						matched = true;
						resolve({stdout, stderr, status: 0});
					}
				});

				child.on('exit', (status) => {
					child = undefined;
					if (matched) {
						// do nothing
					} else {
						reject({stdout, stderr, status});
					}
				});
			});
		}

		// uses Node's process manager to kill the child process
		this.stop = () => {
			this.emit('cmd', `Stopping ${progname}`);
			if (child) {
				child.kill();
			}
		}

		this.run = () => {
			throw new Error('Executor "run" method not overloaded');
		}
	}
};

class Builder extends Executor {

	constructor(progname, path) {

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

		this.checkout = {
			git: (repo, branch) =>
				this.spawn('/usr/bin/git', ['clone', '--depth', 1, '-b', branch, repo, '.'], {cwd: buildPath}),
			svn: (repo, branch) =>
				this.spawn('/usr/bin/svn', ['co', `${repo}${branch}`, '.'], {cwd: buildPath})
		};

		this.commitlog = {
			git: () =>
				this.spawn('/usr/bin/git', ['log', '-n', 1], {cwd: buildPath, quiet: true}),
			svn: () =>
				this.spawn('/usr/bin/svn', ['log', '-l', 1], {cwd: buildPath, quiet: true})
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
