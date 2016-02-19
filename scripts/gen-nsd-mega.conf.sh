#!/bin/sh

for i in `seq -w 0 999999`; do
  echo -e "zone:\n\tname: dom$i.example\n\tzonefile: zones/small\n"
done
