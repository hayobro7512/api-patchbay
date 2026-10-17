#!/usr/bin/env bash
# Starts the server on a free port with MOCK=1 and a fake gh; asserts API, page, agent surface and merge guards.
# Never merges anything: GH_BIN points at a stub that only records that it was called.
set -euo pipefail
cd "$(dirname "$0")"
PORT=$(node -e 'const s=require("net").createServer().listen(0,()=>{console.log(s.address().port);s.close()})')
TMP=$(mktemp -d); printf '#!/bin/sh\ntouch "%s/gh-called"\n' "$TMP" > "$TMP/gh"; chmod +x "$TMP/gh"
MOCK=1 PORT=$PORT GH_BIN="$TMP/gh" node server.js >/dev/null & PID=$!
trap 'kill $PID 2>/dev/null || true; rm -rf "$TMP"' EXIT
B="127.0.0.1:$PORT"
for i in $(seq 50); do curl -sf "$B/api/results" >/dev/null && break; sleep 0.1; done
curl -sf "$B/api/results" | node -e '
const d=JSON.parse(require("fs").readFileSync(0,"utf8"));
const ok=["queued","locating","patching","verifying","passed","failed","shipped"];
if(d.mock!==true) throw new Error("mock flag missing");
if(d.runs.length!==2) throw new Error("expected 2 mock runs");
const demo=d.runs.find(r=>r.provider==="acme-pay"), oi=d.runs.find(r=>r.provider==="openai");
if(d.runs[0]!==oi && d.runs[0].run_id!==oi.run_id) throw new Error("newest should be the real openai run");
if(oi.real_or_simulated!=="real"||demo.real_or_simulated!=="simulated") throw new Error("real/simulated wrong");
if(demo.repos.length!==3) throw new Error("expected 3 repos in simulated run");
for(const x of [...demo.repos,...oi.repos]) if(!ok.includes(x.status)) throw new Error("bad status "+x.status);
if(demo.changes.changes.length!==4) throw new Error("changes missing");
if(!/safety_identifier/.test(oi.repos[0].diff_summary.text)) throw new Error("diff summary missing identifiers");
'
H=$(curl -sf "$B/")
echo "$H" | grep -qi '<!doctype html' || { echo "index is not HTML"; exit 1; }
echo "$H" | grep -q "MOCK DATA - not a real run" || { echo "banner missing"; exit 1; }
echo "$H" | grep -qF "Unlike dependency bots that start from your repo and bump versions, Patchbay starts from the provider's API change and hands every developer team a pull request that is already fixed and tested in a clean VM." || { echo "differentiator missing"; exit 1; }
echo "$H" | grep -q 'id="patchbay-state"' || { echo "patchbay-state missing"; exit 1; }
for f in app.js styles.css; do curl -sf "$B/$f" >/dev/null || { echo "$f missing"; exit 1; }; done
curl -sf "$B/api/latest" | node -e '
const d=JSON.parse(require("fs").readFileSync(0,"utf8"));
if(!Array.isArray(d.next_actions)||!d.next_actions.some(a=>a.id.startsWith("merge:")&&a.method==="POST"&&a.body&&a.body.pr_url)) throw new Error("next_actions missing merge");
for(const k of ["provider","from_version","to_version","real_or_simulated","summary","changes","repos"]) if(d[k]==null) throw new Error("latest."+k+" missing");
if(d.real_or_simulated!=="real"||d.repos[0].repo.indexOf("patchbay-demo-openai-images")<0) throw new Error("latest should be the openai run");
'
[ -n "$(curl -sf "$B/agents.md")" ] || { echo "agents.md empty"; exit 1; }
curl -sfI "$B/agents.md" | grep -qi 'text/markdown' || { echo "agents.md type"; exit 1; }
post() { curl -s -o /dev/null -w '%{http_code}' -X POST "$B/api/merge" -H "Origin: http://$B" "$@"; }
c=$(post -H 'Content-Type: application/json' -d '{"pr_url":"https://github.com/evil/other/pull/1"}')
[[ $c == 4* ]] || { echo "non-listed repo not rejected ($c)"; exit 1; }
c=$(post -H 'Content-Type: text/plain' -d '{"pr_url":"https://github.com/hayobro7512/patchbay-demo-node/pull/12"}')
[[ $c == 4* ]] || { echo "non-JSON content type not rejected ($c)"; exit 1; }
c=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$B/api/merge" -H 'Origin: http://evil.example' -H 'Content-Type: application/json' -d '{"pr_url":"https://github.com/hayobro7512/patchbay-demo-node/pull/12"}')
[[ $c == 4* ]] || { echo "cross-origin not rejected ($c)"; exit 1; }
[ ! -e "$TMP/gh-called" ] || { echo "gh was called by a rejected request"; exit 1; }
echo "dashboard check OK (port $PORT)"
