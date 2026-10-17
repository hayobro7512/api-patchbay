#!/bin/sh
# Close open patchbay/* PRs and delete patchbay/* branches in all demo repos.
cd "$(dirname "$0")" || exit 1
for R in $(node -e 'console.log(Object.values(require("./repos.json")).join(" "))' 2>/dev/null || node --input-type=commonjs -e 'console.log(Object.values(JSON.parse(require("fs").readFileSync("repos.json"))).join(" "))'); do
  gh pr list --repo $R --state open --json number,headRefName -q '.[]|select(.headRefName|startswith("patchbay/"))|.number' | while read N; do
    gh pr close $N --repo $R --delete-branch >/dev/null && echo "closed $R#$N"
  done
  gh api "repos/$R/git/matching-refs/heads/patchbay/" -q '.[].ref' | while read REF; do
    gh api -X DELETE "repos/$R/git/$REF" >/dev/null && echo "deleted $R $REF"
  done
done
