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

More more information see the contents of the doc/ folder.
