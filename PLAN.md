# API Patchbay: project plan

Hackathon: c0mpiled-14, UC Berkeley, 2026-10-17. Submissions due 4:30 PM. Solo build: one main session plus subagents.
Track: **agent-first software** (software built for AI agents to use). Challenge: YC RFS Fall 2026, "Self-Maintaining APIs".

## One-line pitch

API providers publish a machine-readable change feed. Any coding agent can read it, fix the customer's code, prove the fix in a sandbox VM, and open a pull request. The provider ships once, every customer gets a tested PR.

## Need

Breaking changes, deprecations and new features ship constantly. Changelogs go unread, integrations break, useful features go unadopted. Coding agents already get repo access, so the missing piece is the layer between the provider and the customer's codebase. Providers should apply changes, not just announce them.

## Why this is agent-first

- The product surface is the **change feed** (`changes.json`): small, stable, documented, built for agents to read, not people.
- Two agents consume it in the demo: our own update agent and one outside agent (Claude Code or Wally) pointed at the feed with a copy-paste `AGENTS.md` snippet.
- The update agent acts: edits code, runs tests, opens the PR. A human only reviews and merges.

## Pipeline

1. **Detect.** Poll the provider's OpenAPI spec URL, hash it, run `oasdiff` on change, write `changes.json`.
2. **Publish.** Serve the feed at `GET /feed/<provider>.json` with a version and ETag.
3. **Locate.** Search each connected repo for affected calls (ripgrep, plus an LLM pass for SDK wrappers).
4. **Patch.** LLM turns a change plus matched code into `patch.diff`. Model comes from `PATCH_MODEL` (default `deepseek-v4.1-flash` via Wally, fallback `glm-5.3-flash`, then NVIDIA free endpoints).
5. **Verify.** One Freestyle VM per repo: clone, install, snapshot, apply patch, run tests. On failure, branch from the snapshot and retry with another attempt. Local temp-dir sandbox is a fallback behind the same function.
6. **Ship.** `gh pr create` with changelog link, diff and test result. Dashboard reads `result.json` files.

## Contracts (frozen; see `schemas/`)

- `changes.json` for detection output and the public feed (`schemas/changes.schema.json`).
- `patch.diff`: unified diff, paths relative to repo root, must apply with `git apply` (`schemas/README.md`).
- `result.json`: one per repo per run (`schemas/result.schema.json`). The dashboard reads only this.

Agents may read the schemas but never edit them. Schema changes go through the main session.

## Layout and ownership

```
api-patchbay/
  provider/      Agent 1   Acme Pay: spec-v1.yaml, spec-v2.yaml, tiny server that serves the current spec
  demo-repos/    Agent 1   node/, python/, go/ client repos with tests
  src/detect/    Agent 2   oasdiff wrapper -> changes.json
  src/feed/      Agent 2   feed server + AGENTS.md snippet
  src/patch/     Agent 2   locate + LLM -> patch.diff
  src/verify/    Agent 3   Freestyle VM or local sandbox -> result.json
  src/ship/      Agent 3   gh pr create
  dashboard/     Agent 4   reads result.json only
  PLAN.md, schemas/        main session
```

One owner per folder, so nobody collides.

## Waves

| Wave | Who | Done when |
|---|---|---|
| 0 | Main: this plan, schemas, scaffold | Files exist; Freestyle key in git-ignored `.env` |
| 1 | Agent 1 (provider + 3 repos), Agent 4 (dashboard on mock data) | Repo tests pass on v1 and fail on v2. Dashboard renders mock `result.json`. |
| 2 | Agent 2 (detect, feed, patch), Agent 3 (verify, ship; local sandbox first) | Valid diffs for all 3 repos. A hand-written diff goes green in the sandbox. |
| 3 | Main | End to end on Freestyle VMs; outside agent reads the feed |
| 4 | Main | Rehearse, record backup video, write pitch |

Rules for every agent: work only in your own folder; end with a runnable check that fails if the code breaks; report in under 10 lines (what exists, how to run it, what is stubbed). Run at most two agents at once. Do not compact the session while agents run.

## Timeline (revised at about 1:00 PM; 3.5 hours left, end to end first)

- 1:00 PM Wave 1 done and verified (provider, 3 repos, dashboard)
- 1:45 PM Wave 2 agents report (detect, feed, patch, verify, ship; GitHub demo repos created)
- 2:30 PM `src/run.mjs` orchestrator green end to end on all 3 repos (hand diff first, then live model, then Freestyle VM). A hand-written diff going green in a Freestyle VM is the minimum viable demo; protect it.
- 3:00 PM hardening: tests verify against a real provider mock, 4th repo for the outside-agent moment, README and `npm run demo`
- 3:30 PM feature freeze, record backup video, rehearse
- 4:15 PM final check; 4:30 PM submit

## Review changes (from an outside critique at 1:00 PM)

Accepted:
- Verify must not be circular. Tests currently run against stubs embedded in each repo. Fix: `provider/server.js` also serves a mock Acme Pay API that validates requests against the loaded OpenAPI spec, and the verify step starts it inside the VM. Claim: "validated against the provider's published spec", not "our own stub". Done only after end to end is green.
- Dashboard mock data must match the real demo and show a MOCK banner. Assigned to Agent 4.
- A 4th repo (`demo-repos/node-storefront`, different structure, no reference patch, not in the main run) is the target for the outside-agent moment. Pre-record that moment.
- Git: `git init` at the project root, nested demo repos ignored; they live on GitHub as `patchbay-demo-*`.
- Judges' README plus `npm run demo`, filled in after the orchestrator exists.
- Moat message: the structured feed is the standard, the agent is replaceable. Providers pay.

Not needed:
- "Create demo repos on GitHub" needed approval: given by the user (GitHub is in scope; repos stay private).
- Hand-rolled spec diff to replace `oasdiff`: skipped; `oasdiff` is installed (`brew install oasdiff`) and listed as a prerequisite in the README.
- Freestyle credits are redeemed; Free-plan caps (5 VMs, 5 snapshots) are respected by always cleaning up and keeping 3 VMs at a time. Re-check the Wallet page limits.

## Demo script (3 minutes)

1. Show a repo that uses Acme Pay and a stale changelog nobody read.
2. Flip the provider to v2. The feed updates and `changes.json` shows 1 breaking, 1 removed endpoint, 1 new enum.
3. Dashboard: three repos light up, three VMs spin up in parallel, tests go green. Show one retry branch if a first attempt fails.
4. Three PRs appear. Open one and show the diff and the test result.
5. Point a second agent (Claude Code or Wally) at the feed using the `AGENTS.md` snippet and show that it can fix a fourth repo.
6. Close: "Provider ships once, every customer is patched."

## Cut list

Auth, billing, GitHub App install flow (use `gh` login), real multi-provider support, scheduling. Real Stripe spec is a bonus slide only. Regulated-industry angle (PCI, HIPAA integrations) is a go-to-market slide, not a feature.

## Risks

- **Patch quality.** Keep v2 changes simple: rename a param, remove an endpoint, add an enum. Pre-test the prompt against all three repos.
- **Freestyle limits (Free plan view):** 5 running VMs, 5 total VMs, 5 snapshots. Three repos fit; delete VMs and snapshots between runs. Credits were redeemed in another session; amount unconfirmed.
- **Live demo failure.** Record a backup video before 4:15 PM.
- **Network.** Pre-clone repos and pre-install dependencies in a snapshot before presenting.

## Environment

- GitHub CLI logged in as `hayobro7512`. No repo is created or pushed without explicit approval. Demo PR targets: three throwaway private repos, created only on approval.
- Freestyle CLI logged in. API key goes in `.env` as `FREESTYLE_API_KEY`, never printed or committed. Use the `freestyle-docs` skill and https://www.freestyle.sh/docs/llms.txt for exact API names.
- Wally (RunAnywhere) day pass runs 10 AM to 10 PM Pacific. Model choice lives in `PATCH_MODEL`.
- Overlap check done: no YC Fall 2026 company does this. Adjacent: Pomerado, Rystic, Papaya, OpenHack.

## Open decisions (defaults assumed)

- Fake provider "Acme Pay" over a real Stripe spec. Default: fake.
- TypeScript for server and dashboard. Default: yes.
- Where demo PRs land. Default: three throwaway private repos under `hayobro7512`, pending approval.
