#!/bin/sh
# Flip the fake provider's published spec: sh scripts/flip.sh v2
curl -s -X POST localhost:8800/admin/version -H 'content-type: application/json' -d "{\"version\":\"${1:-v2}\"}"
echo
