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
		kea4: 	'git://git.kea.isc.org/kea'
	},
	hosts: {
		kea4: {
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
