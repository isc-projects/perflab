# ISC Perflab Data Storage and API

## Data Model

The ISC Perflab uses MongoDB to store all information about the
configured tests and the results thereof.

A "configuration" describes a server under test.  Each configuration
is run in turn, and within each "run" the test client is invoked a
number of times, with the results of each invocation called a "test"

```
+- Config 1
|  +- Run 1
|  |  +- Test 1
|  |  |   ...
|  .  .
|  .  +  Test Z
|  .
.  +- Run Y
.     + ...
.
+- Config X
   + ...
      + ...
```

### Config Objects

Config objects as stored individual documents in the `config`
collection.

#### Key Properties

|Property| Type| Description |
|--|--|--|
|`_id`| `ObjectId` | The Config object's unique identifier |
|`created`|`Date`| When this object was created |
|`updated`|`Date`| When this object was last modified |
|`name`|`String`| The user-specified name of this configuration |
|`notes`|`String`| Free-form notes field |
|`type`|`String`| The identifying name of the server type under test (e.g. `bind`)  |
|`branch`|`String`| The branch or tag name to test |
|`client`|`String`| The identifying name of the client test traffic generator to use (e.g. `dnsperf`) |
|`queue`|`Object`| A nested object containing the queue settings for this configuration |
|`archived`|`Bool`| Whether this is an inactive configuration |
|`testsPerRun`|`Integer`| How many times to invoke the test client per test cycle |

#### Build and Run Properties

These properties affect the build phases for the server and the
run-time, and also permit script hooks to be inserted between phases.
See `doc/scripts.md` for more information on script hooks.

|Property| Type| Description |
|--|--|--|
|`args`|`Object`| A nested object containing arrays of additional command line parameters for each phase |
|`flags`|`Object`| An object containing flags exposed to agents; currently the only flag `checkout` forces execution of all stages including full cleanup & rebuild before each run |
|`preConfigure`|`String`| The path to a script to call before running `./configure` |
|`preBuild`|`String`| The path to a script to call before running `make` |
|`preRun`|`String`| The path to a script to call before each Run of Tests |
|`postRun`| `String` | The path to a script to call after each Run of Tests |
|`preTest`|`String`| The path to a script to call before each Test |
|`postTest`|`String`| The path to a script to call after each Test |
|`wrapper`|`Object`| An array of strings to prepend to the daemon command line |

NB: not all test agents support `preConfigure` and `preBuild`.

#### Queue Object

These properties are  inside the `queue` object mentioned above and
not at the top level.

|Property| Type| Description |
|--|--|--|
|`running`|`Bool`| Whether the Config is running right now |
|`enabled`|`Bool`| Whether the Config is queued to run at all |
|`priority`|`Integer`| High priority jobs run first |
|`repeat`|`Bool`| Whether the Config should automatically be re-queued on completion |
|`started`|`Date`| The last time (if ever) that a Run for this Config was started |
|`completed`|`Date`| The last time (if ever) that a Run for this Config was completed |
|`state`|`String`| An indication of the progress of the current (or last) Run |

#### DNS Specific Properties

|Property| Type| Description |
|--|--|--|
|`mode`|`String`| `authoritiative` or `recursive` |
|`queryset`|`String`| The name of the client traffic sample data set |
|`zoneset`|`String`| The name of the authoritative zone data set |
|`global`|`String`| For BIND, settings to put at the top level of `named.conf` |
|`options`|`String`| For BIND, settings to put within the `options { ... }` stanza of `named.conf`

### Run Objects

Run objects are stored as individual documents in the `run` collection.
They are automatically created by the system as each Config is
executed.

|Property| Type| Description |
|--|--|--|
|`_id`| `ObjectId` | The Run object's unique identifier |
|`config_id`|`ObjectId` | The ID of the Config object that this run is associated with |
|`created`|`Date`| When this Run was created |
|`updated`|`Date`| When this Run was last modified |
|`completed`|`Date`| When this Run completed execution |
|`commit`|`String`| The last VCS commit message for the server |
|`version`|`String`| The version string reported by the server |
|`stdout`|`String`| The accumulated `stdout` of all build and execution phases |
|`stderr`|`String`| The accumulated `stderr` of all build and execution phases |
|`status`|`Integer`| The exit (status) code returned by the server |
|`stats`|`Object`| The `min`, `max`, `count`, `stddev` and `average` test results |

### Test Objects

Test objects are stored as individual documents in the `test`
collection.  They are automatically created by the system as each
Run is executed.

|Property| Type| Description |
|--|--|--|
|`_id`| `ObjectId` | The Test object's unique identifier |
|`run_id`| `ObjectId` | The ID of the Run object that this test is associated with  |
|`config_id`|`ObjectId` | The ID of the Config object that this test is associated with |
|`created`|`Date`| When this Run was created |
|`updated`|`Date`| When this Run was last modified |
|`completed`|`Date`| When this Run completed execution |
|`stdout`|`String`| The accumulated `stdout` of the client test application |
|`stderr`|`String`| The accumulated `stderr` of the client test application |
|`status`|`Integer`| The exit (status) code returned by the client test application |
|`count`|`Integer`| The resulting performance metric obtained from the client test application |

### Agent Objects

Agent objects describe the server and test client applications and
are built from information built into the agents' source code and
are not stored in MongoDB.  They are exposed via the REST API so that
the user interface fields can be modified according to the individual
application's requirements.

|Property| Type| Description |
|--|--|--|
|`name`|`String`| The server (or client) name |
|`protocol`|`String`| The protocol supported (`dns`, `dhcp4`, `dhcp6`) |
|`string`|`Object`| an object of key value pairs used for UI field labels |
|`subtypes`|`String`| for DNS, an array of the supported server modes (`authoritative`, `recursive`) |
|`canPreConfigure`|`Bool`| whether this server agent supports pre-configure scripts |
|`canPreBuild`|`Bool`| whether this server agent supports pre-build scripts |

## REST API

In general, `GET` calls will return the requested item directly.
Other HTTP methods will return the result of the Mongo database
operation unless documented otherwise.   Results are in JSON format
unless specified otherwise.

All `PUT` and `POST` operations require that the content is sent in
the HTTP body of the request.

### Configuration Listings

For retrieving abbreviated tables of Configs, where only `name`,
`type`, `queue` and `archived`is returned.  This API is used by the
UI to generate the top level page without the overhead of retrieving
the entire configuration table settings.

#### `GET /api/config_list/`

> Get an array of all active configurations in abbreviated form.
Optionally takes a query parameter of `?archived=true`  to also
include archived configurations.

#### `GET /api/config_list/:id`

> Get a single abbreviated Config object.

### Config Objects

####  `GET /api/config/:id`

> Get an entire Config object.

#### `POST /api/config/`

> Save a new Config object.  The returned result will be a Config
object including its newly allocated ID.

#### `PUT /api/config/:id`

> Update a Config object.  NB: This does not change the queue settings
for the Config - any `queue` property supplied will be ignored.

#### `DELETE /api/config/:id`

> Deletes a Config object.  Requires that the query parameter `really`
be `true` to actually take effect.

#### `GET /api/config/:id/queue/enabled`

> Gets the queue status - returns `{enabled: true}` or `{enabled:
false}`.

#### `PUT /api/config/:id/queue/enabled`

> Change the queue status - requires a body of `{enabled: true}` or
`{enabled: false}`.

#### `GET /api/config/:id/queue/repeat`

> Gets the Config's queue auto-repeat status - returns `{repeat:
true}` or `{repeat: false}`.

#### `PUT /api/config/:id/queue/repeat`

> Change the Config's queue auto-repeat status - requires a body of
`{repeat: true}` or `{repeat: false}`.

#### `GET /api/config/:id/queue/priority`

> Gets the Config's queue priority value - returns `{priority:
<Integer>}`

#### `PUT /api/config/:id/queue/priority`

> Change the Config's queue priority - requires a body of
`{priority: <Integer>}`

#### `GET /api/config/run/:id/`

> Get a list of all of the Run objects (in abbreviated form) for the
specified Config.  Run objects are always returned in reverse order
(i.e. most recent first).  A portion of the result set can be extracted
by passing query parameters `skip` and `limit`.

#### `GET /api/config/run/:id/stats`

> Get the complete list of Run statistics for the specified Config
in CSV format.

### Run Objects

#### `GET /api/run/:id`

> Get an entire Run object.

#### `GET /api/run/test/:id/`

> Get a list of all of the Test objects (in abbreviated form) for
the specified Run.  Test objects are always returned in order
of creation (i.e. most recent last).

#### `GET /api/run/memory/:id/`

> Get memory usage statistics for the specified Run.

### Test Objects

#### `GET /api/test/:id`

> Get an entire Test object.

### Agent Objects

#### `GET /api/agent/server/`

> Get all Server Agent description objects.

#### `GET /api/agent/client/`

> Get all Client Agent description objects.

#### `GET /api/agent/server/:name`

> Get a single Server Agent description object.

#### `GET /api/agent/client/:name`

> Get a single Client Agent description object.

### Log Records

> The `log` collection is a limited size table (32kB) which keeps
a rolling log of the `stdout` and `stderr` lines from executing
processes.   The REST API retrieves the entire table - clients should
only load this once and then use the WebSocket interface to retrieve
incremental changes to it.

#### `GET /api/log/`

> Get the entire current log output.

### System Control

> The `control` collection contains a single document, which contains
a single key that tells the test system and UI clients whether the
global `paused` button is pressed or not.

#### `GET /api/control/`

> Retrieve the global Control object.

#### `GET /api/control/paused`

> Gets the global "paused" status - returns `{paused: true}` or
`{paused: false}`.

#### `PUT /api/control/paused`

> Change the global "paused" status - requires a body of `{paused:
true}` or `{paused: false}`.

### Settings Object

#### `GET /api/settings/`

> Gets the entire site-local Settings object as retrieved from
`settings.js`.  Used by the UI to display e.g. GIT URLs.
