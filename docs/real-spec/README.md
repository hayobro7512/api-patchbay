# Detect step on the real Stripe OpenAPI spec

I ran the detect step on two published releases of Stripe's public OpenAPI repo (stripe/openapi):
tag v2300 (commit dated 2026-06-12, spec version 2026-05-27.dahlia) and tag v2585 (commit dated
2026-10-16, spec version 2026-09-30.endive). The file in both is latest/openapi.spec3.json
(4.4 MB and 4.7 MB). The two spec files are git-ignored; refetch them from
raw.githubusercontent.com/stripe/openapi/<tag>/latest/openapi.spec3.json.

Command:

    node docs/real-spec/detect-real.mjs --old docs/real-spec/stripe-v2300.json \
      --new docs/real-spec/stripe-v2585.json --provider stripe \
      --spec-url https://raw.githubusercontent.com/stripe/openapi/v2585/latest/openapi.spec3.json \
      --out docs/real-spec/stripe-changes.json

The unmodified src/detect/detect.mjs fails on this input: oasdiff prints about 350,000 entries
(every shared schema is expanded under each operation) and the 64 MB output buffer overflows.
detect-real.mjs is a copy with three changes: a 1 GB buffer, a version reader for compact JSON,
and a pre-filter that drops info-level response entries and collapses repeated response-side
entries into one per operation. The result is 2,848 changes that pass the changes schema.

What this proves: the detect step runs end to end on a real provider spec of this size, in about
16 seconds, and produces schema-valid output. What it does not prove: nothing here patches real
Stripe client code, the migration hints are generic templates, and the many response-side
entries are noisy (long nested paths). Request-side changes and new endpoints are the useful part.
