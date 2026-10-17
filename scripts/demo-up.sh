#!/bin/sh
# Start everything for the live demo: provider (8800), dashboard (8801), feed (8803), spec watcher.
# Extra args go to src/run.mjs, e.g.  sh scripts/demo-up.sh --sandbox freestyle --patch live --ship
cd "$(dirname "$0")/.." || exit 1
export PATH="$PATH:/opt/homebrew/bin"
mkdir -p runs/logs
pids=""
start() { name=$1; shift; "$@" > "runs/logs/$name.log" 2>&1 & pids="$pids $!"; }
trap 'kill $pids 2>/dev/null; echo; echo stopped' INT TERM EXIT

start provider node provider/server.js
sleep 1
curl -s -X POST localhost:8800/admin/version -H 'content-type: application/json' -d '{"version":"v1"}' > /dev/null
start feed node src/feed/server.mjs
start dashboard node dashboard/server.js
sleep 1
echo "provider  http://localhost:8800/spec.yaml   (serving v1)"
echo "dashboard http://localhost:8801"
echo "feed      http://localhost:8803/feed/acme-pay.json"
echo "flip to v2 with:  sh scripts/flip.sh v2    (watcher then runs the pipeline)"
echo
if [ $# -eq 0 ]; then set -- --sandbox freestyle --patch live --contract --ship; fi
node src/live.mjs -- "$@"
