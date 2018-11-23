'use strict';

let Agents = require('./_base');

class DNSGenAgent extends Agents.Executor {

	constructor(settings, config) {

		super('dnsgen');

		let agent = settings.agents.dnsgen || {};
		let cmd = agent.command || '/usr/local/bin/dnsgen';
		let wrapper = agent.wrapper;

		let server = settings.hosts.dns.server;
		let server_mac = settings.hosts.dns.server_mac;
		let tester = settings.hosts.dns.tester;
		let tester_if = settings.hosts.dns.tester_ifname;
		let tester_ip = settings.hosts.dns.tester_ipaddr;

		config.args = config.args || {};
		let queryset = config.queryset || 'default';

		// look for the QPS value in the output and return it
		let getCount = (results) => {
			if (results.status === 0 && results.stdout) {
				let match = results.stdout.match(/Peak RX rate = (.*)$/m);
				if (match) {
					results.count = +match[1];
				}
			}
			return results;
		};

		// start 'dnsgen' remotely, passing it the given query set and additional args
		this.run = async () => {
			let args = [].concat(agent.args || []);
			args = args.concat([
				'-i', tester_if, '-a', tester_ip,
				'-s', server, '-p', 8053, '-m', server_mac, '-S', 1,
				'-l', 30, '-D', `${settings.path}/queryset/raw/${queryset}.raw`
			]);
			args = args.concat(config.args.tester || []);
			let res = await this.ssh(tester, cmd, args, { wrapper });
			return getCount(res);
		};
	}
}

DNSGenAgent.configuration = {
	name: 'dnsgen',
	protocol: 'dns'
};

module.exports = DNSGenAgent;
