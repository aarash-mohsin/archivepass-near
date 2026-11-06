# Verification evidence — 5 November 2026

> Historical first-cycle evidence below. Post-Astra release fixes, new deployments and current QA are recorded in the `RELEASE_*.md` documents in this folder and [workspace reproducibility QA](../release-qa/REPRODUCIBILITY.md). Earlier receipt/account/hash claims apply to their original artifacts.

ArchivePass is a working prototype with separately recorded local, native Rust, WASM and actual NEAR testnet evidence. It is not an audit or a mainnet deployment.

| Gate | Actual result |
|---|---|
| JS/TS tests | **31 passed, 0 failed**: 22 backend/HTTP/keeper/chain-reader, 3 shared protocol/money, 6 browser workflow helpers |
| TypeScript / production browser build | Both strict configurations and Vite build passed |
| Rust | **18 native tests passed**, including all five cross-language vectors, reserve/claims, ownership/transfer-call and callback cases |
| Optimized WASM | Primary and receiver actually built; hashes below |
| Persistent local vertical scenario | Passed real upload, two copies, proof across handover, stale-owner/replay rejection, failed simulated payout/retry, actual keeper outage, surviving download and fixed expiry refund |
| Actual restart | All three complete asset exports matched before/after restarting API and both keeper processes; both keeper copies still served exact verified bytes |
| Browser | Real file creation/review/upload, browser/server hash agreement, funding, full keeper download/SHA-256, live testnet state, and mobile transfer verified |
| Responsive | Real 360px iframe: application clientWidth345/scrollWidth345 before and after successful mobile handover; no horizontal page overflow in that flow |
| Actual testnet | **Passed: 30 finalized workflow transactions**, plus deployment/setup receipts; real provider consent, challenges, invalid/replayed proof rejection, NFT handover, fixed native payouts, missed period and expiry refund |
| Live transfer-call | Return, malformed result, receiver panic, temporary-holder proposal attack, forwarding and keep/back-transfer all exercised on testnet |
| Keyless asset account | Actual empty access-key list and matching code hash, checked after deployment, at scenario completion and in the browser's live RPC view |
| Sandbox receipt simulator | Not run; native unit tests and actual testnet are recorded separately |
| Automatic signed testnet keeper scheduler | Not implemented; local keeper workers are automatic, actual testnet signing uses the dedicated scenario CLI |
| Actual failed native transfer/retry | Not exercised on testnet; failure restoration and recovery passed local durable tests and native Rust callback tests |
| Transfer during in-flight native payment | Native unit coverage; deterministic live interleaving not exercised |
| Worst-case receipt gas | Native boundary/storage tests passed; maximum-depth proof receipt gas was not measured on testnet |
| Mainnet / public hosting / submission | Not performed |

## Actual deployed asset

Current asset: **`archive.ap-mw3n0te5.testnet`**. Final NFT owner: `bob.ap-mw3n08w6.testnet`, ownership epoch13. RPC: `https://test.rpc.fastnear.com` (chain ID testnet verified). Code hash: `2iRwF8XgJr95YHmxbiLtSTe5Rae47o84aH7b1N5yrn2X`.

The dedicated asset was created with one transaction batch: CreateAccount, Transfer6.5 faucet NEAR for operations, DeployContract and `new`. **No AddKey action was included.** The contract has no upgrade, delete-account, generic execution or owner withdrawal method. Caretaker/provider/test-receiver accounts retain separate dedicated test keys; this does not put an access key on the asset.

The primary file is the committed original CC0 stewardship guide, 2,937bytes/three chunks. SHA-256 `613d3d09c8774dd2af511845c984555d9c6017cc470243ea181bce76818023f4`; Merkle root `dc891c97cec1f21834ae5f028122c160d9ed290863b4c3663d0a4d43f8a83a6f`; manifest digest `78775dd9a9369986e660da98bd4b37b77756a1ca7e343dfe330a4d4b6157b142`. Testnet proofs were fetched from the actual localhost keeper copies of these bytes and signed by the fixed testnet provider accounts. This is testnet settlement with local HTTP keepers, not decentralized public hosting.

Each of two providers earned and received exactly0.001NEAR after stewardship changed. A second period for providerA remained unanswered and earned zero. At fixed expiry the beneficiary received0.008NEAR. Final principal accounting:

```text
Accepted upkeep:                 0.010 NEAR
Provider payments:               0.002 NEAR
Fixed-beneficiary unused refund: 0.008 NEAR
Available/reserved/earned/pending liabilities: 0
Conservation residual: 0
```

Final account amount was `6500000000000000000000012`yoctoNEAR:6.5 operational NEAR plus12 one-yocto security deposits. This is separate from the fully paid0.01 upkeep principal. Recorded storage budget519,751bytes requires `5197510000000000000000000`yoctoNEAR; application future-state allowance260,000bytes and native stress fixture192,293bytes. See STORAGE.md for bounds and measurement limits.

## Public receipt files

- `testnet-deployment.json`: current actual atomic deployment, WASM digest, immutable initialization and complete finalized outcome.
- `testnet-config.json`: current public identities, code hash, manifest/policy, observed keys and storage quote.
- `testnet-scenario.json`:32 recorded steps,30 transaction outcomes and exact provider balance deltas; completed at2026-11-05T14:54:07.154Z.
- `testnet-receiver-deployment.json`: actual receiver fixture code deployment.
- `local-scenario.json`: real-time local handover/outage/refund scenario; native delivery explicitly simulated there.
- `restart-evidence.json`: actual process restart equality/byte checks.
- `ui-evidence.json`: browser observations and actual-width measurement.

The initial live attempt used `archive.ap-mw3n08w6.testnet`. Its providers had insufficient balance to prepay the requested gas limit, so it stopped before provider acceptance/earning. All0.01 upkeep was returned to its fixed beneficiary after its unchanged expiry. `testnet-initial-attempt.json`, `testnet-initial-config.json` and `testnet-initial-refund.json` preserve that attempt, observed state and finalized refund outcomes. The current deployment record describes the subsequent successful asset. No initial deployment transaction hash is inferred from the state snapshot. Operational funds on the keyless initial test asset remain non-withdrawable by design.

## Built artifacts

- Primary: `contract/target/near/archivepass.wasm`,259,651bytes, SHA-256 `1978b1c8049dc89fc00757f7724efa715bd36d97bd6b7b26903fbdb8083abc94`.
- Receiver: `contract/target/near/archivepass_receiver/archivepass_receiver.wasm`,113,561bytes, SHA-256 `9b5b010ae85bb4e4b4159021e868b8083e2ba1cfec7fde1473e2864f95dc224c`.

Fixtures use explicit canonical byte encodings and deterministic bytes at sizes1,1024,1025,2500 and16777216. TypeScript hashes are additionally checked against Nodecrypto; Rust independently consumes and verifies the committed manifest/Merkle/challenge fixtures. Tests do not generate fresh expected hashes during assertions.

Sampled response acceptance, full browser retrieval, process health, standard NFT behavior and keylessness are different observations. None implies permanent storage, continuous uptime, independent operators or an independently audited contract.
