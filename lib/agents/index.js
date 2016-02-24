'use strict';

module.exports = {
	bind: {
		server: require('./bind'),
		client: require('./dnsperf')
	},
	nsd: {
		server: require('./nsd'),
		client: require('./dnsperf') 
	},
	knot: {
		server: require('./knot'),
		client: require('./dnsperf')
	}
};
