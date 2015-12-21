#!/usr/bin/env node

'use strict';

let Executor = require('./executor');

class DNSPerfAgent extends Executor {

	constructor(config, path) {
		super("dnsperf");

		let args = config.args = config.args || {};
		let queryset = config.queryset || 'default';

		// look for the QPS value in the output and return it
		var getCount = (results) => {
			if (results.status === 0 && results.stdout) {
				var match = results.stdout.match(/Queries per second:\s+(.*)$/m);
				if (match) {
					results.count = +match[1];
				}
			}
			return results;
		}

		// start 'dnsperf' passing it the given query set
		// NB: remote test machine currently hard-coded, needs paramterising
		this.run = () => {
			let args = ['-p', 8053, '-l', 30, '-d', `${path}/queryset/${queryset}`];
			args = args.concat(args.dnsperf || []);
			return this._ssh('localhost', '/usr/bin/dnsperf', args).then(getCount);
		}
	}
}

module.exports = DNSPerfAgent;
