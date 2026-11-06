# Evidence index

What each file in `docs/` shows. Every transaction in these files is on NEAR testnet and can be looked up on [testnet.nearblocks.io](https://testnet.nearblocks.io). Several of the files are read or written by the app and the scripts, so they stay at these paths.

All deployments use the same contract code:

| Deployment | Asset account | Status |
|---|---|---|
| **Current** (6 Nov 2026) | `archive.apw-mw4fsdcz.testnet` | Keyless; funding open until 1 Dec 2026; signed keeper run passed. The app and the README point here |
| Previous final (5 Nov 2026) | `archive.apw-mw3re9ta.testnet` | Keyless; the same signed keeper run passed; funding closed on 6 Nov 2026. Records in `releases/release-20261105/` |
| First keeper-worker deployment (5 Nov) | `archive.apw-mw3r4y86.testnet` | Run stopped by public RPC rate limits (HTTP 429); replaced by the final deployment |
| Original product deployment (5 Nov) | `archive.ap-mw3n0te5.testnet` | End-to-end owner scenario passed; kept as history |
| Very first attempt (5 Nov) | `archive.ap-mw3n08w6.testnet` | The test accounts couldn't prepay the 200 Tgas needed, so no provider accepted; all upkeep was refunded after expiry |
| Capacity benchmarks | `asset.qab-mw3qhtsg-35fb41.testnet` and others | Separate QA assets for the large-state test; never used by the app |

## Start here

| File | What it shows |
|---|---|
| [RELEASE_WORKERS.md](RELEASE_WORKERS.md) | The final deployment, the two signed keeper workers and the owner CLI, with the run's results |
| [SECURITY.md](SECURITY.md) | Trust boundaries and what the prototype does not protect against |
| [ABI.md](ABI.md) | Contract methods, arguments and events |
| [STORAGE.md](STORAGE.md) | How upkeep money, operations balance and storage are kept apart |

## Current deployment (machine records)

| File | What it shows |
|---|---|
| `testnet-config.json` | Current binding: asset ID, code hash, manifest, policy, providers, and the empty access-key list. Read by the server and `testnet-view.mjs` |
| `RELEASE_WORKERS-final-setup.json` | Setup for the final run: accounts used (owner, Bob, both keepers, refund address), manifest, policy and providers |
| `RELEASE_WORKERS-final-deployment.json` | The single keyless create + deploy + initialize transaction |
| `RELEASE_WORKERS-final-config.json` | Binding used by the keeper workers |
| `RELEASE_WORKERS-final-evidence.json` | The full signed run: periods scheduled, NFT handed over to Bob, both keepers challenged, answered and paid, keeper A stopped while B still serves the file |
| `RELEASE_WORKERS-final-summary.json` | Short summary of that run |
| `releases/release-20261105/` | The previous final asset's setup, deployment, binding, run, summary and an earlier rate-limited attempt, unchanged |
| `RELEASE_WORKERS-spare-gas-transfer.json` | A 2 testnet NEAR transfer from the final deployment's root account to the benchmark account, to pay for the final benchmark |
| `integration-status.json` | Which integration levels were reached. Read by the server |

## Keeper restart fixes (after the final review)

| File | What it shows |
|---|---|
| [RELEASE_WORKERS-recovery.md](RELEASE_WORKERS-recovery.md) | The two restart bugs from the final review and how they were fixed |
| `RELEASE_WORKERS-recovery-validation.json` | Local validation of those fixes; no new chain writes |
| `RELEASE_WORKERS-source.json` | Source hashes of the code that made the live run, for comparison |

## First keeper-worker deployment

`RELEASE_WORKERS-config.json`, `RELEASE_WORKERS-setup.json`, `RELEASE_WORKERS-deployment.json` and `RELEASE_WORKERS-evidence.json`: setup, deployment and the run that was stopped by HTTP 429.

## Original product deployment

| File | What it shows |
|---|---|
| `testnet-deployment.json` | Deployment of `archive.ap-mw3n0te5.testnet` |
| `testnet-scenario.json` | Its end-to-end owner scenario (passed). Read by the server |
| `testnet-create-*.json`, `testnet-gas-topup-*.json` | Accounts and gas for Bob, both keepers, the receiver and the refund address |
| `testnet-receiver-deployment.json`, `testnet-receiver-operations.json` | The test receiver contract and calls to it |
| `testnet-initial-attempt.json`, `testnet-initial-config.json`, `testnet-initial-refund.json` | The very first attempt and its refund |
| `faucet-demo-root.json`, `faucet-fixture-root.json` | Faucet funding for the root accounts |
| `releases/original-20261105/` | Copies of this deployment's config and scenario, taken before the final binding replaced them |
| [EVIDENCE.md](EVIDENCE.md) | Narrative of this first cycle |

## Capacity benchmark

| File | What it shows |
|---|---|
| [RELEASE_TESTNET_BENCHMARK.md](RELEASE_TESTNET_BENCHMARK.md) | Report: an earlier build reached the 256-record limit; the final build was not re-tested to 256 |
| `qa-testnet-benchmark-mw3qhtsg-35fb41*.json` | The main run: 81 per-transaction records (`-tx-NNN`), pending and recovery transactions, result and faucet records |
| `qa-testnet-benchmark-mw3rk8hv-89685b*.json` | Partial run on the final build (reached 16 records before rate limits), then cleanup |
| `qa-testnet-benchmark-mw3rw8h2-a5de2a*.json` | A run that stopped on faucet cooldown |
| `qa-testnet-benchmark-final-disposition.json` | Records that the final-build 256-record test was left unverified |

## Local checks

| File | What it shows |
|---|---|
| `local-scenario.json` | The local outage and refund scenario (`pnpm scenario`) |
| `restart-evidence.json` | State survives an app restart |
| `ui-evidence.json` | Browser UI checks |

## Design and review notes

| File | What it covers |
|---|---|
| [BACKEND.md](BACKEND.md), [UI.md](UI.md), [OPERATIONS.md](OPERATIONS.md), [DEMO.md](DEMO.md) | Local ledger and keepers, the browser app, operations, and a demo walkthrough |
| [RELEASE_CORE.md](RELEASE_CORE.md), [RELEASE_OPERATIONS.md](RELEASE_OPERATIONS.md) | Changes made after review, and backup and restore |
| [ASTRA_RELEASE_REVIEW.md](ASTRA_RELEASE_REVIEW.md), [ASTRA_FINAL_GATE.md](ASTRA_FINAL_GATE.md) | The two review passes and their findings; `ASTRA_FINAL_GATE-repro.*` reproduces one of them |

Fresh-install, restore, dependency and browser checks are in [`../release-qa/`](../release-qa/).
