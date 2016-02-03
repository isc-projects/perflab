#!/bin/sh

range=1000000
top=$((range-1))
max=$((range*105/100))
count=1000000

for i in `seq -w 0 $top`; do
  echo dom$i.example A
  echo dom$i.example AAAA
  echo dom$i.example MX
done | shuf -n $count
