# Contracts

Frozen interfaces between the pieces. Read them, never edit them from an agent; changes go through the main session.

| File | Producer | Consumer |
|---|---|---|
| `changes.schema.json` | `src/detect`, served by `src/feed` | `src/patch`, outside agents |
| `patch.diff` | `src/patch` | `src/verify` |
| `result.schema.json` | `src/verify`, `src/ship` | `dashboard` |

## patch.diff

A unified diff for one customer repo.

- Paths are relative to the repo root.
- Must apply cleanly with `git apply` from the repo root.
- Touches only code needed for the listed changes. No formatting-only edits.
- One diff per repo per attempt. A retry produces a new diff.

## Where files live

- `runs/<run_id>/<repo-name>/changes.json`, `patch.diff`, `result.json` (git-ignored).
- The public feed serves the latest `changes.json` for a provider at `GET /feed/<provider>.json`, with an `ETag`.
