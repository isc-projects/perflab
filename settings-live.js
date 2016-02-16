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
		bind9:	'ssh://isclab@repo.isc.org/proj/git/prod/bind9'
	},
	hosts: {
		dns: {
			server: '172.16.2.242',
			tester:	'perf-dns-c.lab.isc.org'
		}
	},
	command: {
		bind: '/bin/numactl',
		dnsperf: '/bin/numactl'
	},
	args: {
		bind: ['-C0-11', './sbin/named', '-n12'],
		dnsperf: ['-C12-23', '/usr/local/nom/bin/dnsperf', '-c24', '-q82', '-T6' ]
	}
};
