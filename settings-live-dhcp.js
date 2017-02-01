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
		dhcpd:	'ssh://isclab@repo.isc.org/proj/git/prod/dhcp.git',
		bind:	'ssh://isclab@repo.isc.org/proj/git/prod/bind9.git',
		kea4: 	'git://git.kea.isc.org/kea'
	},
	hosts: {
		dhcp: {
			server: '10.255.255.244',
			tester:	'172.16.1.245'
		}
	},
	command: {},
	wrapper: {
		perfdhcp: ['/bin/numactl', '-C0'],
		kea4: ['/bin/numactl', '-C0']
	},
	args: {},
	testsPerRun: 10,
	queueFilter: {type: {$in: ['kea4', 'kea6', 'dhcpd']}}
};
