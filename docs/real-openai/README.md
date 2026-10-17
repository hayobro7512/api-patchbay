# Real OpenAI spec test

Source: github.com/openai/openai-openapi, file openapi.yaml.
Old: 5162af98d3147432c14680df789e8e12d4891e6b (2026-05-13). New: f601a440c21397028cad2218eca1afd701bf12ec (2026-10-15).
Files: openapi.old.yaml (2.8 MB), openapi.new.yaml (4.1 MB), oasdiff-changelog.json, oasdiff-diff.json, openai-changes.json.

Run: `oasdiff changelog` and `oasdiff diff` (both succeed), then `detect.mjs --provider openai` (succeeds, unedited).
oasdiff reports 5308 changes in the span (level 3 breaking: 699, level 2 warn: 889, level 1 info: 3720), including 28 request-property-deprecated and 11 endpoint-deprecated.
detect.mjs wrote 5308 entries: 4 breaking request_param, 1 breaking endpoint, 438 breaking with no location, 376 deprecated, 1067 added enum_value, 119 added endpoint, 3303 added other.

What it proves: the pipeline runs end to end on a real 4 MB spec and a real feed shape comes out.
What it does not: detect.mjs assumes a small spec. Five months of OpenAI changes is too noisy for a feed, and the names are raw oasdiff paths such as allOf[...]/service_tier.
Its rename pairing fires on a false positive (service_tier moved between schemas, reported as removed). Rename and enum logic is tuned for Acme Pay.
For a demo, filter to one endpoint (POST /images/generations) or diff two adjacent commits.

Mock API: provider/mock-api.mjs starts on the new spec but its YAML-subset parser keeps only the top-level title (3 keys, no paths).
Any request returns 404 "no operation POST /images/generations in spec undefined". It cannot serve a real spec; it needs a real YAML parser and $ref resolution (4953 $refs, 3902 block scalars).
