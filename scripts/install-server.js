#!/usr/bin/env node

'use strict';

const settings = require('../etc/settings'),
	child = require('child_process'),
	fs = require('fs');

let configPath = `${settings.path}/config`;
let zonePath = `${settings.path}/zones`;
let querySet = `${settings.path}/queryset`

function fmtConfBind(num) {
	return `zone ${num}.example { type master; file "zones/small"; };\n`;
}
function fmtConfNSD(num) {
	return `zone:\n\tname: ${num}.example\n\tzonefile: zones/small\n\n`;
}
function fmtConfKnot(num) {
	return `zone:\n  - domain: ${num}.example\n    file: "zones/small"\n\n`;
}

let fmtHead = `$TTL 3600
@		IN SOA ns1 dns 2016010101 86400 3600 86400 86400
		IN NS ns1
ns1		IN A 127.0.0.1
		IN AAAA ::1
`;

function fmtRR(num) {
	return `dom${num}\tIN A 127.0.0.1\n\t\tIN AAAA ::1\n`;
}
function fmtNS(num) {
	return `dom${num}\tIN NS ns1\n`;
}

function nToIPv6(num) {
	// use ASCII codes of string representation instead of hex numbers
	// ASCII provides holes between owner names instead of one dense subtree
	let hex = Buffer.from(num.toString()).toString('hex');
	if (hex.length > 16) {
		throw new Error('number too large');
	} else if (hex.length < 16) {
		// pad to 64 bit host boundary
		hex = hex.padStart(16, '0')
	}
	let ptrowner = hex.split("").reverse().join('.');  // without trailing dot

	// Kea 2 uses 35-byte DHCID: this is not a valid DHCID RDATA, but the DNS server
	// does not care so we only need a correct-ish length
	let dhcid = `\\# 35 ${hex.padEnd(70, '0')}`

	let ipv6Host = hex.match(/.{4}/g).join(':');
	return [dhcid, ptrowner, ipv6Host]
}

function fmtAAAA(num) {
	let [dhcid, _, ipv6Host] = nToIPv6(num)
	return `dom${num}\tIN AAAA 2001:db8::${ipv6Host}\n\t\tIN DHCID ${dhcid}\n`;
}

function fmtPTRv6(num) {
	let [dhcid, ptrowner, _] = nToIPv6(num)
	return `${ptrowner}\tIN PTR dom${num}.example.\n\t\tIN DHCID ${dhcid}\n`;
}

// dnsperf -u input format, assume empty zones (prereqs should be met)
function fmtRFC4703sec531update(num) {
	let [dhcid, ptrowner, ipv6Host] = nToIPv6(num)
	return `example.
prohibit dom${num}
add dom${num} 3600 AAAA 2001:db8::${ipv6Host}
add dom${num} 3600 DHCID ${dhcid}
send
0.0.0.0.0.0.0.0.0.8.b.d.0.1.0.0.2.ip6.arpa.
delete ${ptrowner} PTR
delete ${ptrowner} DHCID
add ${ptrowner} 3600 PTR dom${num}.example.
add ${ptrowner} 3600 DHCID ${dhcid}
send
`
}

// dnsperf -u input format, assume zone filled with data from
// fmtRFC4703sec531update() and simulate IP renumbering
function fmtRFC4703sec532update(num) {
	let [oldDhcid, _oldPtrOwner, _oldIpv6Host] = nToIPv6(num)
	let [_newDhcid, newPtrOwner, newIpv6Host] = nToIPv6(num + 1)
	return `example.
prohibit dom${num}
add dom${num} 1800 AAAA 2001:db8:0002::${newIpv6Host}
add dom${num} 1800 DHCID ${oldDhcid}
send
example.
require dom${num} DHCID ${oldDhcid}
delete dom${num} AAAA
add dom${num} 1800 AAAA 2001:db8:0002::${newIpv6Host}
send
0.0.0.0.0.0.0.0.0.8.b.d.0.1.0.0.2.ip6.arpa.
delete ${newPtrOwner} PTR
delete ${newPtrOwner} DHCID
add ${newPtrOwner} 1800 PTR dom${num}.example.
add ${newPtrOwner} 1800 DHCID ${oldDhcid}
send
`
}

console.log('Copying standard zone files');
let res = child.spawnSync('/usr/bin/rsync', ['-av', 'zones', settings.path ]);
console.log(res.stdout.toString());

res = child.spawnSync('/usr/bin/rsync', ['-av', 'zones/small', `${zonePath}/forward` ]);
console.log(res.stdout.toString());
res = child.spawnSync('/usr/bin/rsync', ['-av', 'zones/small', `${zonePath}/reverse` ]);
console.log(res.stdout.toString());

console.log('Copying standard config files');
res = child.spawnSync('/usr/bin/rsync', ['-av', 'config', settings.path ]);
console.log(res.stdout.toString());

console.log('Generating zone config and data files');
fmtWrite(1e3, '', fmtConfBind, `${configPath}/bind/zones-kilo-small.conf`);
fmtWrite(1e3, '', fmtConfNSD,  `${configPath}/nsd/zones-kilo-small.conf`);
fmtWrite(1e3, '', fmtConfKnot,  `${configPath}/knot/zones-kilo-small.conf`);
fmtWrite(1e6, '', fmtConfBind, `${configPath}/bind/zones-mega-small.conf`);
fmtWrite(1e6, '', fmtConfNSD,  `${configPath}/nsd/zones-mega-small.conf`);
fmtWrite(1e6, '', fmtConfKnot,  `${configPath}/knot/zones-mega-small.conf`);

fmtWrite(1e3, fmtHead, fmtRR, `${zonePath}/kilo-records`);
fmtWrite(1e3, fmtHead, fmtNS, `${zonePath}/kilo-delegations`);
fmtWrite(1e6, fmtHead, fmtRR, `${zonePath}/mega-records`);
fmtWrite(1e6, fmtHead, fmtNS, `${zonePath}/mega-delegations`);

fmtWrite(1e6, fmtHead, fmtAAAA, `${zonePath}/mega-records-dhcid`);
fmtWrite(1e6, fmtHead, fmtPTRv6, `${zonePath}/reverse-ipv6-mega-records`);

fmtWrite(1e6, '', fmtRFC4703sec531update, `${querySet}/update-clean-start`);
fmtWrite(1e6, '', fmtRFC4703sec532update, `${querySet}/update-renumber`);

function fmtWrite(n, fmtHead, fmtRep, outFile) {
	let i = 0;
	let s = fs.createWriteStream(outFile);
	s.write(fmtHead);
	(function write() {
		var ok = true;
		do {
			var data = fmtRep(i++);
			ok = s.write(data);
		} while (i < n && ok);
		if (i < n) {
			s.once('drain', write);
		} else {
			s.end();
		}
	})();
}
