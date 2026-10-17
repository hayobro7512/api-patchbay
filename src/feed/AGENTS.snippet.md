## API change feed (Acme Pay)

Acme Pay publishes machine-readable API changes. Keep our integration current:

1. Fetch `http://localhost:8803/feed/acme-pay.json` (send `If-None-Match` with the last ETag; 304 means nothing new).
2. For each item in `changes[]`, find every usage in this repo of its `path`, `name`,
   `before` and `after` (grep source and tests, including SDK wrappers).
3. Apply `migration_hint` with minimal edits. `kind: breaking` must be fixed; `added` is
   optional except new `enum_value`s, which must be handled.
4. Run the tests with `ACME_API_VERSION=v2` set, fix until green, then open a PR
   describing each change id you applied.

Feed fields: `provider`, `from_version`, `to_version`, `spec_url`, `generated_at`,
`changes[]`: `id`, `kind` (breaking|deprecated|added), `method`, `path`,
`location` (endpoint|request_param|response_field|enum_value), `name`, `summary`,
`before`, `after`, `migration_hint`.
