#!/usr/bin/env node

'use strict';

let Executor = require('executor');

class DNSPerfAgent extends Executor {

	constructor(config, path) {
		super();

		let args = config.args = config.args || {};
		let queryset = config.queryset || 'default';

		this.run = () => {
			let args = ['-p', 8053, '-l', 30, '-d', `${path}/queryset/${queryset}`];
			args = args.concat(args.dnsperf || []);
			return this._ssh('localhost', '/usr/bin/dnsperf', args);
		}
	}
}

module.exports = DNSPerfAgent;
