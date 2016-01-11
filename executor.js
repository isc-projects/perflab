#!/usr/bin/env node

'use strict';

let spawn = require('child_process').spawn,
	Promise = require('bluebird'),
	fs = Promise.promisifyAll(require('fs-extra')),
	EventEmitter = require('events');

class Executor extends EventEmitter {

	constructor(progname) {
		super();

		let depPath = '.';
		let child;

		// sets where to store dependency-met flag files
		this._depPath = (path) => {
			let old = depPath;
			depPath = path;
			return old;
		};

		//
		// adds a method with the name in 'stage' to the current object,
		// which optionally depends on the stage named 'prev' having
		// already been completed.
		//
		// by building a chain of such targets and invoking the last in
		// the chain, the chain is recursively traversed, starting with
		// the earliest "non-met" dependency
		//
		this._target = (stage, prev, action) => {
			this[stage] = (opts) => {

				let force = !!(opts && opts.force);

				let dep = `${depPath}/.dep/${stage}`;
				let checkDependencyMet = () => fs.existsSync(dep);
				let setDependencyMet = () => fs.outputFileAsync(dep, '');

				if (checkDependencyMet() && !force) {
					return Promise.resolve();
				} else {
					// "before" invokes any previous stage recursively
					let before = prev ? this[prev].bind(this) : Promise.resolve;
					let task = action.bind(this);
					let after = setDependencyMet;
					return before().then(task).then(after);
				}
			}
		}

		//
		// spawn the given command with the given arguments and options,
		// but catches the output and emits those to anybody whose
		// listening (unless opts.quiet)
		//
		this._run = (cmd, args, opts) => {
			if (child) {
				throw new Error("child still running");
			}
			console.log(cmd + ' ' + args.join(' '));
			opts = opts || {};
			return new Promise((resolve, reject) => {
				let stdout = '', stderr = '';
				child = spawn(cmd, args, opts);
				!opts.quiet && this.emit('cmd', cmd + ' ' + args.join(' '));
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
		this._ssh = (host, cmd, args) => {
			let _args = [host, cmd].concat(args);
			return this._run('/usr/bin/ssh', _args);
		}

		//
		// used to invoke daemons that fork, so instead of waiting
		// for the program to exit, it waits for a certain line
		// matching the given regex to appear in the daemon's
		// stderr output
		//
		this._runWatch = (cmd, args, opts, match) => {
			if (child) {
				throw new Error("child still running");
			}
			console.log(cmd + ' ' + args.join(' '));
			return new Promise((resolve, reject) => {
				let matched = false;
				let stdout = '', stderr = '';
				child = spawn(cmd, args, opts);
				this.emit('cmd', cmd + ' ' + args.join(' '));
				child.stdout.on('data', (data) => {
					stdout += data;
					this.emit('stdout', data);
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
}

module.exports = Executor;
