ISC Performance Requirements and Installation
=============================================

The ISC Performance Lab is written for NodeJS 8+ and MongoDB 2.6+.  To
allow for separation of the actual testing and the web UI the system is
split into two processes, `perflab-tester` and `perflab-httpd`.  The
former runs on the same server as the server under test, whilst the
latter should be run on a separate system.

`perflab-tester` takes care of reading configurations and queue settings
from the database, starting tests, and recording the test results in the
database.  `perflab-httpd` serves HTTP static content and provides a
RESTful interface to the database, and also provides a WebSocket
interface over which UI clients learn about configuration and queue
status changes in real-time and automatically update the UI in response
to those changes.

NB: this is _unsupported_ software from an internal research project,
released for the benefit of the DNS community.   The project is
maintained by Ray Bellis.   Please use the Github issue tracker for
comments, suggestions.  Pull requests are welcome, but response times
are not guaranteed.

Installation
------------

The git repo is at `https://github.com/isc-projects/perflab.git`

Sample configuration files are in `./etc/mongo.js-sample` and
`./etc/settings.js-sample`.  These will need to be copied
(without the `-sample` suffix) and modified to suit your
local configuration.

`named.conf` templates and include files are found in the
`config/bind/` sub-directory.

All server-side third party dependencies can be obtained by running
`npm install` which reads the `package.json` file and downloads the
required packages. The only third party library that is not installed
this way is `quip` since there's a bug in the distributed version, so
a fixed copy is in our git repo.

### MongoDB Setup

It's recommended that MongoDB should be installed on a separate system
and then accessed over a TCP connection.

The only specific Mongo table configuration required is to create the
`log` table as a 'capped' table with an appropriate size (e.g. 32kB).
This turns the table into a circular buffer where older entries are
automatically removed if the table exceeds the given size, e.g.:

    > use perflab
    switched to db perflab
    > db.createCollection('log', {capped: true, size: 32768})

To handle the real-time updating of the UI the system makes use of
MongoDB's "oplog tailing" functionality. This requires MongoDB to be
started with the `replSet = <name>` setting specified in the
`mongod.conf` file.  Once MongoDB is started with those settings,
connect to Mongo and initialiase the replication set - in this case "rs"
is the "name" parameter:

    > use local
    switched to db local
    > rs.initiate()

### Query Sets and Config files

Run `node ./scripts/install_server.js` on the server node to create
the zone files and related query sets and install them into the
application's data folder.   The query sets will need to be manually
copied onto the client machine.

See below for more information on these files.

Operation
---------

There aren't any start up scripts (yet) - for now startup is done just
by starting `./perflab-httpd.js` and `./perflab-tester.js` in the
background with stdout and stderr redirected to a file.

The dnsperf tests are started by `perflab-tester.js` by making an SSH
connection to a client machine, so password-less SSH from the BIND
server to the test client need to be configured outside of this system.

Similarly `perflab-tester.js` needs to be able to access the servers'
source repositories without interactive authorisation.

NB: dnsperf is not included - install it from source or via your O/S
package manager.

#### Miscellaneous operational details

##### Zones and Query Sets

For authoritative testing there are (currently) seven different zone
configurations:

* the root zone
* a single zone with 1M A/AAAA records
* a single zone with 1M delegations
* a single zone with 1k A/AAAA records
* a single zone with 1k delegations
* a set of 1M small zones (each with a trivial SOA / NS / A / AAAA record set)
* a set of 1k small zones

All of the zone names (except the root zone test) are in the form
`dom%06d.example.`

There are (currently) three dnsperf query files suitable for testing
against those zones:

* Nominum default - a mix of real DNS queries, suitable for testing the
root zone (get this from your dnsperf distribution)
* 1M small zones, 5% NXD - suitable for any of the 1M
record/delegation/zones configurations
* 1k small zones, 5% NXD - suitable for any of the 1k
record/delegation/zones configurations

For recursive testing, the back end authoritative server is configured
with both the zone containing 1M delegations and the 1M individual small
zones  - the 1M zone query file should be used.
