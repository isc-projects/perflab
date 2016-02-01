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
		bind9:	'ssh://repo.isc.org/proj/git/prod/bind9'
	},
	hosts: {
		tester:	'perf-dns-c.lab.isc.org'
	}
};
