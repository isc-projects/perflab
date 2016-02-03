#!/bin/sh

range=1000
top=$((range-1))
max=$((range*105/100))
count=1000000

for c in `seq 0 1000`; do
  for i in `seq -w 0 $max`; do
    echo dom000$i.example A
    echo dom000$i.example AAAA
    echo dom000$i.example MX
  done
done | shuf -n $count
