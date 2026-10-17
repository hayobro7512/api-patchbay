# API Patchbay

An API provider publishes a machine-readable change feed. A coding agent reads it, fixes each customer's code, proves the fix in a sandbox VM, and opens a pull request. The provider ships once, and every customer receives a tested PR.

Built solo at c0mpiled-14 (UC Berkeley, 2026-10-17) for the YC Fall 2026 RFS "Self-Maintaining APIs", agent-first software track.

## Who it is for

Businesses, not app users. The buyers are API providers (fewer support tickets, faster adoption of new features) and the integration or platform teams that maintain many third-party API integrations. The "customer" who reviews a PR is a developer on such a team, not an end user of the product built on the API.

## What it does

1. **Detect.** `oasdiff` compares the provider's old and new OpenAPI spec and produces `changes.json` (breaking, deprecated, added), each change with a `migration_hint` written for agents.
2. **Publish.** The list is served as a feed at `GET :8803/feed/<provider>.json`. Any agent can read it. `src/feed/AGENTS.snippet.md` is the copy-paste block a customer adds to their `AGENTS.md`.
3. **Patch.** For each customer repo, a model (DeepSeek V4.1 Flash through RunAnywhere Wally) turns the changes plus the matching code into a unified diff. A failed attempt feeds its test log into the next attempt.
4. **Verify.** One Freestyle VM per repo: upload, install, snapshot, apply the patch, run the tests. A retry forks a new VM from the snapshot. With `--contract` the tests call a mock API (`provider/mock-api.mjs`) that is generated from the provider's published OpenAPI spec, so the patch is checked against the spec itself: unknown endpoints 404, bad or unknown request fields 400, enum values from the spec.
5. **Ship.** `gh pr create` opens a PR with the change table, the diff summary and the test result. By default a developer team reviews and merges it. With `--merge auto` Patchbay merges the PR itself, but only if the tests passed in the VM and the diff is at most `--max-lines` (default 200) changed lines; otherwise the PR stays open. `--base autodemo` points PRs at a throwaway branch so `main` stays untouched in demos.
6. **Dashboard.** `localhost:8801` shows each repo's progress, attempts, VM id and PR link.

**Real change (main demo):** OpenAI's public spec changed `POST /images/generations` between two commits (`5162af98`, 2026-05-13, and `f601a440`, 2026-10-15): `model` became required and `user` was deprecated for `safety_identifier`. `npm run demo:openai` runs the full pipeline on that change against three small example repos (Node, Python, Go; ours) in parallel in 40 to 80 seconds. The spec is trimmed to that one operation. **Simulated provider (second demo):** a fake one, **Acme Pay**, with three small repos (Node, Python, Go). v2 renames a request parameter, removes an endpoint and adds an enum value. A fourth repo (`node-storefront`) is the target for the outside-agent moment: `scripts/outside-agent/run.sh` points Claude Code at the feed alone and has it fix a repo it has never seen.

## Run it

Prerequisites: Node 22+, `oasdiff`, Go, `gh` (logged in), the Freestyle CLI login and `FREESTYLE_API_KEY` in `.env`, and `wally account login` for the patch model.

```
npm run demo:openai # real OpenAI change: dashboard + feed, press Enter to run
npm run demo:simulated # simulated Acme Pay: provider :8800, dashboard :8801, feed :8803, spec watcher
npm run flip        # provider publishes v2 -> watcher runs the pipeline
npm run reset       # back to v1, close demo PRs, clear runs
```

One-shot run without the watcher:

```
node src/run.mjs --sandbox freestyle --patch live --contract --ship
node src/run.mjs --sandbox local --patch mock        # offline, no model, no VMs
```

Checks: `npm run check`.

## Layout

```
provider/        Acme Pay specs (v1, v2) and a spec server
demo-repos/      three customer repos plus node-storefront and reference patches
src/detect/      oasdiff -> changes.json, spec watcher
src/feed/        feed server and the AGENTS.md snippet
src/patch/       locate affected code, model call, git apply check, repair round
src/verify/      Freestyle VM (or local) sandbox, snapshot and fork on retry
src/ship/        pull request step, reset script
src/run.mjs      orchestrator (parallel per repo, retries)
src/live.mjs     watches the spec URL and triggers a run on change
dashboard/       status page that reads runs/<run>/<repo>/result.json
schemas/         the three contracts between the pieces
```

`PLAN.md` has the build plan; `PROJECT_DESCRIPTION.md` has the pitch material.

## Honest limits

- Fake provider and small repos. Real migrations are harder, and patch quality depends on the model. In testing, DeepSeek V4.1 Flash passed 8 of 9 first-shot runs; the retry loop covers the rest.
- Customers still review and merge every PR.
- The Freestyle account is on the Free plan (5 VMs, 5 snapshots), so the run cleans up VMs after each pass.
