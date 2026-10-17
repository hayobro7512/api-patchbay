# API Patchbay

An API provider's spec change becomes one machine-readable change feed. Any coding agent can read it, fix each developer team's repo, prove the fix in a sandbox VM, and open a pull request. The provider ships once, and every developer team receives a tested PR.

Note: the example repos the pipeline patches (`patchbay-demo-*`) are private GitHub repos, so their PR links will not open for visitors; the video shows them.

## Who it is for

- **API providers** (payments, messaging, AI, maps, data and more): publish a change once, and watch developer teams adopt it faster, with fewer support tickets and fewer broken integrations.
- **Developer teams and engineering organizations** that build on third-party APIs: receive a tested pull request in each repo instead of reading changelogs, in whatever language the repo uses.
- **Platform, integrations and developer-experience teams** that keep dozens of vendor integrations current across many repos.
- **AI coding agents and the people who build them**: a versioned, machine-readable change feed that any agent can use through a short `AGENTS.md` snippet.
- **Reliability and engineering leaders**: fewer outages from API changes nobody noticed, with human review by default or opt-in auto-merge under a policy the team sets.

From startups to large enterprises, anyone who depends on an API can use it.

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

## Current scope

Demonstrated on a real OpenAI spec change (`POST /images/generations`, May to October 2026) replayed on three example repos in Node, Python and Go. Developer teams review each pull request, or opt in to auto-merge for small passing changes.
