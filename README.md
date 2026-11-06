# ArchivePass

Transfer a public archive's stewardship together with its restricted upkeep budget and existing provider obligations. Built for **NFTs That Do Something**. The separate **AllTogether** project in `../alltogether` is our other hackathon project; these have independent packages, contracts, keys, databases and applications.

The app supports real public-file uploads, immutable SHA-256/Merkle manifests, finite funding under fixed provider/rate/expiry rules, provider consent and content challenges, fixed-payee claims, stewardship transfers, verified downloads and complete history. Two separate HTTP keeper processes import and serve their own actual file copies. A missed response earns nothing. Existing commitments and claims survive an NFT transfer.

The browser application uses an explicitly labeled persistent **local test ledger and demo identities**. Native payments there are simulated. The separate Rust contract, reusable owner CLI and automatic signed provider workers execute genuine NEAR testnet operations with dedicated faucet accounts. The read-only **Testnet evidence** view reads the deployed contract; selecting a local role never signs a blockchain transaction.

Sampled chunk responses do not establish full-file availability, continuous uptime, independent replicas or permanent storage. Full download/hash verification in the browser is a separate observation. Eligible providers can collude with caretakers or fetch public bytes elsewhere. Both development keepers run on the same computer.

Current release: **75 application tests and 21 native contract tests passed**. See [signed worker runbook and evidence](docs/RELEASE_WORKERS.md), [capacity/gas benchmark](docs/RELEASE_TESTNET_BENCHMARK.md), [operations](docs/RELEASE_OPERATIONS.md), and [fresh installation/restore QA](release-qa/REPRODUCIBILITY.md). The user chose to leave the final 256-record capacity retest unverified; the benchmark report distinguishes the earlier artifact baseline from final-artifact evidence.

## Run locally

Requires Node24+, pnpm11 and the pinned dependencies in `package.json`.

```powershell
pnpm install --frozen-lockfile
node scripts/dev.mjs
```

In another terminal:

```powershell
node scripts/seed.mjs
```

Open **http://127.0.0.1:5174/**. The API binds8788; keepers bind8791/8792. Development startup generates `data/app/operator-token`. Copy that local operator credential into the UI's **Operator access** field to enable mutations. It is not a wallet key. The seed is idempotent: it preserves existing state and imports an original CC0 three-chunk guide into both keepers. It schedules two accelerated120-second service periods, using actual elapsed time.

## Verify

```powershell
node scripts/test.mjs
node scripts/build.mjs
node scripts/contract.mjs test
node scripts/contract.mjs build
```

The contract wrapper uses the workspace-local Rust toolchain through `../scripts/with-rust.ps1` on Windows; otherwise it invokes cargo. Build outputs are under `contract/target/near/`. The build is optimized WASM, not a claim of bit-identical independent builds.

For the real-time local outage/refund scenario, start the app with `ARCHIVEPASS_DEV_FAULTS=1`, then run `node scripts/scenario.mjs`. It creates a fresh finite test asset, pauses actual keeper serving/worker behavior, and uses real deadlines. Fault controls are local-only; they cannot reset unknown payments or change contract state. The scenario takes about70seconds and restores both keepers afterward.

## Testnet

Read the current deployment without making transactions:

```powershell
node scripts/testnet-view.mjs
```

Public identities, immutable terms and code hash are in `docs/testnet-config.json`. Dedicated generated keys stay in ignored `.secrets/`. The asset account is created **without AddKey**, deploys and initializes atomically, and is verified through a real empty onchain access-key list. Parent/caretaker/provider account keys are separate from the asset's custody. The contract has no upgrade, generic execution or owner withdrawal method.

The preparation/deploy/scenario scripts are for a **fresh dedicated testnet deployment**, not a button to replay completed monetary steps. `testnet-deploy.mjs` refuses an existing account and `testnet-scenario.mjs` requires zero accepted principal. Inspect finalized receipts and authoritative state after interruption. Mainnet, production wallet signing, public hosting, repository publication and hackathon submission are not performed by this prototype.

See [evidence](docs/EVIDENCE.md), [operations](docs/OPERATIONS.md), [security](docs/SECURITY.md), [contract ABI](docs/ABI.md), [storage](docs/STORAGE.md), [backend](docs/BACKEND.md), [UI](docs/UI.md), [product specification](PRODUCT_SPEC.md) and [implementation plan](IMPLEMENTATION_PLAN.md).
