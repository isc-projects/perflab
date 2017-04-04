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
		bind: 	'https://source.isc.org/git/bind9.git',
		nsd:	'http://www.nlnetlabs.nl/svn/nsd/tags/',
		knot:	'git://git.nic.cz/knot-dns.git',
		echo:	'https://github.com/isc-projects/dns-echo-user.git'
	},
	hosts: {
		dns: {
			server: '127.0.0.1',
			tester:	'localhost'
		}
	},
	command: {},
	wrapper: {},
	args: {},
	testsPerRun: 10,
	queueFilter: {}
};
