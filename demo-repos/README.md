# Demo repos (Acme Pay customers)

Each repo is its own git repo, stdlib only, no network. Tests run an in-test stub of Acme Pay for `ACME_API_VERSION` (default `v1`).

| Repo | Test command | Run against v2 (expected to fail until patched) |
|---|---|---|
| `node/` (acme-node-shop) | `./test.sh` (`node --test`) | `ACME_API_VERSION=v2 ./test.sh` |
| `python/` (acme-py-billing) | `./test.sh` (`python3 -m unittest discover -s tests`) | `ACME_API_VERSION=v2 ./test.sh` |
| `go/` (acme-go-checkout) | `./test.sh` (`go test -count=1 ./...`) | `ACME_API_VERSION=v2 ./test.sh` |

Reference fixes: `reference-patches/<lang>.diff`, apply from the repo root with `git apply ../reference-patches/<lang>.diff`.
