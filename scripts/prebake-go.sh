#!/bin/sh
# Bake a Freestyle snapshot with Go installed + warm build cache; saves FREESTYLE_GO_SNAPSHOT=<id> to .env.
cd "$(dirname "$0")/.." || exit 1
set -a; . ./.env; set +a
F="npx -y freestyle@latest"
VM=$($F --output json vm create --no-ssh --metadata patchbay=prebake | node -e 'console.log(JSON.parse(require("fs").readFileSync(0,"utf8")).id)') || exit 1
trap '$F vm delete $VM >/dev/null 2>&1' EXIT
$F vm exec $VM --linux-user root --timeout-ms 300000 -- sh -c 'curl -fsSL https://go.dev/dl/go1.24.4.linux-$(dpkg --print-architecture).tar.gz | tar -C /usr/local -xz' || exit 1
$F vm exec $VM --timeout-ms 300000 -- sh -c 'export PATH=$PATH:/usr/local/go/bin HOME=/home/ubuntu; go version && mkdir -p /tmp/hello && cd /tmp/hello && printf "module hello\ngo 1.24\n" > go.mod && printf "package main\nimport \"fmt\"\nfunc main(){fmt.Println(1)}\n" > main.go && go build -o /dev/null . && go vet . && printf "package hello\nimport \"testing\"\nfunc TestX(t *testing.T){}\n" > h_test.go && sed -i "s/package hello/package main/" h_test.go && go test ./... ' || exit 1
ID=$($F --output json snapshot create $VM | node -e 'const j=JSON.parse(require("fs").readFileSync(0,"utf8"));console.log(j.snapshotId||j.id)') || exit 1
grep -v '^FREESTYLE_GO_SNAPSHOT=' .env > .env.tmp; echo "FREESTYLE_GO_SNAPSHOT=$ID" >> .env.tmp; mv .env.tmp .env
echo "baked go snapshot ${ID%${ID#????????}}..."
