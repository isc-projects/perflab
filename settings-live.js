'use strict';

let schema = 'perflab';

module.exports = {
	path:		'/home/perflab/data',
	mongo: {
		schema,
		url:	`mongodb://perf-ctl.lab.isc.org/${schema}`,
		oplog:	'mongodb://perf-ctl.lab.isc.org/local'
	},
	repo: {
		bind:	'ssh://isclab@repo.isc.org/proj/git/prod/bind9',
		nsd:    'http://www.nlnetlabs.nl/svn/nsd/tags/',
		knot:   'git://git.nic.cz/knot-dns.git',
		echo:	'ssh://isclab@repo.isc.org/proj/git/exp/dns-echo-user.git'
	},
	hosts: {
		dns: {
			server: '172.16.2.242',
			tester:	'perf-dns-c.lab.isc.org'
		}
	},
	command: {
		dnsperf: '/usr/local/nom/bin/dnsperf',
		bind: './sbin/named',
		knot: './sbin/knotd',
		nsd: './sbin/nsd'
	},
	args: {
		dnsperf: ['-c24', '-q82', '-T6' ]
	},
	wrapper: {
		dnsperf: ['/bin/numactl', '-C0-11'],
		bind: ['/bin/numactl', '-C0-11']
	}
};
