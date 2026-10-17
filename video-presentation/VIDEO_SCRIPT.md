# API Patchbay: 90-second video script and run sheet

The judges see only this video, not a live demo. **This is version A: the real OpenAI change.** If the real run fails for any reason, record `VIDEO_SCRIPT_SIMULATED.md` (version B, the Acme Pay fallback) instead. Both fit 90 seconds, so there is no need for extra time. Record the real one first.

Slot: 90 seconds. Deck: `patchbay.pptx` (4 slides, dark theme) in this folder (version B uses `patchbay-simulated.pptx`). Slide 3 carries the one-sentence difference; slide 4 is the close.

Who uses it, in the words to use everywhere: the **API provider** publishes the change; a **developer team** (the engineers at a company that integrates that API) reviews and merges the pull request, or lets auto-merge handle small passing changes. Say "developer team", never "customer" or "users".

## The one sentence (say it once, near the end)

"Dependency bots start from each repo; Patchbay starts from the provider, with one agent-readable change feed that any coding agent can turn into a tested pull request for every developer team."

## The real situation

OpenAI's public spec (openai/openai-openapi, commits 5162af98 of 2026-05-13 to f601a440 of 2026-10-15) changed `POST /images/generations`: `model` became required, and `user` was deprecated in favor of `safety_identifier`. Our small example repo `openai-images` sends `prompt`, `size` and `user` with no `model`, so it breaks. Be honest on screen: the spec is trimmed to that one operation, and the repo is our own small example. Put this as a small caption: "Real OpenAI spec change. Spec trimmed to one endpoint. Example repo."

## Before you record

- [ ] `npm run reset` (closes old PRs, clears runs).
- [ ] `freestyle vm list` and `freestyle snapshot list` are empty.
- [ ] In a Terminal window: `npm run demo:openai`. It starts the dashboard and feed, then waits for Enter.
- [ ] Browser tab 1: `patchbay.pptx` in presentation mode. Tab 2: `http://localhost:8801`. Tab 3: leave empty for the PR page.
- [ ] Browser zoom 110%, notifications off, screen recorder armed.
- [ ] Do one full rehearsal first. After it, run `npm run reset` again.

## Timeline

| Time | On screen | Say | Action |
|---|---|---|---|
| 0:00–0:04 | Slide 1 | "This is API Patchbay." | Start recording. Advance after 3 seconds. |
| 0:04–0:18 | Slide 2 (problem) | "A founder who worked at AWS says over 30% of their downtime came from API changes nobody noticed. Nobody reads changelogs, and fixing it meant every developer team editing their own code." | Advance to the dashboard on the last word. |
| 0:18–0:30 | Dashboard, top banner (green "REAL SPEC CHANGE", the chips 1 breaking and 1 deprecated) and the change feed | "Here is a real change. OpenAI's API now requires a model on image generation and deprecates the user field. Patchbay turns that spec change into a feed any agent can read." | In Terminal press Enter. The banner and the 2 changes appear within a few seconds. |
| 0:30–0:58 | Dashboard, repo card `patchbay-demo-openai-images` (pipeline Locate, Patch, Verify in VM, PR; "Tested in a clean Freestyle VM" badge) | "An agent finds the code in our example repo, writes the fix, and tests it in a clean Freestyle VM. If a test fails, it retries from a snapshot." | Watch the pipeline turn green. The real run takes 20 to 35 seconds. Do not click. If it takes longer than 28 seconds, speed this clip up 2x in the editor and add a small "2x" caption. |
| 0:58–1:12 | PR tab | "The developer team gets a pull request with the diff and the test result. They merge it, or turn on auto-merge for small, passing changes." | Click "Open pull request" on the dashboard card (the Merge button is for developer teams; do not click it). Scroll once to the change table, then to the "Verified in a clean Freestyle VM" line. |
| 1:12–1:30 | Slide 3, then slide 4 | The one sentence above, then: "The provider ships once. Every developer team gets a tested PR." | The dashboard banner also shows the same sentence in small text; use slide 3 for the spoken moment, then slide 4 for the last line. Stop recording. |

Optional 8-second clip, only if the cut is under 90 seconds: an outside agent (Claude Code) fixing a repo it has never seen from the feed alone (`sh scripts/outside-agent/run.sh`, then speed it up). Say: "Any coding agent can use the same feed." It uses the simulated Acme Pay feed, so label it "separate demo".

## Full narration (about 190 words)

> This is API Patchbay.
>
> A founder who worked at AWS says over 30% of their downtime came from API changes nobody noticed. Nobody reads changelogs, and fixing it meant every developer team editing their own code.
>
> Here is a real change. OpenAI's API now requires a model on image generation and deprecates the user field. Patchbay turns that spec change into a feed any agent can read.
>
> An agent finds the code in our example repo, writes the fix, and tests it in a clean Freestyle VM. If a test fails, it retries from a snapshot.
>
> The developer team gets a pull request with the diff and the test result. They merge it, or turn on auto-merge for small, passing changes.
>
> Dependency bots start from each repo; Patchbay starts from the provider, with one agent-readable change feed that any coding agent can turn into a tested pull request for every developer team.
>
> The provider ships once. Every developer team gets a tested PR.

Read it aloud with a timer. If you pass 1:25, cut the sentence "Nobody reads changelogs, and…" down to "Nobody reads changelogs."

## If something goes wrong

- **A VM is slow:** keep talking over the dashboard. If the run is not finished at 0:50, cut to a backup recording of a finished run.
- **A first attempt fails:** good. Say "it retries from the snapshot" and let the retry show. Only a failed retry is a problem; then use the backup.
- **The PR page will not load:** use a screenshot of the PR saved on the desktop.
- **The model is slow or returns 401:** run `wally account login`, or record with `npm run demo:openai -- --sandbox freestyle --patch mock --contract --ship --base autodemo` (saved reference patch, so say nothing about the model).
- **Over 90 seconds:** cut the problem slide to one sentence.

## Likely questions after the video

- **How is this different from Dependabot?** The one sentence above.
- **What if the patch is wrong?** A developer team reviews every PR by default, and a patch that fails tests never becomes one.
- **Who pays?** The API provider, because unread changelogs cost them support time and churn.
- **Is the example real?** The spec change is real OpenAI data (two public commits). The spec is trimmed to one endpoint and the repo is our own small example. We also ran it on a simulated provider (Acme Pay) across three repos.
- **Why Freestyle?** Cheap snapshots and branching let a failed attempt retry without reinstalling, and one VM per repo runs in parallel.

## Files in this folder

- `patchbay.pptx`: the 4-slide deck, built from `_build/build.cjs` (`cd _build && node build.cjs`).
- `patchbay.orig.pptx`: the deck before the vocabulary edits.
- `title-samples.pptx`: the two earlier title-slide samples.
- `logo-amber.png`, `logo-ink.png`: the logo.
