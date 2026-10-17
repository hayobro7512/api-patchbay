#!/bin/sh
set -e
D=$(cd "$(dirname "$0")" && pwd); R=$D/../..; T=$(mktemp -d)
node "$D/detect.mjs" --old "$R/provider/spec-v1.yaml" --new "$R/provider/spec-v2.yaml" --provider acme-pay --spec-url http://localhost:8800/spec.yaml --out "$T/c.json"
node --input-type=module -e '
import {readFileSync} from "fs"; import {validate} from "'$D'/validate.mjs"; import assert from "assert";
const d=JSON.parse(readFileSync("'$T'/c.json")); assert.deepEqual(validate(d),[]);
const c=d.changes; assert.equal(c.length,4);
const s=c.map(x=>[x.kind,x.method,x.path,x.location,x.name].join(" "));
assert.deepEqual(s,["breaking POST /v1/charges request_param amount_cents","breaking DELETE /v1/legacy/tokens/{token} endpoint /v1/legacy/tokens/{token}","added POST /v1/charges enum_value requires_review","added DELETE /v1/tokens/{token} endpoint /v1/tokens/{token}"]);
assert.equal(c[0].after,"amount_minor"); assert.match(c[1].after,/\/v1\/tokens/);
assert.ok(validate({...d,extra:1}).length && validate({...d,changes:[{...c[0],kind:"x"}]}).length);
console.log("detect check OK")'
