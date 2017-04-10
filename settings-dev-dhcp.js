'use strict';

module.exports = {
	path:		'/home/ray/data',
	mongo: {
		url:	'mongodb://localhost/perflab',
		oplog:	'mongodb://localhost/local'
	},
	hosts: {
		dhcp: {
			server: '127.0.0.1',
			tester:	'localhost'
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
			repo: { git: 'https://github.com/isc-projects/kea.git' }
		},
	}
};
