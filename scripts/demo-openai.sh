#!/bin/sh
# Real-change demo: OpenAI's POST /images/generations change (model became required, user deprecated for safety_identifier).
# Starts the dashboard (8801) and feed (8803), waits for Enter so you can start recording, then runs the pipeline.
# Extra args go to src/run.mjs, e.g.  sh scripts/demo-openai.sh --sandbox local
cd "$(dirname "$0")/.." || exit 1
export PATH="$PATH:/opt/homebrew/bin"
mkdir -p runs/logs
pids=""
trap 'kill $pids 2>/dev/null; echo; echo stopped' INT TERM EXIT
node dashboard/server.js > runs/logs/dashboard.log 2>&1 & pids="$pids $!"
node src/feed/server.mjs > runs/logs/feed.log 2>&1 & pids="$pids $!"
sleep 1
echo "dashboard  http://localhost:8801"
echo "feed       http://localhost:8803/feed/openai.json   (appears after the run starts)"
echo "real spec  openai/openai-openapi commits 5162af98 -> f601a440 (trimmed to POST /images/generations)"
echo
printf "Open the dashboard, start your screen recording, then press Enter to start the run... "
read _
SU=https://raw.githubusercontent.com/openai/openai-openapi/f601a440c21397028cad2218eca1afd701bf12ec/openapi.yaml
if [ $# -eq 0 ]; then set -- --sandbox freestyle --patch live --contract --ship --base autodemo; fi
node src/run.mjs --repos openai-images --old provider-real/openai-images-old.yaml --new provider-real/openai-images-new.yaml --provider openai --spec-url "$SU" "$@"
echo
echo "Run finished. Dashboard stays up; press Ctrl+C to stop, then run: npm run reset"
while true; do sleep 3600; done
