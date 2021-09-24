'use strict';

module.exports = {
	servers: {
		bind:		require('./bind'),
		nsd:		require('./nsd'),
		knot:		require('./knot'),
		echo:		require('./echo'),
		kea4:		require('./kea4'),
		kea6:		require('./kea6'),
		dhcpd:		require('./dhcpd')
	},
	clients: {
		dnsperf:	require('./dnsperf'),
		dnsgen:		require('./dnsgen'),
		perfdhcp4:	require('./perfdhcp4'),
		perfdhcp6:	require('./perfdhcp6'),
		starttime:	require('./starttime'),
	}
};
