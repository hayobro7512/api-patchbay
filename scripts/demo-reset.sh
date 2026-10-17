#!/bin/sh
# Return to a clean pre-demo state: provider back to v1, PRs closed and branches deleted, old runs removed.
cd "$(dirname "$0")/.." || exit 1
export PATH="$PATH:/opt/homebrew/bin"
sh scripts/flip.sh v1 2>/dev/null
sh src/ship/reset.sh
rm -rf runs/run-* runs/specs runs/outside-agent
echo "reset done"
