#!/bin/sh
# Return to a clean pre-demo state: provider back to v1, PRs closed and branches deleted, old runs removed.
cd "$(dirname "$0")/.." || exit 1
export PATH="$PATH:/opt/homebrew/bin"
sh scripts/flip.sh v1 2>/dev/null
sh src/ship/reset.sh
# remove every run folder (helper test runs included); keep the feed and logs
for d in runs/*/; do case "$d" in runs/feed/|runs/logs/) ;; *) rm -rf "$d" ;; esac; done
echo "reset done"
