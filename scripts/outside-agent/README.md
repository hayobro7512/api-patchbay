# Outside agent proof
Run `sh scripts/outside-agent/run.sh` (needs `claude` on PATH; or set `AGENT_CMD="wally claude-code -m deepseek-v4.1-flash --"`-style command that takes the prompt as last arg).
It serves the feed on :8803 (starts the server if needed), clones `demo-repos/openai-images-py` (the real OpenAI change) to a temp dir; `PROVIDER=acme-pay` switches to the simulated provider and `demo-repos/node-storefront`, and drops in an AGENTS.md made from `src/feed/AGENTS.snippet.md`.
The agent gets only that AGENTS.md and a short prompt; it fetches the feed, edits the code and runs `ACME_API_VERSION=v2 ./test.sh`.
The audience sees the agent's final summary, the `git diff --stat`, and a PASS/FAIL line with elapsed time. Log: `runs/outside-agent/*.log`.
Env: `REPO_SRC` (use another repo or the GitHub clone URL), `AGENT_TIMEOUT` seconds (default 240), `FEED_PORT`.
