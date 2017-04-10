'use strict';

let schema = 'perflab';

module.exports = {
	path:		'/home/ray/data',
	mongo: {
		schema,
		url:	`mongodb://localhost/${schema}`,
		oplog:	'mongodb://localhost/local'
	},
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
			repo: { git: 'https://source.isc.org/git/bind9.git' }
		},
		nsd: {
			repo: { svn: 'http://www.nlnetlabs.nl/svn/nsd/tags/' }
		},
		knot: {
			repo: { git: 'git://git.nic.cz/knot-dns.git' }
		},
		echo: {
			repo: { git: 'https://github.com/isc-projects/dns-echo-user.git' }
		},
		dnsperf: {
		}
	}
};
