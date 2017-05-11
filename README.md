ISC Performance Lab Architecture and Installation
=================================================

The ISC Performance Lab is written for NodeJS 4.2+ and MongoDB 2.6+.  To
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

Code Architecture
-----------------

### Server Side

The code is written using the latest ES2015 syntax where possible, to
run under NodeJS 4.2 or later.  As there is no true threading in
JavaScript most libraries make use of asynchronous methods throughout to
prevent execution from being blocked on things like database lookups and
network operations. The code makes extensive use of "Promises", a JS
pattern that allows an asynchronous method to return a "promise" to
provide a value later (akin to Java's "Futures"). Promises can be
"chained" using the `.then` method, and an error in a chain of promises
can be caught with the `.catch` method, e.g.:

    doSomething().then(doSomethingElse).then(mutateTheResult).catch(console.error);

The code also uses the new ES2015 "arrow function" where possible,
particularly when passing callback functions.

#### Common Code

* `lib/database.js` - shared code encapsulating all database accesses
* `settings.js` - system-wide configuration options (e.g. for MongoDB connection URLs, git repo location, etc).

#### Performance Testing Code

* `perflab-tester.js` - main tester process, handles all test running
* `lib/agents/index.js` - maps from applications to the necessary client and server test agents
* `lib/agents/_base.js` - utility classes for forking a UNIX command and capturing its output and exit status (Executor), and a subclass of that for handling compilation with make style dependencies (Builder)
* `lib/agents/bind.js` - instance of Builder that knows how to get BIND from git, configure it, make it, install it, and then finally execute it (see also lib/agents/knot.js and lib/agents/nsd.js)
* `lib/agents/dnsperf.js` - instance of Executor that knows how to run dnsperf and then extract the QPS result from the output

#### Web Server Code

* `perflab-httpd.js` - startup program, just reads settings and makes DB connection, then hands off to:
* `lib/httpd/index.js` - main implementation. It uses SenchaLab's
connect module to simplify dispatching of URLs to the appropriate
handlers. It also uses quip and bodyParser to simplify handling of JSON.
* `lib/httpd/api.js` - contains the mapping for the REST API to database
functions
* `lib/httpd/oplog.js` - handles reading the MongoDB oplog and sending the output over a WebSocket to the UI.

#### Utility Scripts

* `scripts/install-server.js` - creates the server config files and zone files (except for the root zone, which should be downloaded with an IXFR)
* `scripts/gen-dnsperf-kilo-query.sh` - generates dnsperf config data suitable for configs with 1000 RRs or delegations
* `scripts/gen-dnsperf-mega-query.sh` - generates dnsperf config data suitable for configs with 1M RRs or delegations

#### Web Client Side Code

The UI is written using the AngularJS MVC framework, with Twitter
Bootstrap as the layout system.  All client side content is served from
the `www/` folder, which serves as the "document root" for the server.

All content is loaded from a single page `index.htm` which contains an
`<ng-view>` directive that loads templates from the `partials/` folder
based on the current view, with the routing from URL to template
provided in `js/app.js` (also where the main Angular application is
created).

The individual templates refer to "controllers" that are contained in
`js/controllers.js`, and in many cases those controllers refer to shared
"services", "modules" and "resources" that are defined in
`js/services.js`, `js/modules.js` and `js/resources.js` respectively.

AngularJS best practise says that all state should be contained in a
service and this has already been done for those cases where a singleton
was necessary (e.g. for the WebSocket connection) to ensure that those
singleton objects persist correctly throughout the applications
lifetime.

Whenever a database update is received over the OpLog WebSocket the UI
is capable of triggering a refresh of the updated table and
automatically updating the screen to show those changes. This is
currently used mainly for the main configuration listing page, the
real-time log viewer, and to watch the state of the global "pause"
setting. This could be extended to provide real-time updates to graphs
and other results pages.

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
