#!/usr/bin/env node

'use strict';

const settings = require('../settings'),
	child = require('child_process'),
	fs = require('fs'),
	util = require('util');

let configPath = `${settings.path}/config`;
let zonePath = `${settings.path}/zones`;

let fmtConfBind = 'zone %s.example { type master; file "zones/small"; };\n';
let fmtConfNSD = 'zone:\n\tname: %s.example\n\tzonefile: zones/small\n\n';
let fmtConfKnot = 'zone:\n  - domain: %s.example\n    file: "zones/small"\n\n';

let fmtHead = `$TTL 3600
@		IN SOA ns1 dns 2016010101 86400 3600 86400 86400
		IN NS ns1
ns1		IN A 127.0.0.1
		IN AAAA ::1
`;
let fmtRR = '%s\tIN A 127.0.0.1\n\t\tIN AAAA ::1\n';
let fmtNS = '%s\tIN NS ns1\n';

console.log('Copying standard zone files');
let res = child.spawnSync('/usr/bin/rsync', ['-av', 'zones', settings.path ]);
console.log(res.stdout.toString());

console.log('Copying standard config files');
let res = child.spawnSync('/usr/bin/rsync', ['-av', 'config', settings.path ]);
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

function fmtWrite(n, fmtHead, fmtRep, outFile) {
	let i = 0;
	let s = fs.createWriteStream(outFile);
	s.write(fmtHead);
	(function write() {
		var ok = true;
		do {
			var seq = ('000000' + (i++)).substr(-6);
			var dom = 'dom' + seq;
			var data = util.format(fmtRep, dom);
			ok = s.write(data);
		} while (i < n && ok);
		if (i < n) {
			s.once('drain', write);
		} else {
			s.end();
		}
	})();
}
