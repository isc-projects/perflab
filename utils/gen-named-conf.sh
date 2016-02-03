#!/bin/sh

for i in `seq -w 0 999999`; do
  echo -e "zone dom$i.example { type master; file \"zones/smallzone\"; };"
done
