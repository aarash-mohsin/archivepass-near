# Release operations and reproducibility

These commands operate on this project's local development data. They do not back up a blockchain, create production authentication, publish a site or submit a hackathon entry. Run from the project directory with Node24+. Source data is preserved; restore always targets a new directory.

## Contract commands without PowerShell scripts

- node scripts/contract.mjs test invokes **cargo test --workspace --locked**, covering the primary contract and its workspace fixture member.
- node scripts/contract.mjs build builds both the primary and fixture WASM, sequentially using cargo-near with --locked --no-abi and explicit output directories. Each artifact's actual WASM magic, size and SHA-256 are checked/reported.
- The Node wrapper finds the shared workspace's .tooling/cargo/bin/cargo.exe directly on Windows, sets child-only CARGO_HOME/RUSTUP_HOME/PATH including the GNU and CMake directories, and calls it without a shell. It does not run a .ps1 file or change PowerShell execution policy.
- Without that local toolchain, standard cargo on PATH is used. Install the documented Rust target/near build tool for that environment; the application does not secretly depend on a globally modified PATH.
- Artifacts are optimized **non-reproducible-wasm** outputs. Recording a hash does not claim bit-identical builds across independent toolchains. Source changes require a new build and matching deployment evidence.

## Consistent stopped-services backup

Stop this project's API and every worker/keeper/writer using their owned terminal's normal Ctrl-C shutdown. Wait for clean exit. Do not stop unrelated processes or copy live SQLite main files without their WAL.

The tools require the explicit --services-stopped attestation. They cannot prove that another arbitrary process has no open handle. They also reject nonempty SQLite WAL/journal files, verify the source's supported schema/required columns, SQLite integrity and foreign keys, and detect a source file changing during copying. If a crash left a nonempty WAL, recover/checkpoint using the application or an operator-approved SQLite procedure first; **do not delete the WAL to make the guard pass**.

Choose a new backup name every time:

    node scripts/backup.mjs --source data --output .release-backups/qa-20261105 --services-stopped

All source/output/destination paths must remain inside this project root. Existing output directories, nesting backup under its source, symlink/junction/reparse ancestors, unsafe manifest paths and unsupported schemas are refused. There is no --force, recursive source cleanup or overwrite mode. A failed copy can leave an incomplete output; choose a fresh directory and retain it for investigation. A missing final manifest is not a usable backup.

The backup writes manifest.json with exact paths/sizes/SHA-256/schema identities, plus manifest.sha256. Only allowlisted data files are copied. .env, .secrets, operator-token files, unreferenced files and WAL/SHM/journal sidecars are excluded. Backups still contain application ledger/history data: keep them private and outside public release artifacts. Hashes detect accidental corruption, not a malicious party replacing both the data and manifest; protect the backup storage itself.

## Restore to a new root

    node scripts/restore.mjs --backup .release-backups/qa-20261105 --dest .release-restores/qa-20261105 --services-stopped

Restore verifies the manifest hash, every file hash/size, project identity, allowlist, schema/columns/integrity/foreign keys and required immutable content before creating the destination. It refuses even an already-existing empty destination. After copying it verifies the restored data again and writes a restore-receipt.json. Neither the original data nor backup is deleted or rewritten.

Operator credentials are deliberately excluded. When the application requires a local operator token, startup with the restored data configuration generates a new one; use that token for the restored UI/keepers. Never copy a NEAR private key into a browser or a public backup. Pending payments, durable delivery evidence and Unknown outcomes are preserved in the database; startup must reconcile authoritative results and never infer failure from elapsed time.

## Release verification sequence

1. From a fresh distribution, install the exact lockfile with pnpm install --frozen-lockfile; run node scripts/test.mjs and node scripts/build.mjs.
2. Run both contract commands above when evaluating the source/WASM release. Preserve actual hashes and match testnet code to the tested artifact.
3. Start the built application through its documented API/static server, **without Vite**, then check HTML/JS/CSS/HEAD/fallback/404/MIME/cache and real API actions on the intended origin.
4. Create representative local data including completed, failed and pending/Unknown claims; use isolated fixtures for failure tests. Stop all writers, backup, restore to a new root, start the restored app using that root and compare exact owner/terms/ledger/credits/payments/events and content.
5. Make a fresh command after restoration; verify conservation and no duplicate delivery. A restart alone is not a backup/restore drill.
6. Run final desktop/360px/keyboard/error/pending-state QA on these actual built assets. Record which browsers/layers were tested and any excluded release scope.

node --test tests/release/operations.test.mjs contains seven focused tests: exact byte roundtrip, credential exclusion, stopped-service/path/overwrite guards, corrupt bytes, tampered/traversal/wrong-project manifest, active WAL/future schema rejection, actual Windows junction rejection and direct cargo job planning. All seven passed on5November2026 with permission to create the temporary junction fixtures. In a restricted sandbox the junction case explicitly skips; that skip is not a pass. These focused tests do not claim a new full application/Rust/browser/testnet run or an actual restore of the operator's running database; the parent release QA records that drill separately.

## ArchivePass full data layout and restored startup

The complete source root contains:

- app/archivepass.sqlite and the content-addressed blobs referenced by assets/drafts under app/blobs.
- keeper-a/keeper.sqlite plus its referenced local copies under keeper-a/blobs.
- keeper-b/keeper.sqlite plus its own referenced local copies under keeper-b/blobs.

The app supports migrations[1] and the current required columns; each keeper must retain provider_id/mode/api_origin bindings. Both keeper databases are required for this complete backup. Missing/corrupt content for a published archive or a Ready keeper import refuses a falsely complete backup. Failed/in-progress keeper imports may legitimately have no file; their persisted state is preserved. Original sample/fixture files in fixtures/ are source artifacts, separate from runtime backups.

After stopping the original processes, start the restored API:

    $env:ARCHIVEPASS_DATA_DIR=(Resolve-Path '.release-restores/qa-20261105/app').Path
    $env:ARCHIVEPASS_API_PORT='8788'
    $env:ARCHIVEPASS_WEB_ORIGIN='http://127.0.0.1:8788'
    node server/main.ts

In separate terminals, use that same app data directory/new local operator token, set the same permitted browser origin, then start the keepers:

    node keeper/main.ts --id a --port 8791 --data-dir .release-restores/qa-20261105/keeper-a --provider keeper-a.archivepass.testnet --api-origin http://127.0.0.1:8788 --mode local
    node keeper/main.ts --id b --port 8792 --data-dir .release-restores/qa-20261105/keeper-b --provider keeper-b.archivepass.testnet --api-origin http://127.0.0.1:8788 --mode local

Preserve the **stored** provider IDs, mode and API origin; adjust the shown defaults only to match the backed-up configuration. Keepers deliberately refuse silently rebinding a restored database to a different API/network/provider. Restoring onto arbitrary new ports would require an explicit separately reviewed migration; for the release drill, stop the original owned services and reuse their configured origins. Browser CORS configuration must match the built UI's actual origin.

The wrapper emits contract/target/near/archivepass.wasm and contract/target/near/archivepass_receiver/archivepass_receiver.wasm. Workspace tests include the receiver fixture. Keyless deployed code cannot be upgraded by changing the local WASM; a changed contract needs a fresh dedicated asset deployment and new evidence.

