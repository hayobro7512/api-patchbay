# Judge Q&A and demo fallback checklist

Answers use only what the build actually does. Numbers come from runs on 2026-10-17.

## Likely questions

**Why not Dependabot or Renovate?**
Those bump dependency versions for you. They don't read a provider's API changes and rewrite the calling code. Here the provider publishes a structured change feed, and an agent fixes the customer's code, proves the fix in a VM, and opens the PR. The provider drives it.

**Why not just tell Claude Code or Devin "migrate to Acme v2"?**
You can, and our outside-agent demo does exactly that, but with the feed. The feed is the product: a small, versioned file any agent can read, so the provider's changes arrive as data and not as a changelog nobody reads. The agent is replaceable. The standard is not.

**What proves the patch is correct?**
Tests run in a clean Freestyle VM against a mock API generated from the provider's published OpenAPI spec (unknown endpoints return 404, bad or unknown fields return 400, enum values come from the spec). The customer's own tests must pass, and a human still reviews the PR.

**What if the model writes a wrong patch?**
The VM tests fail, the test log goes back to the model, and it tries again from a snapshot (up to 3 attempts). In a live run Python failed once and passed on the retry; in earlier model-only tests DeepSeek V4.1 Flash passed 8 of 9 first tries. If all attempts fail, the repo is marked failed and no PR opens.

**Who pays?**
API providers. They lose support time and customer trust when changes break integrations, and they want faster adoption of new features.

**Why Freestyle?**
One VM per customer repo gives isolation and parallel fan-out. Snapshot after install, then fork on retry. Their docs list snapshotting and branching as core. VM create, snapshot and fork each took about a second in our runs.

**Does it work on a real provider?**
Not yet. The demo uses a fake provider (Acme Pay) and three small repos so the changes are deterministic. Real migrations are harder. Next step is running detect on a real public spec such as Stripe's to show it works.

**How do you find providers' specs?**
For the demo the provider registers its spec URL. Otherwise: public spec repos on GitHub, directories such as APIs.guru, or common paths like `/openapi.json`.

**Is it safe to give an agent repo access?**
It never edits main. It opens a PR, and the code runs in an isolated VM. No GitHub token or credential goes into the VM; the repo is uploaded as an archive.

**What did you build in a day?**
The whole pipeline: detect, feed, patch, verify, ship, dashboard and the outside-agent proof. Solo, with subagents.

**Who is the customer? Regular users of an app like Uber can't merge a PR.**
Right: they never see it. The customer is the developer team inside a company that integrates an API (a payments, maps or messaging API, for example). An engineer on that team reviews the PR the same way they review a Dependabot update. The buyers are API providers, who pay to cut support load and speed up feature adoption, and integration or platform teams that maintain many third-party integrations.

**Can it merge without human review?**
Yes, as an opt-in policy: `--merge auto`. Patchbay merges only if the tests passed in the VM and the diff is at most N changed lines (default 200); otherwise the PR stays open for a human. Default is human review. A team could also require its own CI first through branch protection. In the demo, auto-merge targets a throwaway `autodemo` branch so `main` stays clean.

**How does it know what changed?**
It diffs the old and new OpenAPI spec (`oasdiff`), which lists every endpoint, parameter, required field and enum value that changed. It does not guess. It can't see changes that are not in the spec (behavior, rate limits), and providers without a public spec are out of scope.

## Do not claim

- A real Stripe or other real-provider migration.
- A partnership with any API provider.
- That every patch passes first try.
- Anything about scale beyond the 3 or 4 demo repos.

## Fallback checklist (demo goes wrong)

1. Dashboard blank: check `runs/logs/dashboard.log`, restart `npm run demo`.
2. Freestyle slow or failing: re-run with local sandbox: `node src/run.mjs --sandbox local --patch live --contract`. Say so honestly.
3. Model slow or 401: `wally account login`, or run with `--patch mock` (uses the saved reference patches; say so honestly).
4. GitHub PR step fails: run without `--ship`; the dashboard still shows verified results.
5. Everything fails: play the backup video, then show the repo and one PR.
6. Before any live demo: `npm run reset`, then `npm run demo`, then `npm run flip`. After: `npm run reset`.
7. Run `freestyle vm list` and `freestyle snapshot list`. The Free plan holds 5 each; delete leftovers.
