'use strict';

let schema = 'perflab';

module.exports = {
	path:		'/home/perflab/data',
	mongo: {
		schema,
		url:	`mongodb://perf-ctl.lab.isc.org/${schema}`,
		oplog:	'mongodb://perf-ctl.lab.isc.org/local'
	},
	hosts: {
		dns: {
			server: '172.16.2.242',
			tester:	'perf-dns-c.lab.isc.org'
		}
	},
	queueFilter: {type: {$in: ['bind', 'echo', 'knot', 'nsd']}},

	agents: {
		bind: {
			repo: { git: 'ssh://isclab@repo.isc.org/proj/git/prod/bind9' },
			wrapper: ['/bin/numactl', '-C0-11']
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
			command: '/usr/local/nom/bin/dnsperf',
			wrapper: [ '/bin/numactl', '-C0-11' ],
			args: ['-c24', '-q82', '-T6', '-x2048' ]
		}
	}
};
