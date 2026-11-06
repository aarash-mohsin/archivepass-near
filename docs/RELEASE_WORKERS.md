# Automatic signed testnet workers and reusable owner operations

This release adds a real signed NEAR testnet transport to the existing keeper engine. The application’s local role selector remains a simulation; it does not select an onchain signer. The provider worker is a separate operator-controlled process with one explicitly supplied dedicated testnet key. The browser never receives that key, and the application API does not sign as a user.

## Deployment and binding

The final verification binding is `RELEASE_WORKERS-final-config.json`; complete setup/deployment/outcomes are recorded under `RELEASE_WORKERS-final-*.json`. The final asset uses the parent-reviewed266,288-byte WASM SHA-256 `6b35856cc8d713b123a5431b525a6f3dc6393110d3f11a46e50f64cf9a07cad3`, with50Tgas payment/NFT callbacks and minimum120Tgas claim /175Tgas transfer-call guards. The account is created atomically without AddKey. Original immutable deployments and their evidence are preserved separately.

The binding fixes network `testnet`, RPC `https://test.rpc.fastnear.com`, actual contract ID/code hash, immutable manifest/policy hashes, eligible providers, exact content-source origin and one source UUID. Imported bytes are downloaded from that explicitly configured source, then independently verified against the **actual chain manifest**, not the source application's local owner or ledger. The UUID is an offchain content lookup identity; the NFT account is the recorded contract ID.

Before signing, the adapter reads authoritative finalized chain state and validates current owner/epoch or fixed provider eligibility, code/key binding, immutable policy/content and action timing. Immutable code/key/network observations may be reused for30seconds after actual keyless verification; mutable state is freshly read for signing. Ordinary reads have a one-second cache with their original observed block time. RPC reads are paced and back off on rate limits. Errors never become local-ledger success.

## Run two actual keepers

Run from the ArchivePass project folder, with its configured public content source available. Each command is a separate process, database and content directory:

```powershell
node keeper/testnet-main.ts --binding docs/RELEASE_WORKERS-final-config.json --key .secrets/release-worker-a.json --provider a.apw-mw3r4y86.testnet --data-dir data/release-workers-final/a --port 8981
node keeper/testnet-main.ts --binding docs/RELEASE_WORKERS-final-config.json --key .secrets/release-worker-b.json --provider b.apw-mw3r4y86.testnet --data-dir data/release-workers-final/b --port 8982
```

Do not run both commands in one blocking shell line; use separate terminals/process supervision. `/health` reports actual network/contract/signer binding, observed chain time and unresolved transaction count/hash. `/archives/<bound-source-uuid>/download` serves actual keeper-local bytes. Status/proof paths remain restricted to known imported IDs and the fixed binding. Operator controls use a generated local token stored inside each ignored worker directory unless explicitly supplied; no shared public default credential is used.

The workers automatically accept affordable approved future commitments assigned to their own fixed provider, open eligible challenges, build responses from independently verified local files, sign/submit proofs and claim fixed earned credit. They do not propose new spending or pick a payee. Existing obligations survive caretaker transfer. Missing bytes and a stopped server do not grant a payment; administrative expiry/earned-credit handling remains independent of content. Both development processes run on one computer, so this is not evidence of independent infrastructure or continuous availability.

## Transaction persistence and restart

The SDK signs a transaction whose exact command, nonce, public signed bytes and hash are durably committed before broadcast. No private key is written into this SQLite transaction journal or public evidence. A process-level lock prevents simultaneous use of the same key file. After a crash, a stale lock is recovered only after its owning process is no longer running.

`Broadcasting` or `Unknown` outcomes are looked up by the **same hash and signer** at FINAL execution. They cannot be replaced by a new signature because of timeout. A different unresolved prepared intent also blocks new signatures. A transaction that was durably Prepared but not marked for dispatch may be resumed with its exact bytes and original request identity. Unknown outcomes remain unresolved when the RPC cannot establish finality; there is no force-failure reset.

Finalized guard failures can be attempted in a new recorded generation only after fresh authoritative state is eligible. A worker never reuses a failed HTTP result as proof that new funds were paid. Provider claims remain fixed to the contract’s creditor; caller-supplied recipients are rejected. A successful submitted transaction is not assumed to mean every downstream receipt succeeded.

For a provider backup, stop that worker and preserve its entire matching data directory: `keeper.sqlite`, `testnet-transactions.sqlite`, any remaining WAL/shm files and blobs. Preserve the private signer key separately, never in public evidence. Restore to a new directory with the same binding/provider/source configuration; do not merge journals or run both copies with one key. A focused stopped-journal restore test verifies that an Unknown hash copied to a new directory reconciles exactly once with no second signature/broadcast. This is distinct from the full local application backup/restore commands. A live copy of only the SQLite main file is not a safe backup procedure.

## Reusable owner CLI

Write a command JSON file, then prepare/review it without broadcasting:

```powershell
node scripts/near-operator.mjs --binding docs/RELEASE_WORKERS-final-config.json --key .secrets/release-worker-bob.json --state-dir data/release-workers-final/operator-bob --command-file proposal.json
```

Example future-period command (derive the current epoch, a sufficiently future slot and available budget from live state):

```json
{"type":"propose_period","expected_owner_epoch":"3","provider_id":"b.apw-mw3r4y86.testnet","slot":"12","rate":"1000000000000000000000"}
```

The example epoch/slot is illustrative and will become stale. A slot starts at `service_origin + slot * period_duration`; allow at least60seconds for worker observation/consent. Never describe a120-second demonstration period as a month of service.

After reviewing the exact account, method, arguments, gas and attached deposit, add `--execute`. Supply a stable UUID with `--request-id` when you need explicit retry/recovery identity. Retry the **same body and request ID** after uncertain transport; a deliberate new action needs a new ID. The executable prints the identity before dispatch. Different signer/binding histories require separate state directories.

Supported commands are finite: upkeep/operations funding, eligible-provider configuration, future period proposal, provider consent/response, permissionless open/expiry/finalization, fixed claims and NFT transfers. Arbitrary methods, contract/RPC overrides and claim-recipient overrides are not accepted. Actual current ownership/provider checks are enforced again by the contract. Preview is not execution authorization for a later changed body.

Inspect/reconcile existing transaction hashes without creating a new chain transaction:

```powershell
node scripts/near-operator.mjs --binding docs/RELEASE_WORKERS-final-config.json --key .secrets/release-worker-bob.json --state-dir data/release-workers-final/operator-bob --status
```

This operator adapter intentionally uses explicit dedicated full-access testnet keys outside browser-controlled input. Production browser wallet integration and key-management UX are a separate feature. Never import a mainnet wallet or share these ignored credentials with a public frontend.

## Verification and remaining boundaries

The final actual run **passed at2026-11-05T16:50:51.648Z** on `archive.apw-mw3re9ta.testnet`, code hash `8DVxZxb2nD3zST8tky1jPTbWvLJfs8vfLXzrB7AMgSNN`, with zero access keys. Bob owns the NFT at epoch3. The final journal includes seven providerA and ten providerB signed attempts across the preserved timed attempts and successful continuation; all recorded worker outcomes reached FINAL. The successful continuation verified three automatic0.001NEAR provider payments, one genuinely missed unpaid period and unchanged fixed obligations across handover. Of0.02 accepted upkeep,0.003 was paid and0.017 remains available; no reserved, earned, refund or pending liability remains. Actual account balance `6517000000000000000000011`yoctoNEAR equals6.5 operational NEAR +0.017 upkeep +11 security yocto.

The initial old-artifact baseline and first final-artifact timed attempt encountered public RPC rate limits. Their status/error records are preserved; they are not passing release evidence. The successful continuation used later immutable grid slots6/7 on the same correct final asset, after releasing genuinely expired earlier commitments. No provider state, deadline, receipt or outcome was fabricated or reset. Final source identities and focused-test results are recorded in `RELEASE_WORKERS-source.json`; concise outcome totals are in `RELEASE_WORKERS-final-summary.json`.

The QA runner stops its owned worker processes on completion, including the deliberately stopped provider. Restart the two documented commands for ongoing service and future caretaker operations. The finite one-day expiry was deliberately left in the future; this run does not claim a new final-asset expiry refund already occurred.

`tests/server/testnet-worker.test.mjs` covers persisted-before-dispatch identity; lost claim response and restart exactly once; Unknown/no replacement; wrong network/code/provider/content/policy; actor/source spoofing; finite CLI command parsing; concurrent calls; body conflicts; read-only status; and non-final execution remaining Unknown. Mock transport tests do not claim live receipt execution.

`qa-testnet-workers.mjs --run --final` separately exercises real worker processes and finalized transactions. A dedicated test-only post-broadcast response-loss injection exits workerA with86 after a transaction genuinely executes, leaving its hash Unknown locally; restart must reconcile that hash rather than sign another acceptance. The injection requires an explicit QA environment flag and a QA fixture binding, is tagged once per QA run, and does not invent a receipt or payment.

The QA flow preserves any earlier rate-limited timed attempt, releases genuinely expired commitments, schedules new future slots on the same one-day immutable asset, transfers actual stewardship, and has the new owner schedule a later period. It verifies automatic proofs/claims by both providers, an actual stopped-worker outage, a surviving complete download and an unpaid missed period. Read the machine-readable evidence's exact `status` and outcomes rather than inferring completion from deployment alone.

The demonstration leaves a finite unused reserve for future service instead of waiting a day to expire it. Refund behavior has separate native/local/earlier-testnet evidence. No public hosting, browser chain-signing, permanent storage, independent replica guarantee, mainnet funds or factory is introduced here. The source file and process availability remain real operational dependencies.
