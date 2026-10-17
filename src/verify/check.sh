#!/bin/sh
# Local-sandbox check: unpatched fails, reference patch passes, result.json valid, for node/python/go.
cd "$(dirname "$0")/../.." || exit 1
export PATH="$PATH:/opt/homebrew/bin"
RUN=check-local-$$
for L in node python go; do
  ACME_API_VERSION=v2 ./demo-repos/$L/test.sh >/dev/null 2>&1 && { echo "FAIL: unpatched $L passes"; exit 1; }
  node src/verify/verify.mjs --repo-dir demo-repos/$L --patch demo-repos/reference-patches/$L.diff --run $RUN --provider acme-pay --sandbox local --env ACME_API_VERSION=v2 >/dev/null || { echo "FAIL: patched $L"; exit 1; }
  echo "ok $L: unpatched fails, patched passes"
done
node -e '
const fs=require("fs");const R=`runs/'$RUN'`;
for (const l of ["node","python","go"]) {
  const r=JSON.parse(fs.readFileSync(`${R}/${l}/result.json`));
  const ok=["run_id","provider","repo","status","attempts","started_at"].every(k=>k in r)&&r.status==="passed"&&r.sandbox==="local"&&r.attempts[0].tests==="pass"&&r.finished_at;
  if(!ok){console.error("bad result.json",l);process.exit(1)}
}
console.log("result.json valid x3")'
rm -rf runs/$RUN
