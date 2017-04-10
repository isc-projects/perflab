'use strict';

module.exports = {
	path:		'/home/perflab/data',
	mongo: {
		url:	'mongodb://perf-ctl.lab.isc.org/perflab',
		oplog:	'mongodb://perf-ctl.lab.isc.org/local'
	},
	hosts: {
		dhcp: {
			server: '10.255.255.244',
			tester:	'172.16.1.245'
		}
	},

	testsPerRun: 10,
	queueFilter: {type: {$in: ['kea4', 'kea6', 'dhcpd']}},

	agents: {
		bind: {
			repo: { git: 'ssh://repo.isc.org/proj/git/prod/bind9.git' }
		},
		dhcpd: {
			repo: { git: 'ssh://repo.isc.org/proj/git/prod/dhcp.git' }
		},
		kea4: {
			repo: { git: 'https://github.com/isc-projects/kea.git' },
			wrapper: [ '/bin/numactl', '-C0' ]
		},
		perfdhcp: {
			wrapper: [ '/bin/numactl', '-C0' ]
		}
	}
};
