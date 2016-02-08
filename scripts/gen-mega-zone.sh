#!/bin/sh

cat <<-__EOT__;
\$TTL 3600
@	IN SOA ns1.example. dns.example. 2016010101 86400 3600 86400 86400
	IN NS ns1.example.
__EOT__

for i in `seq -w 0 999999`; do
  echo -e "$i	IN NS ns1.dom.example."
done
