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
	},
	echo: {
		server: require('./echo'),
		client: require('./dnsperf')
	},
	kea4: {
		server: require('./kea4'),
		client: require('./perfdhcp')
	},
	dhcpd: {
		server: require('./dhcpd'),
		client: require('./perfdhcp')
	}
};
