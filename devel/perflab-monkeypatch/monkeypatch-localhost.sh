#!/bin/bash
# hack development image to run commands locally (instead of using SSH)
# run by docker build

set -o xtrace -o nounset -o errexit -o pipefail

sed -i -e "s#return this.spawn('/usr/bin/ssh', \[host, cmd, args#return this.spawn(cmd, \[args#" /perflab/lib/agents/_base.js
