#!/bin/sh
# Outside agent proof: a coding agent that sees only AGENTS.md + the change feed fixes a customer repo.
R=$(cd "$(dirname "$0")/../.." && pwd); PORT=${FEED_PORT:-8803}; BASE=http://localhost:$PORT
SRC=${REPO_SRC:-$R/demo-repos/node-storefront}; LIMIT=${AGENT_TIMEOUT:-240}
mkdir -p "$R/runs/feed" "$R/runs/outside-agent"
[ -s "$R/runs/feed/acme-pay.json" ] || node "$R/src/detect/detect.mjs" --old "$R/provider/spec-v1.yaml" --new "$R/provider/spec-v2.yaml" --provider acme-pay --spec-url http://localhost:8800/spec.yaml --out "$R/runs/feed/acme-pay.json" || exit 1
SP=""
if ! curl -sf "$BASE/feed/acme-pay.json" >/dev/null; then
  PORT=$PORT node "$R/src/feed/server.mjs" >/dev/null 2>&1 & SP=$!; sleep 1
fi
W=$(mktemp -d); LOG="$R/runs/outside-agent/$(date +%H%M%S).log"
cleanup() { [ -n "$SP" ] && kill $SP 2>/dev/null; [ -n "$AP" ] && kill $AP 2>/dev/null; }; trap cleanup EXIT
git clone -q "$SRC" "$W/repo" && cd "$W/repo" || exit 1
sed "s#http://localhost:8803#$BASE#g" "$R/src/feed/AGENTS.snippet.md" > AGENTS.md   # customer adopts the snippet
PROMPT="Follow AGENTS.md. The API provider (Acme Pay) changed its API; fix this repo using the change feed it points to. Run the tests with ACME_API_VERSION=v2 ./test.sh until they pass. Do not edit test files."
START=$(date +%s)
if [ -n "$AGENT_CMD" ]; then $AGENT_CMD "$PROMPT" >"$LOG" 2>&1 & else
  claude -p "$PROMPT" --allowedTools "Bash Read Edit Write" --permission-mode acceptEdits --output-format text >"$LOG" 2>&1 & fi
AP=$!
( sleep "$LIMIT"; kill $AP 2>/dev/null ) & WD=$!
wait $AP; kill $WD 2>/dev/null; AP=""
EL=$(( $(date +%s) - START ))
echo "--- agent output (tail), full log: $LOG"; tail -n 12 "$LOG"
echo "--- git diff --stat"; git diff --stat
if ACME_API_VERSION=v2 ./test.sh >/dev/null 2>&1; then V=PASS; else V=FAIL; fi
echo "RESULT: $V in ${EL}s (repo $W/repo)"
[ $V = PASS ]
