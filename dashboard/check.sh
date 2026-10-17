#!/usr/bin/env bash
# Starts the server on a free port with MOCK=1 and asserts the API and the page.
set -euo pipefail
cd "$(dirname "$0")"
PORT=$(node -e 'const s=require("net").createServer().listen(0,()=>{console.log(s.address().port);s.close()})')
MOCK=1 PORT=$PORT node server.js >/dev/null & PID=$!
trap 'kill $PID 2>/dev/null || true' EXIT
for i in $(seq 50); do curl -sf "localhost:$PORT/api/results" >/dev/null && break; sleep 0.1; done
curl -sf "localhost:$PORT/api/results" | node -e '
const d=JSON.parse(require("fs").readFileSync(0,"utf8"));
const ok=["queued","locating","patching","verifying","passed","failed","shipped"];
if(d.mock!==true) throw new Error("mock flag missing");
const r=d.runs[0].repos;
if(r.length!==3) throw new Error("expected 3 repos, got "+r.length);
for(const x of r) if(!ok.includes(x.status)) throw new Error("bad status "+x.status);
if(!d.runs[0].changes||d.runs[0].changes.changes.length!==4) throw new Error("changes missing");
'
curl -sf "localhost:$PORT/" | grep -qi '<!doctype html' || { echo "index is not HTML"; exit 1; }
curl -sf "localhost:$PORT/" | grep -q "MOCK DATA - not a real run" || { echo "banner missing"; exit 1; }
for f in app.js styles.css; do curl -sf "localhost:$PORT/$f" >/dev/null || { echo "$f missing"; exit 1; }; done
echo "dashboard check OK (port $PORT)"
