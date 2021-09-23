#!/bin/bash
# preconfigure development Docker image
# run by docker build
set -o xtrace -o nounset -o errexit -o pipefail

cp -v etc/mongo.js-sample /perflab/etc/mongo.js
sed -i -e 's/localhost/mongo/g' /perflab/etc/mongo.js

cp -v etc/settings.js-sample /perflab/etc/settings.js
sed -i -e 's#/path/to/data#/perflab/data#' /perflab/etc/settings.js
sed -i -e "s/'<d[^>]*-host>'/'127.0.0.1'/" /perflab/etc/settings.js

cp -rv config /perflab/data/

mkdir /perflab/data/queryset/
echo '. NS' > /perflab/data/queryset/default
