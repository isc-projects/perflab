'use strict';

module.exports = {
	path:		'/home/perflab/data',
	mongo: {
		url:	'mongodb://perf-ctl.lab.isc.org/perflab',
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
			repo: { url: 'ssh://isclab@repo.isc.org/proj/git/prod/bind9' },
			wrapper: ['/bin/numactl', '-C0-11']
		},
		nsd: {
			repo: { svn: 'http://www.nlnetlabs.nl/svn/nsd/tags/' }
		},
		knot: {
			repo: { url: 'git://git.nic.cz/knot-dns.git' }
		},
		echo: {
			repo: { url: 'https://github.com/isc-projects/dns-echo-user.git' }
		},
		dnsperf: {
			command: '/usr/local/nom/bin/dnsperf',
			wrapper: [ '/bin/numactl', '-C0-11' ],
			args: ['-c24', '-q82', '-T6', '-x2048' ]
		}
	},

	querysets: {
		recursive: [
			{ file: 'mega-small-recursive', name: '1M zones, 5% NXD, 5% DNAME, www prefixed' },
			{ file: 'mega-small-dname', name: '1M zones, 5% NXD, all DNAME, www prefixed' }
		]
	}
};
