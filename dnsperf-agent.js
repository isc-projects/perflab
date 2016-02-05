#!/usr/bin/env node

'use strict';

let settings = require('./settings'),
	Executor = require('./executor');

class DNSPerfAgent extends Executor {

	constructor(config) {
		super('dnsperf');

		let path = settings.path;
		let cmd = settings.command.dnsperf || '/usr/bin/dnsperf';
		let server = settings.hosts.dns.server;
		let tester = settings.hosts.dns.tester;

		config.args = config.args || {};
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

		// start 'dnsperf' passing it the given query set and additional args
		this.run = () => {
			let args = [].concat(settings.args.dnsperf || []);
			args = args.concat(['-s', server, '-p', 8053, '-l', 30, '-d', `${path}/queryset/${queryset}`]);
			args = args.concat(config.args.dnsperf || []);
			return this._ssh(tester, cmd, args).then(getCount);
		}
	}
}

module.exports = DNSPerfAgent;
