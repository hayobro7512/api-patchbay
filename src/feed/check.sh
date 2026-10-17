#!/bin/sh
set -e
D=$(cd "$(dirname "$0")" && pwd); T=$(mktemp -d); P=$((20000 + $$ % 20000))
echo '{"provider":"x"}' > "$T/acme-pay.json"
FEED_DIR=$T PORT=$P node "$D/server.mjs" >/dev/null & S=$!; trap 'kill $S' EXIT; sleep 1
U=http://localhost:$P
[ "$(curl -s -o /dev/null -w %{http_code} $U/feed/acme-pay.json)" = 200 ] || { echo FAIL 200; exit 1; }
E=$(curl -si $U/feed/acme-pay.json | tr -d '\r' | sed -n 's/^[Ee][Tt]ag: //p'); [ -n "$E" ] || { echo FAIL etag; exit 1; }
[ "$(curl -s -o /dev/null -w %{http_code} -H "If-None-Match: $E" $U/feed/acme-pay.json)" = 304 ] || { echo FAIL 304; exit 1; }
[ "$(curl -s -o /dev/null -w %{http_code} $U/feed/nope.json)" = 404 ] || { echo FAIL 404; exit 1; }
curl -s $U/AGENTS.md | grep -q "feed fields\|Feed fields" || { echo FAIL agents; exit 1; }
echo "feed check OK"
