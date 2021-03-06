'use strict';

let Agents = require('./_base');

class PerfDHCP6Agent extends Agents.Executor {

	constructor(settings, config) {

		super('perfdhcp6');

		let agent = settings.agents.perfdhcp6;
		let cmd = agent.command || '/usr/local/sbin/perfdhcp';
		let wrapper = agent.wrapper;

		let server = settings.hosts.dhcp6.server;
		let tester = settings.hosts.dhcp6.tester;

		config.args = config.args || {};

		// look for the QPS value in the output and return it
		let getCount = (results) => {
			if ((results.status === 0 || results.status === 3) && results.stdout) {
				let match = results.stdout.match(/^Rate:\s+(.*?) 4-way/m);
				if (match) {
					results.count = +match[1];
				}
			}
			return results;
		};

		// start 'perfdhcp' passing it the given query set and additional args
		this.run = async () => {
			let args = [].concat(agent.args || []);
			args = args.concat([
				'-6',
				'-s', 0, '-p', 30, '-t', 1
			]);
			args = args.concat(config.args.tester || []);
			args = args.concat(server);
			let res = await this.ssh(tester, cmd, args, { wrapper });
			return getCount(res);
		};
	}
}

PerfDHCP6Agent.configuration = {
	name: 'perfdhcp6',
	protocol: 'dhcp6'
};

module.exports = PerfDHCP6Agent;
