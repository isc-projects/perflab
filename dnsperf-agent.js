#!/usr/bin/env node

'use strict';

var Executor = require('executor');

class DNSPerfAgent extends Executor {

	constructor(config, path) {
		super();

		var args = config.args = config.args || {};
		var queryset = config.queryset || 'default';

		this.run = () => {
			var args = ['-p', 8053, '-l', 30, '-d', `${path}/queryset/${queryset}`];
			args = args.concat(args.dnsperf || []);
			return this._ssh('localhost', '/usr/bin/dnsperf', args);
		}
	}
}

module.exports = DNSPerfAgent;
