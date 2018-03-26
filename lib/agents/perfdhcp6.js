'use strict';

let Agents = require('./_base');

class PerfDHCP6Agent extends Agents.Executor {

	constructor(settings, config) {

		super('perfdhcp');

		let agent = settings.agents.perfdhcp;
		let cmd = agent.command || '/usr/local/sbin/perfdhcp';
		let wrapper = agent.wrapper;

		let server = settings.hosts.dhcp6.server;
		let tester = settings.hosts.dhcp6.tester;

		config.args = config.args || {};

		// look for the QPS value in the output and return it
		let getCount = (results) => {
			if ((results.status === 0 || results.status === 3) && results.stdout) {
				let match = results.stdout.match(/^Rate:\s+(.*) 6/m);
				if (match) {
					results.count = +match[1];
				}
			}
			return results;
		}

		// start 'perfdhcp' passing it the given query set and additional args
		this.run = () => {
			let args = [].concat(agent.args || []);
			args = args.concat([
				'-6', '-s', 0, '-p', 30, '-t', 1
			]);
			args = args.concat(config.args.tester || []);
			args = args.concat(server);
			return this.ssh(tester, cmd, args, { wrapper }).then(getCount);
		}
	}
};

PerfDHCPAgent.configuration = {
	name: 'perfdhcp6',
	type: 'DHCP'
};

module.exports = PerfDHCP6Agent;
