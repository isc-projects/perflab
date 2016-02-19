'use strict';

module.exports = {
	agents:	{
		bind9: {
			server: require('./bind-agent'),
			client: require('./dnsperf-agent')
		},
		nsd: {
			server: require('./nsd-agent'),
			client: require('./dnsperf-agent') 
		}
	},
};
