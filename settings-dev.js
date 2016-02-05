'use strict';

let schema = 'perflab';

module.exports = {
	path:		'/home/ray/bind-perflab',
	mongo: {
		schema,
		url:	`mongodb://localhost/${schema}`,
		oplog:	'mongodb://localhost/local'
	},
	repo: {
		bind9: 	'https://source.isc.org/git/bind9.git'
	},
	hosts: {
		dns: {
			server: 'localhost',
			tester:	'localhost'
		}
	},
	args: {
		dnsperf: []
	}
};
