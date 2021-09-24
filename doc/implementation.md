Code Architecture
-----------------

### Server Side

The code is written using the latest ES2017 syntax where possible,
to run under NodeJS 7.6 or later.  As there is no true threading in
JavaScript most libraries make use of asynchronous methods throughout
to prevent execution from being blocked on things like database
lookups and network operations.

The code makes extensive use of "Promises" and ES2017's `async`/`await`
feature.   The latter allows asychronous code that would otherwise
require extensive use of callback functions to be written in a much
more linear style.

The code also uses the ES2015 "arrow function" where possible,
particularly when passing callback functions.

#### Common Code

* `lib/database.js` - shared code encapsulating all database accesses
* `etc/settings.js` - system-wide configuration options (e.g., git repo location, etc).
* `etc/mongo.js` - settings for MongoDB connection URLs

#### Performance Testing Code

* `perflab-tester.js` - main tester process, handles all test running
* `lib/queue.js` - watches the queue, takings jobs and passing them to:
* `lib/tester.js` - code to run a single test
* `lib/agents/index.js` - maps from applications to the necessary client and server test agents
* `lib/agents/_base.js` - utility classes for forking a UNIX command and capturing its output and exit status (Executor), and a subclass of that for handling compilation with make style dependencies (Builder)
* `lib/agents/bind.js` - instance of Builder that knows how to get BIND from git, configure it, make it, install it, and then finally execute it (see also lib/agents/knot.js and lib/agents/nsd.js)
* `lib/agents/dnsperf.js` - instance of Executor that knows how to run dnsperf and then extract the QPS result from the output
* `lib/agents/starttime.js` - instance of Executor that knows how to read Builder instance metadata and then extracts daemon startup time

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
singleton objects persist correctly throughout the application's
lifetime.

Whenever a database update is received over the OpLog WebSocket the UI
is capable of triggering a refresh of the updated table and
automatically updating the screen to show those changes. This is
currently used mainly for the main configuration listing page, the
real-time log viewer, and to watch the state of the global "pause"
setting. This could be extended to provide real-time updates to graphs
and other results pages.
