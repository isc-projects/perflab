'use strict';

let Agents = require('./_base');

module.exports = class PerfDHCPAgent extends Agents.Executor {

	constructor(settings, config) {

		super('perfdhcp');

		let path = settings.path;
		let cmd = settings.command.perfdhcp || '/usr/local/sbin/perfdhcp';
        let wrapper = settings.wrapper.perfdhcp;

		let server = settings.hosts.dhcp.server;
		let tester = settings.hosts.dhcp.tester;

		config.args = config.args || {};

		// look for the QPS value in the output and return it
		let getCount = (results) => {
			if (results.status === 0 && results.stdout) {
				let match = results.stdout.match(/^Rate:\s+(.*) 4/m);
				if (match) {
					results.count = +match[1];
				}
			}
			return results;
		}

		// start 'perfdhcp' passing it the given query set and additional args
		this.run = () => {
			let args = [].concat(settings.args.perfdhcp || []);
			args = args.concat([
				'-s', 0, '-p', 30, '-t', 1
			]);
			args = args.concat(config.args.tester || []);
			args = args.concat(server);
			return this.ssh(tester, cmd, args, { wrapper }).then(getCount);
		}
	}
};
