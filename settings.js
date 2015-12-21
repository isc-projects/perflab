module.exports = {
	path:		'/home/ray/bind-perflab',
	mongo: {
		url:	'mongodb://localhost/perflab',
		oplog:	'mongodb://localhost/local'
	},
	repo: {
		bind9: 	'https://source.isc.org/git/bind9.git'
		// bind9:	'ssh://repo.isc.org/proj/git/prod/bind9'
	},
	hosts: {
		tester:	'localhost'
	}
};
