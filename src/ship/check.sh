#!/bin/sh
# End to end ship on the python repo with the reference patch, then reset and confirm no open PRs remain.
cd "$(dirname "$0")/../.." || exit 1
RUN=check-ship-$$
mkdir -p runs/$RUN/python
cat > runs/$RUN/changes.json <<J
{"provider":"acme-pay","from_version":"v1","to_version":"v2","spec_url":"http://localhost/spec","generated_at":"2026-10-17T00:00:00Z","changes":[{"id":"chg_001","kind":"breaking","method":"POST","path":"/v1/charges","summary":"amount_cents renamed to amount_minor","migration_hint":"rename"}]}
J
node src/verify/verify.mjs --repo-dir demo-repos/python --patch demo-repos/reference-patches/python.diff --run $RUN --provider acme-pay --sandbox local --env ACME_API_VERSION=v2 --changes runs/$RUN/changes.json >/dev/null || { echo "FAIL verify"; exit 1; }
URL=$(node src/ship/ship.mjs --lang python --patch demo-repos/reference-patches/python.diff --run $RUN --provider acme-pay) || { echo "FAIL ship"; sh src/ship/reset.sh; exit 1; }
echo "PR: $URL"
URL2=$(node src/ship/ship.mjs --lang python --patch demo-repos/reference-patches/python.diff --run $RUN --provider acme-pay)
[ "$URL" = "$URL2" ] && echo "idempotent ok" || echo "FAIL not idempotent"
grep -q '"shipped"' runs/$RUN/python/result.json && echo "result.json shipped" || echo "FAIL status"
sh src/ship/reset.sh
N=0; for R in $(node -e 'console.log(Object.values(JSON.parse(require("fs").readFileSync("src/ship/repos.json"))).join(" "))'); do N=$((N+$(gh pr list --repo $R --state open --json number -q length))); done
rm -rf runs/$RUN
[ "$N" = 0 ] && echo "ok: no open PRs remain" || { echo "FAIL: $N open PRs"; exit 1; }
