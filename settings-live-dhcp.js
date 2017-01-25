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
		kea4: 	'git://git.kea.isc.org/kea'
	},
	hosts: {
		kea4: {
			server: '10.255.255.244',
			tester:	'172.16.1.245'
		}
	},
	command: {},
	wrapper: {},
	args: {},
	testsPerRun: 10,
	queueFilter: {type: {$in: ['kea4', 'kea6', 'dhcpd']}}
};
