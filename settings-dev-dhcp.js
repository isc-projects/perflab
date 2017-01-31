'use strict';

let schema = 'perflab';

module.exports = {
	path:		'/home/ray/data',
	mongo: {
		schema,
		url:	`mongodb://localhost/${schema}`,
		oplog:	'mongodb://localhost/local'
	},
	repo: {
		bind:	'ssh://repo.isc.org/proj/git/prod/bind9.git',
		dhcpd:	'ssh://repo.isc.org/proj/git/prod/dhcp.git',
		kea4: 	'https://github.com/isc-projects/kea.git'
	},
	hosts: {
		dhcp: {
			server: '127.0.0.1',
			tester:	'localhost'
		}
	},
	command: {},
	wrapper: {},
	args: {},
	testsPerRun: 10,
	queueFilter: {type: {$in: ['kea4', 'kea6', 'dhcpd']}}
};
