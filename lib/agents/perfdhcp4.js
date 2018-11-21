'use strict';

let Agents = require('./_base');

class PerfDHCP4Agent extends Agents.Executor {

	constructor(settings, config) {

		super('perfdhcp4');

		let agent = settings.agents.perfdhcp4;
		let cmd = agent.command || '/usr/local/sbin/perfdhcp';
		let wrapper = agent.wrapper;

		let server = settings.hosts.dhcp.server;
		let tester = settings.hosts.dhcp.tester;

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
		}

		// start 'perfdhcp' passing it the given query set and additional args
		this.run = () => {
			let args = [].concat(agent.args || []);
			args = args.concat([
				'-s', 0, '-p', 30, '-t', 1
			]);
			args = args.concat(config.args.tester || []);
			args = args.concat(server);
			return this.ssh(tester, cmd, args, { wrapper }).then(getCount);
		}
	}
};

PerfDHCP4Agent.configuration = {
	name: 'perfdhcp4',
	protocol: 'dhcp4'
};

module.exports = PerfDHCP4Agent;
