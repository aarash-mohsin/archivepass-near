# Release-core fixes and operational boundaries

This document records the local/core Astra fixes. Subsequent signed testnet workers and owner operations are implemented and verified in [RELEASE_WORKERS.md](RELEASE_WORKERS.md); callback gas guards and final-artifact capacity evidence are tracked in [RELEASE_TESTNET_BENCHMARK.md](RELEASE_TESTNET_BENCHMARK.md). Browser chain signing, public hosting and an administrator recovery path remain outside ArchivePass's release scope. The core changes below did not modify contract source; the later contract changes have separate artifact/deployment evidence.

## Keeper isolation and settlement

The keeper now catches failures separately for each imported archive and each commitment action. A missing/corrupt earlier archive or a transient action race does not skip later eligible work. Errors are stored per asset and summarized in process health. Every imported approved record can still attempt fixed-payee settlement, including when a later import has failed.

Elapsed commitments and already-earned provider credits are handled before any file verification. Missing bytes and disabled HTTP serving do not prevent expiry release or a fixed credit claim. New consent and proof submission require current independently verified bytes and enabled serving. Unknown/Pending payment attempts never become retryable merely because time passed. After definitive failure, the existing payment-generation idempotency rule creates a new claim attempt.

Accepted commitments waiting for their future start and terminal/expired archives are not fully rehashed on every two-second poll. Expensive work is bounded to one public operation and one reserved worker operation concurrently. The reserved worker path can proceed during a public proof burst. Public proof/status/import requests are limited to120 per remote address per minute. HTTP connections are bounded64, request timeout30seconds and header timeout15seconds. Import/body/file sizes remain bounded16MiB.

Verified immutable tree/byte cache holds at most32MiB. Readiness reuses verification for at most30seconds only while file size/mtime/ctime signatures match. Missing or changed files invalidate it. Acceptance and proof work force fresh full verification. The cache is an optimization, not proof of current general HTTP availability or independent storage. This release is tested for small documentation bundles and a single maximum-size proof burst; it does not guarantee that256 simultaneously active maximum-size archives can meet minimum30-second deadlines.

## Asset readiness API

`GET /archives/:asset_id/status` on each keeper works even when serving is disabled or no import exists. `GET /api/v1/assets/:asset_id/keepers` aggregates only the two configured keeper origins with bounded timeouts and matching provider/asset identities. Existing `/health` and `/api/v1/workers` retain their distinct process-level meanings.

The shared `KeeperAssetStatus` has status `NotImported`, `Importing`, `Ready`, `Missing`, `Corrupt`, `Failed` or `Unavailable`; immutable manifest digest; verification/import timestamps; actual serving/worker flags; next observed obligation; and per-asset error. `Ready` means bytes were locally verified at `checked_at`, not that a browser downloaded them. A reachable process is not an imported archive. A recent Ready record with serving disabled is not a currently downloadable copy.

## Safe local receiver fixtures

Ordinary handover is the normal account-to-account path. Local transfer-call accepts only these exact simulated receiver accounts:

| Receiver | Simulated result |
|---|---|
| `keep.archivepass.testnet` | Keeps the NFT |
| `return.archivepass.testnet` | Returns to the former owner |
| `panic.archivepass.testnet` | Simulates receiver failure and returns |
| `forward.archivepass.testnet` | Forwards toBob while preserving the application lock through resolution |

Unsupported recipients are rejected before owner/epoch/lock changes. Exact IDs are used, so a `keep.something-else` prefix is not a fixture. The four demo identities are appended to environment actors so a kept local receiver can subsequently move the NFT through an explicitly simulated role. An unresolved receiver is available only with local development faults enabled **and** message `development:unresolved`. That deliberate test can lock future controls indefinitely; it is not an ordinary handover option. No timeout or administrator unlock was introduced.

## Built app and configuration

After `node scripts/build.mjs`, `node server/main.ts` serves built `dist/web` assets and API from the same loopback origin. `node scripts/dev.mjs --built` starts this built server plus both keepers, without Vite, and refuses a missing build. `node scripts/dev.mjs` remains the development supervisor. Static serving supports GET/HEAD, correct MIME/nosniff, no-cache HTML and immutable hashed assets. Unknown API routes remain JSON404; source/data/secrets, dot paths, encoded traversal and symlinked targets are excluded from the static root.

API port/data/static directory, web origin and exactly two distinct keeper origins are validated. Unsupported modes, malformed ports/intervals, duplicate origins and typoed fault flags fail closed. The local supervisor honors the API/keeper ports and data root; keeper directories default to siblings of the application directory and can be explicitly selected through `ARCHIVEPASS_KEEPER_A_DATA_DIR` / `ARCHIVEPASS_KEEPER_B_DATA_DIR`. External keeper origins are configurable for separately operated processes; the local supervisor only launches loopback HTTP endpoints. Automatic approved-asset imports remain implemented in keeper/main.ts and malformed UUID lists are rejected.

`node scripts/seed.mjs` reads the same data/API configuration. Repeating it preserves existing funding and commitments, checks readiness, repairs only absent/failed/corrupt imports, and explains elapsed demo windows. `--new-demo` explicitly archives the prior seed binding before creating another asset; it never deletes the previous asset. Initial funding/proposal request IDs are persisted before those commands, so interruption during setup can resume those exact identities. It does not make an expired immutable service period start again.

## Validation and schema

The local creation boundary now requires exactly one distinct provider configuration per immutable eligible account, matching Rust initialization. Runtime command/proof shapes reject missing/null/unsupported fields with deliberate4xx errors instead of property-access500s. Fixed-payee and monetary guards are unchanged.

Application databases reject unsupported migration versions before DDL or journal changes. Keeper stores now explicitly mark the existing schema as `user_version=1`, accept legacy unversioned stores with the same schema, and reject future versions before DDL. No v2 tables or discretionary migration were introduced. Backup/restore commands and actual restore drills are owned by the separate operations work package.

## Tests

`tests/server/release-core.test.ts` adds eleven focused regressions: multi-asset isolation/restart; content-independent claims/expiry; Unknown persistence; per-action failure isolation; readiness/corruption/repair; safe receiver rejection; built assets/HEAD/cache/SPA/API/traversal/symlink boundaries; strict custom configuration; future schema preservation; malformed command/provider parity; and a real16MiB concurrent proof burst while the reserved worker path earns. The burst reports actual elapsed time, peak process RSS and event-loop delay; it is a local process measurement, not onchain worst-case gas evidence.

Run `node --test tests/server/*.test.ts` with loopback access and strict `tsconfig.server.json`. Existing domain, two-keeper HTTP, retry and read-only testnet transport regressions remain included. Global application/browser/build/testnet release QA is parent-owned and must report its actual outcome separately.
