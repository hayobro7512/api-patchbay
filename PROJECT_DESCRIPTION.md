# API Patchbay: project description (for the video and presentation agent)

Working name: **API Patchbay**. Built solo at c0mpiled-14, UC Berkeley, Saturday 2026-10-17. Submissions are due 4:30 PM; awards 5:30 PM to 6:00 PM. This file is the source of truth for scripts. Do not invent features that are not listed here. The build is in progress, so treat the "Demo" section as the target and ask the builder before claiming anything not marked as working.

## Event context

- Challenge: pick any request from the YC Requests for Startups, Fall 2026. Ours: **Self-Maintaining APIs** (by Harsha Gaddipati).
- Track: **agent-first software**, meaning software built for AI agents to use. (Other tracks: personal AI tools, regulated industry, hardware.)
- Prize: 1st place $1,500 plus $10,000 Freestyle credits; 2nd $900; 3rd $600.
- Judges include people from Superset (YC P26), Freestyle (YC S24), Latted (YC W24), Quivly AI (YC F26), Sona8 (YC F26), Aurasell AI, Reintersect, Gutgutgoose (YC S26, remote), and Long Do (MTS at OpenAI). Sponsors: Freestyle, RunAnywhere (Wally), Latted, Enactus at Berkeley.
- Format: demos are optional, shown after the 4:30 PM submission deadline. Assume a short slot of about 3 minutes.

## The problem

API providers ship breaking changes, deprecations and new features all the time. Their customers find out late or never. Changelogs go unread, so integrations quietly break, and useful new features sit unadopted. The RFS author reports working with over 50 API vendors and says that at AWS over 30% of service downtime came from external API or package changes that went unnoticed.

This used to be unfixable at scale because someone had to edit every customer's code. Coding agents (Claude Code, Devin, Greptile and others) changed that: teams now let agents touch their repositories. What is missing is the layer between the API provider and the customers' codebases.

## The idea in one sentence

When an API provider changes its API, it publishes a machine-readable change feed; an agent reads the feed, fixes each customer's code, proves the fix in a sandbox VM, and opens a pull request. The provider ships once, and every customer receives a tested PR.

Plain-language gloss for the audience: a pull request (PR) is a proposal to change code that a human reviews before it goes live. The agent never edits a customer's main code directly, so customers stay in control.

## Why it counts as agent-first

- The product surface is the **change feed** (`changes.json`): small, stable, versioned, written for agents to read, not for people.
- **Two agents consume it in the demo**: our own update agent, and an outside agent (Claude Code or Wally) pointed at the feed with a copy-paste `AGENTS.md` snippet.
- The agent acts, not just advises: it edits code, runs the tests, opens the PR.

## How it works

1. **Detect.** The provider's OpenAPI spec URL is polled and hashed. When it changes, `oasdiff` produces a structured list of changes: breaking, deprecated, added.
2. **Publish.** The list is served as a feed at `GET /feed/<provider>.json`.
3. **Locate.** Each connected customer repo is searched for calls to the affected endpoints, parameters and enum values.
4. **Patch.** An open model (DeepSeek V4.1 Flash through RunAnywhere's Wally; fallbacks GLM-5.3 Flash, then NVIDIA free endpoints) turns the change plus the matched code into a unified diff.
5. **Verify.** Each repo gets its own **Freestyle VM**. The repo is cloned, dependencies are installed, and a snapshot is taken. The patch is applied and the tests run. If they fail, a new VM is branched from the snapshot and another attempt runs. Failed attempts leave nothing behind.
6. **Ship.** A PR opens on GitHub with the changelog link, the diff, and the test result ("verified in a clean VM").
7. **Dashboard.** A live page shows every repo's progress, attempts, VM id and PR link.

## Real change (this is the main demo; it works)

The judges see a 90-second video, so the real case leads. In OpenAI's public spec (`openai/openai-openapi`, commits `5162af98` of 2026-05-13 to `f601a440` of 2026-10-15), `POST /images/generations` made `model` required and deprecated `user` in favor of `safety_identifier`. Patchbay diffs the two spec versions, publishes the feed, an agent patches a small example repo (ours, `openai-images`), the patch is tested in a clean Freestyle VM against a mock built from the spec, and a PR opens. The run takes about 30 seconds and passed first try in most runs, with a retry in some. Be honest on screen: the spec is trimmed to that one operation, and the repo is our own example, not OpenAI customer code. Detect also ran on the full real Stripe spec (v2300 to v2585): 18 request-side breaking changes and 25 new endpoints found in about 16 seconds, detect only.

Who uses it: the API provider publishes the change; a developer team at a company that integrates the API reviews and merges the PR, or lets auto-merge handle small passing changes (`--merge auto`). Not end users of any app.

The one-sentence difference: "Unlike dependency bots that start from your repo and bump versions, Patchbay starts from the provider's API change and hands every developer team a pull request that is already fixed and tested in a clean VM."

## Simulated demo (secondary)

What follows is the earlier simulated demo with the fake provider Acme Pay and three repos. It is not the lead story; use it only as a second example.

## Demo (simulated Acme Pay, about 3 minutes)

The demo uses a **fake provider, "Acme Pay"**, and three small customer repos (Node, Python, Go). It is not a real Stripe migration; say so if asked. The changes in Acme Pay v2: a request parameter is renamed (`amount_cents` to `amount_minor`), an endpoint is removed (`DELETE /v1/legacy/tokens/{token}`, replaced by `DELETE /v1/tokens/{token}`), and the charge status gains a new value (`requires_review`).

1. A repo that uses Acme Pay, with a changelog nobody read.
2. Flip the provider to v2. The feed updates and shows 2 breaking changes and 1 addition.
3. Dashboard: three repos light up, three Freestyle VMs start in parallel, tests go green. One retry branch is shown if a first attempt fails.
4. Three PRs appear on GitHub. Open one: diff plus test result.
5. Point a second agent at the feed using the `AGENTS.md` snippet and have it handle a fourth repo.
6. Closing line: "The provider ships once. Every customer is patched."

## What is unique

- The provider, not the customer, drives the update. This is not a dependency bot that you set up per repo.
- Fixes are verified in a clean VM before any human sees the PR.
- Many repos are patched in parallel, one VM each.
- No YC Fall 2026 company does this (checked against the live directory on 2026-10-17). Adjacent only: Pomerado (websites to APIs/MCP), Rystic (API simulators for agents), Papaya (agent optimization), OpenHack (AI security engineer). Prior art in older batches and the open source world (dependency bots, SDK generators) covers dependency bumps and SDK generation, not provider-pushed fix PRs for customer code.

## Honest limits (say these before a judge asks)

- Patch quality depends on the model, so the demo uses clear changes: a rename, a removal, a new enum value.
- Fake provider and small repos. Real-world migrations are harder.
- Customers still review and merge every PR.
- Free-tier Freestyle limits (5 running VMs, 5 snapshots) shape how many repos run at once.

## Go-to-market sketch (one slide, not a feature)

Two shapes with the same engine: per-provider agents ("install Acme Pay's update agent") and a neutral service that tracks many vendors, like Dependabot for APIs. First wedge could be fintech and health APIs, where breaking changes cause compliance incidents (PCI, HIPAA integrations). This is a talking point, not something the demo shows.

## Where Freestyle, Wally and other sponsors appear

- **Freestyle:** the sandbox. One VM per repo, snapshot after install, branch on failed attempts, parallel fan-out. Their docs describe cheap snapshots and branching as core strengths, and the demo uses exactly that.
- **RunAnywhere Wally:** the open model that writes the patches.

## Assets that will exist for the video

- Dashboard page (dark theme, built for a projector) at `localhost:8801`.
- The change feed JSON, the unified diffs, GitHub PR pages, and Freestyle dashboard VM list.
- A recorded backup run, due before 4:15 PM.
- Repo and plan: `/Users/tianzefang/Desktop/ClaudeCode/Projects/api-patchbay/` (`PLAN.md` has the build plan and timeline).

## Suggested deliverables for the scripting agent

1. A 3-minute live-demo narration script with timestamps.
2. A 60-second video version for the submission, with on-screen text.
3. 5 to 6 slide outline: problem, idea, agent-first, demo, limits, what's next.
4. Answers to likely judge questions: how is this different from Dependabot, what if the patch is wrong, who pays, why Freestyle, how would it work on a real provider.

Tone: plain, concrete, no hype words. Lead with the failure story (broken integrations nobody noticed), then the fix.
