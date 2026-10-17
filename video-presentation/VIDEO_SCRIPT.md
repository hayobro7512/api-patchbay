# API Patchbay: 90-second video script and run sheet

Slot: 90 seconds total, no extra time for questions in the slot. Deck: `patchbay.pptx` (4 slides, dark theme) in this folder.

## Before you record

Do these first so nothing is slow on camera.

- [ ] Open `patchbay.pptx` in presentation mode in one browser or app window, on slide 1.
- [ ] `npm run reset`, then `npm run demo` in a Terminal window. Dashboard open in a second tab at `localhost:8801`; before the flip it shows "No runs yet" (no queued cards).
- [ ] The v1 to v2 switch is `npm run flip`. Keep a second Terminal window ready with the command typed, so you only press Enter.
- [ ] No VM pre-warming is needed: each run creates its VMs (about a second each). Just make sure `freestyle vm list` and `freestyle snapshot list` are empty (the Free plan caps at 5 each).
- [ ] The real run takes about 60 seconds from flip to three PRs, but the slot gives it about 30. Record the dashboard section on its own and speed it up 2x in the editor, with a small "2x" caption. Do not hide that it is sped up.
- [ ] One pull request page open in a third tab (the one you will show), already created in a rehearsal run.
- [ ] Outside-agent clip (Claude Code or Wally reading the feed and patching the fourth repo) exported as an 8-second video and ready to play.
- [ ] Backup recording of a full successful run, one keypress away.
- [ ] Notifications off, browser zoom at 110% so text reads on a projector, screen recorder armed.

## Timeline

| Time | On screen | Say | Action |
|---|---|---|---|
| 0:00–0:03 | Slide 1 (title) | "This is API Patchbay." | Start recording. Advance after 3 seconds. |
| 0:03–0:13 | Slide 2 (problem) | "A founder who worked at AWS says over 30% of their downtime came from API changes nobody noticed. Changelogs don't get read, and fixing it meant editing every customer's code. Now agents can." | Advance to the dashboard on the last word. |
| 0:13–0:23 | Dashboard, feed panel | "Patchbay turns the provider's spec change into a feed built for agents. Acme Pay just shipped v2." | Flip the provider to v2 (`npm run flip`). The feed shows 2 breaking changes and 2 additions. |
| 0:23–0:55 | Dashboard, three repo cards | "Our agent finds the affected code in each repo, writes a patch, and tests it in a clean Freestyle VM. If a test fails, it branches from a snapshot and tries again." | Watch the three repos move through locating, patching, verifying, passed. Do not click anything. |
| 0:55–1:10 | PR tab | "Each customer gets a pull request with the diff and the test result. They review and merge." | Switch to the PR tab. Scroll once to the diff, then to the "verified in a clean VM" line. |
| 1:10–1:20 | Outside-agent clip | "Any coding agent can use the feed. This one has never seen this repo." | Play the 8-second clip. |
| 1:20–1:30 | Slide 4 (next steps) | "Next: real providers, starting with Stripe's public spec. The provider pays. The provider ships once, and every customer is patched." | Switch to slide 4. Stop recording on the last word. |

Slide 3 (the four-step flow) is optional. Use it only if the demo runs short; it explains the same thing the dashboard shows.

## Full narration

About 190 words at a calm pace. Read it aloud with a timer; if you pass 1:25, cut the first sentence of the 0:03 line.

> This is API Patchbay.
>
> A founder who worked at AWS says over 30% of their downtime came from API changes nobody noticed. Changelogs don't get read, and fixing it meant editing every customer's code. Now agents can.
>
> Patchbay turns the provider's spec change into a feed built for agents. Acme Pay just shipped v2.
>
> Our agent finds the affected code in each repo, writes a patch, and tests it in a clean Freestyle VM. If a test fails, it branches from a snapshot and tries again.
>
> Each customer gets a pull request with the diff and the test result. They review and merge.
>
> Any coding agent can use the feed. This one has never seen this repo.
>
> Next: real providers, starting with Stripe's public spec. The provider pays. The provider ships once, and every customer is patched.

## If something goes wrong

- **A VM is slow:** keep talking over the dashboard, and if a repo is still running at 0:50, cut to the finished state from the backup recording.
- **A repo fails its tests:** say "it retries from the snapshot", and let the retry show. Only a retry that also fails is a problem; cut to the backup.
- **The PR page will not load:** use a screenshot of the PR, already saved on the desktop.
- **The outside-agent clip is missing:** skip the 1:10 line and give that time to the PR step.
- **Running over 90 seconds:** drop slide 4's second half ("The provider pays") and end on the closing line.

## Likely questions after the slot

Short answers, one sentence each.

- **How is this different from Dependabot?** Dependabot starts from the customer and bumps versions. Patchbay starts from the provider and fixes the code, then proves the fix in a VM.
- **What if the patch is wrong?** A human reviews every PR, and a patch that fails tests never becomes one.
- **Who pays?** The API provider, because unread changelogs cost them support time and churn.
- **Is the provider real?** No, Acme Pay is fake so the demo is repeatable. The feed format is the real product, and Stripe is next.
- **Why Freestyle?** Cheap snapshots and branching let a failed attempt retry without re-installing, and one VM per repo runs in parallel.

## Files in this folder

- `patchbay.pptx`: the 4-slide deck (title, problem, solution flow, next steps).
- `title-samples.pptx`: the two earlier title-slide samples (dark and light).
- `logo-amber.png`, `logo-ink.png`: the logo, transparent PNG.
