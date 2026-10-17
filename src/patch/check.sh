#!/bin/sh
# usage: check.sh [mock|live]  (default: mock, then live if a model is reachable)
export PATH=$PATH:/opt/homebrew/bin
D=$(cd "$(dirname "$0")" && pwd); R=$D/../..; MODE=${1:-all}; T=$(mktemp -d); N=${ATTEMPTS:-3}
node "$D/../detect/detect.mjs" --old $R/provider/spec-v1.yaml --new $R/provider/spec-v2.yaml --provider acme-pay --spec-url http://localhost:8800/spec.yaml --out $T/changes.json 2>/dev/null
try() { # lang mockflag n -> 0 pass
  W=$T/$1-$3; git clone -q $R/demo-repos/$1 $W || return 2
  node "$D/patch.mjs" --repo $W --changes $T/changes.json --out $T/$1-$3.diff $2 $FB 2>$T/$1-$3.log || return 1
  (cd $W && git apply $T/$1-$3.diff) 2>>$T/$1-$3.log || return 1
  (cd $W && ACME_API_VERSION=v2 ./test.sh) >$T/$1-$3.test 2>&1
}
rc=0
if [ $MODE != live ]; then
  for l in node python go; do try $l --mock 0 && echo "mock $l PASS" || { echo "mock $l FAIL"; rc=1; }; done
fi
if [ $MODE != mock ]; then
  printf '%-8s %s\n' repo pass-rate
  for l in node python go; do p=0; i=1
    while [ $i -le $N ]; do try $l "" $i && p=$((p+1)); i=$((i+1)); done
    printf '%-8s %d/%d\n' $l $p $N; done
  echo "logs in $T"
fi
exit $rc
