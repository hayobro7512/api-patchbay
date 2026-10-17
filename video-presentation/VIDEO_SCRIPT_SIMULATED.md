# API Patchbay: 90-second video script, version B (simulated provider, fallback)

Use this only if the real OpenAI run in `VIDEO_SCRIPT.md` (version A) will not work. It shows the same product on a fake provider, **Acme Pay**, across three small repos (Node, Python, Go). Say "simulated" out loud and show it in a caption, so nobody thinks it is a real company's API.

Slot: 90 seconds, same as version A. Deck: `patchbay-simulated.pptx` in this folder (same 4 slides; slide 3 shows the Acme Pay field rename instead of the OpenAI one). Words to use: the **API provider** publishes the change; a **developer team** reviews and merges the PR, or lets auto-merge handle small passing changes. Never say "customer" or "users".

## The one sentence (say it once, near the end)

"Dependency bots start from each repo; Patchbay starts from the provider, with one agent-readable change feed that any coding agent can turn into a tested pull request for every developer team."

## The simulated situation

Acme Pay v2 renames a request field (`amount_cents` to `amount_minor`), removes an endpoint (`DELETE /v1/legacy/tokens/{token}`, replaced by `DELETE /v1/tokens/{token}`), and adds a charge status (`requires_review`). Three repos use v1: `patchbay-demo-node`, `-python`, `-go`. Caption on screen: "Simulated provider (Acme Pay). Example repos."

## Before you record

- [ ] `npm run reset` (provider back to v1, old PRs closed, runs cleared).
- [ ] `freestyle vm list` and `freestyle snapshot list` are empty.
- [ ] Terminal 1: `npm run demo`. Wait for the provider, dashboard and feed URLs.
- [ ] Terminal 2 (visible, command typed, not yet run): `npm run flip`.
- [ ] Browser tab 1: `patchbay-simulated.pptx` in presentation mode. Tab 2: `http://localhost:8801` (shows "No runs yet" until the flip). Tab 3: empty, for the PR page.
- [ ] Browser zoom 110%, notifications off, screen recorder armed. Do one full rehearsal, then `npm run reset` again.

## Timeline

| Time | On screen | Say | Action |
|---|---|---|---|
| 0:00–0:04 | Slide 1 | "This is API Patchbay." | Start recording. Advance after 3 seconds. |
| 0:04–0:18 | Slide 2 (problem) | "A founder who worked at AWS says over 30% of their downtime came from API changes nobody noticed. Nobody reads changelogs, and fixing it meant every developer team editing their own code." | Advance to the dashboard on the last word. |
| 0:18–0:30 | Dashboard (empty), then the banner "SIMULATED PROVIDER" and the change feed | "This is a simulated provider, Acme Pay, so the demo is repeatable. It just shipped v2: a renamed field, a removed endpoint, a new status. Patchbay turns that spec change into a feed any agent can read." | In Terminal 2 press Enter on `npm run flip`. The banner, chips (2 breaking, 2 added) and the 4 changes appear. |
| 0:30–0:58 | Dashboard, three repo cards | "An agent finds the code in each repo, writes the fix, and tests it in a clean Freestyle VM. If a test fails, it retries from a snapshot." | Watch all three cards turn green. The real run takes 40 to 80 seconds and a retry on one repo is normal. Record the whole run, then speed this clip up 2x in the editor with a small "2x" caption. Do not click. |
| 0:58–1:12 | PR tab | "Each developer team gets a pull request with the diff and the test result. They merge it, or turn on auto-merge for small, passing changes." | Click "Open pull request" on any card (do not click Merge). Scroll to the change table, then to the "Verified in a clean Freestyle VM" line. |
| 1:12–1:30 | Slide 3, then slide 4 | The one sentence above, then: "The provider ships once. Every developer team gets a tested PR." | Show slide 3 for the sentence, then slide 4. Stop recording. |

Optional 8-second clip, only if under 90 seconds: an outside agent (Claude Code) fixing a repo it has never seen from the feed alone (`sh scripts/outside-agent/run.sh`, sped up). Say: "Any coding agent can use the same feed."

## Full narration (about 190 words)

> This is API Patchbay.
>
> A founder who worked at AWS says over 30% of their downtime came from API changes nobody noticed. Nobody reads changelogs, and fixing it meant every developer team editing their own code.
>
> This is a simulated provider, Acme Pay, so the demo is repeatable. It just shipped v2: a renamed field, a removed endpoint, a new status. Patchbay turns that spec change into a feed any agent can read.
>
> An agent finds the code in each repo, writes the fix, and tests it in a clean Freestyle VM. If a test fails, it retries from a snapshot.
>
> Each developer team gets a pull request with the diff and the test result. They merge it, or turn on auto-merge for small, passing changes.
>
> Dependency bots start from each repo; Patchbay starts from the provider, with one agent-readable change feed that any coding agent can turn into a tested pull request for every developer team.
>
> The provider ships once. Every developer team gets a tested PR.

If you pass 1:25, cut "Nobody reads changelogs, and…" down to "Nobody reads changelogs."

## If something goes wrong

- **A VM is slow:** keep talking over the dashboard; if the run is not finished at 0:50, use the 2x clip of a finished run.
- **One repo fails twice:** record again; if it keeps failing, run `node src/run.mjs --sandbox freestyle --patch mock --contract --ship` (saved reference patches, say nothing about the model) and record that.
- **The PR page will not load:** use a screenshot of the PR saved on the desktop.
- **Freestyle is down:** run with `--sandbox local` (`node src/run.mjs --sandbox local --patch live --contract --ship`) and drop the VM claim from the narration.

## Likely questions after the video

- **Is it real?** The provider is simulated so the demo is repeatable. The pipeline is the same one that ran on a real OpenAI spec change (version A) and detect also ran on the real Stripe spec.
- **How is this different from Dependabot?** The one sentence above.
- **Who pays?** The API provider.
