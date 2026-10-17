#!/bin/sh
# Starts server, flips versions, asserts spec.yaml changes. Non-zero on failure.
cd "$(dirname "$0")" || exit 1
P=${PORT:-8810}; U=http://localhost:$P
PORT=$P node server.js & S=$!
trap 'kill $S' EXIT; sleep 1
fail() { echo "FAIL: $1"; exit 1; }
curl -sf $U/spec.yaml | grep -q 'version: 1.0.0' || fail "default not v1"
curl -sf $U/spec.yaml | grep -q amount_cents || fail "v1 lacks amount_cents"
curl -sf -XPOST $U/admin/version -d '{"version":"v2"}' >/dev/null || fail "flip v2"
curl -sf $U/spec.yaml | grep -q 'version: 2.0.0' || fail "not v2"
curl -sf $U/spec.yaml | grep -q amount_minor || fail "v2 lacks amount_minor"
curl -sf $U/version | grep -q v2 || fail "/version"
curl -sf -XPOST $U/admin/version -d '{"version":"v1"}' >/dev/null && curl -sf $U/spec.yaml | grep -q amount_cents || fail "flip back"
[ "$(curl -s -o /dev/null -w %{http_code} -XPOST $U/admin/version -d '{"version":"x"}')" = 400 ] || fail "bad version accepted"
echo "provider check OK"
