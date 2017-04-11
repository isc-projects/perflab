'use strict';

module.exports = {
	path:		'/home/ray/data',
	hosts: {
		dns: {
			server: '127.0.0.1',
			tester:	'localhost'
		}
	},
	testsPerRun: 10,
	queueFilter: {},

	agents: {
		bind: {
			repo: { vcs: 'git', url: 'https://source.isc.org/git/bind9.git' }
		},
		nsd: {
			repo: { vcs: 'svn', url: 'http://www.nlnetlabs.nl/svn/nsd/tags/' }
		},
		knot: {
			repo: { vcs: 'git', url: 'git://git.nic.cz/knot-dns.git' }
		},
		echo: {
			repo: { vcs: 'git', url: 'https://github.com/isc-projects/dns-echo-user.git' }
		},
		dnsperf: {
		},
		dhcpd: {
			repo: { url: 'https://source.isc.org/git/dhcp.git' }
		},
		kea4: {
			repo: { url: 'https://github.com/isc-projects/kea.git' }
		}
	},

	querysets: {
		authoritative: [
			{	file: 'test_a', name: 'Test Authoritative' }
		],
		recursive: [
			{	file: 'test_b', name: 'Test Recursive' }
		]
	}
};
