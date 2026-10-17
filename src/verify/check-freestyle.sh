#!/bin/sh
# Real Freestyle run on the node repo: create VM, snapshot, test pass; then attempt 2 forks from the snapshot; cleanup.
cd "$(dirname "$0")/../.." || exit 1
RUN=check-fs-$$
trap 'node src/verify/verify.mjs --cleanup --run $RUN; rm -rf runs/$RUN' EXIT
A="--repo-dir demo-repos/node --patch demo-repos/reference-patches/node.diff --run $RUN --provider acme-pay --sandbox freestyle --env ACME_API_VERSION=v2"
node src/verify/verify.mjs $A --attempt 1 > /tmp/fs1-$$.json || { echo "FAIL attempt 1"; cat /tmp/fs1-$$.json; exit 1; }
node src/verify/verify.mjs $A --attempt 2 > /tmp/fs2-$$.json || { echo "FAIL attempt 2 (fork)"; cat /tmp/fs2-$$.json; exit 1; }
node -e '
const r=f=>JSON.parse(require("fs").readFileSync(f));
const a=r("/tmp/fs1-'$$'.json"),b=r("/tmp/fs2-'$$'.json"),res=r("runs/'$RUN'/node/result.json");
console.log("attempt1 timings ms",JSON.stringify(a.timings_ms),"vm",a.vm_id,"snapshot",a.snapshot_id);
console.log("attempt2 (fork) timings ms",JSON.stringify(b.timings_ms),"vm",b.vm_id);
if(a.vm_id===b.vm_id||!b.timings_ms.fork_ms||res.attempts.length!==2||res.status!=="passed"||res.sandbox!=="freestyle")process.exit(1);
console.log("ok: 2 attempts, forked from snapshot, status passed")' || { echo FAIL; exit 1; }
rm -f /tmp/fs1-$$.json /tmp/fs2-$$.json
