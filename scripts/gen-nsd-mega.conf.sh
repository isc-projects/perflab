#!/bin/sh

for i in `seq -w 0 999999`; do
  cat <<__EOT__
zone:
	name: dom$i.example
	zonefile: zones/small

__EOT__
done
