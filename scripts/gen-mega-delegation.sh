#!/bin/sh

cat <<-__EOT__;
\$TTL 3600
@	IN SOA ns1.example. dns.example. 2016010101 86400 3600 86400 86400
	IN NS ns1.example.
ns1	IN A 127.0.0.1
	IN AAAA ::
__EOT__

for i in `seq -w 0 999999`; do
  echo -e "dom$i	IN NS ns1.example."
done
