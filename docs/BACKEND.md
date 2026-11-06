# Persistent local ledger and keepers

ArchivePass uses an actual SQLite ledger and actual HTTP byte servers. Local identities and payment delivery are simulated. The files, SHA-256/Merkle calculations, HTTP requests, persistent transitions and rejection rules are real. This module does not claim blockchain execution. The independent testnet harness and contract evidence establish their own achieved gates.

## Start

Run from the ArchivePass project directory with Node 24. The root development supervisor may start these processes together; each keeper remains a separate process and directory.

```powershell
node server/main.ts
node keeper/main.ts --id a --port 8791 --data-dir data/keeper-a --provider keeper-a.archivepass.testnet --api-origin http://127.0.0.1:8788 --mode local
node keeper/main.ts --id b --port 8792 --data-dir data/keeper-b --provider keeper-b.archivepass.testnet --api-origin http://127.0.0.1:8788 --mode local
```

The API defaults to loopback port 8788. `ARCHIVEPASS_API_PORT`, `ARCHIVEPASS_DATA_DIR`, `ARCHIVEPASS_MODE`, `ARCHIVEPASS_WEB_ORIGIN`, `ARCHIVEPASS_KEEPER_ORIGINS` and `ARCHIVEPASS_OPERATOR_TOKEN` configure it. A missing operator token is generated once into `data/app/operator-token`, outside browser bundles and public environment responses. Supply that local operator credential through the UI setup. It is not a blockchain wallet or production login. Keepers read the same environment token, or that persisted file. A token must contain at least 16 characters. Default browser origin is exactly `http://127.0.0.1:5174`.

Keeper options override `ARCHIVEPASS_KEEPER_ID`, `ARCHIVEPASS_KEEPER_PORT`, `ARCHIVEPASS_KEEPER_DATA_DIR`, `ARCHIVEPASS_KEEPER_PROVIDER`, `ARCHIVEPASS_API_ORIGIN` and mode. `ARCHIVEPASS_KEEPER_POLL_MS` defaults to 2000. `ARCHIVEPASS_APPROVED_ASSETS` is a comma-separated list of explicit archive UUIDs to import at startup. Otherwise approve/import an asset through authenticated `POST /operator/import {"asset_id":"..."}`. No automatic library-wide enrollment occurs. Import accepts an asset ID, never a URL or filesystem path.

Every API mutation requires Bearer authentication, `X-Request-Id` UUID and a permitted Origin if present. CLI calls without Origin are allowed with the token. Keepers permit the same browser CORS headers. Worker API calls use the token and a durable request ID; authoritative state is queried before a repeated action. See IMPLEMENTATION_PLAN.md for the frozen DTOs/routes.

## Persistence and accounting

`data/app/archivepass.sqlite` enables WAL, foreign keys, busy timeout and schema version 1. Its tables are drafts, assets, commitments (with unique asset/provider/slot), payments, durable outbox/delivery receipts, events, request idempotency, observations and settings. Immutable manifest/policy and bounded credits are JSON inside the asset row; commitments and payment records are separate. Monetary arithmetic uses BigInt and canonical decimal TEXT. A short `BEGIN IMMEDIATE` transaction saves all monetary changes, event and idempotency result together.

Principal satisfies `in = available + reserved + provider credits + refund credits + pending + paid`; reserved equals the sum of nonterminal commitments, and pending equals unresolved attempts. Every committed transition and startup checks these equations. Aggregate discrepancies fail rather than being clamped. Operation funding and simulated mandatory one-yocto security deposits are separate from principal. Ordinary NFT transfer changes owner/epoch and its security-deposit counter, while principal buckets and frozen obligations stay intact.

Hash/proof verification runs asynchronously before the transaction. The transaction re-reads authoritative ownership, epoch, challenge, deadline, provider and immutable digest before applying credit. Concurrent challenge opens persist one selection; a losing request returns that same index. A proof at the exact end fails; expiry at that exact end succeeds. Commitments are bounded at 16 active/256 lifetime, providers at eight, pending payouts at eight and local assets at 256. Historical events/payments are retained for full exports; UI pages are bounded. HTTP activity and payment pages are newest-first; exports remain complete chronological records.

Claiming full credit atomically creates a Pending attempt/outbox and zeroes available credit. The delivery worker writes its durable simulated delivery outcome before resolving. Restart after either boundary consults that receipt and settles once. A failed delivery restores exactly the same creditor/kind. New earnings during an older Pending attempt remain separate. Unknown delivery leaves an unresolved liability indefinitely; elapsed time never authorizes a retry or credit restoration.

Request IDs are scoped by mode, archive/draft, actor and operation, with normalized body hash. Identical replay returns the stored original result even if later state changed. Reusing an ID with different content conflicts. A new user action needs a new ID.

## Actual content boundary

Raw uploads are 1 byte through 16 MiB. Header metadata contains public-distribution attestation and the browser's expected three hashes. The API recomputes all values over received bytes. Blobs are atomically renamed to SHA-256 filenames under a canonical approved root; filenames supplied by users never select paths. No ZIP/TAR extraction, HTML execution or preview occurs. Blob reuse checks existing bytes for corruption. Files are attachments with octet-stream, nosniff and sanitized disposition.

Each keeper stores its own `keeper.sqlite` and `blobs/` directory. Import fetches only its exact configured API origin, disallows redirects, bounds time/bytes and independently verifies full file, canonical manifest and Merkle root before marking Ready. Approval preserves the original policy/root. The worker verifies its local content before acceptance/proof and refuses corrupted data. HTTP downloads and chunk/proof routes use database-known hashes/UUIDs, never arbitrary paths. Browser verification remains independent: successful proof settlement does not establish HTTP uptime, full-file availability or separate physical replicas.

The local worker accepts an approved future proposal, opens within the actual service interval, constructs a proof from local bytes, submits as its visibly simulated provider identity, and triggers only its fixed claim. It expires elapsed obligations without retroactive earning. Health shows heartbeat, poll timestamps, last action/error and actual worker/serving flags. Both localhost keepers are on one computer; this is not independent infrastructure.

## Faults and transfer-call fixtures

`ARCHIVEPASS_DEV_FAULTS=1` in local mode enables authenticated development-only controls:

- `POST /api/v1/dev/payments/next-outcome` with `success`, `failure` or `unknown` selects the next durable simulated delivery.
- `POST /api/v1/dev/payments/:operation_id/reconcile {}` consults an existing definitive delivery receipt. It accepts no claimed outcome/recipient/amount. An unknown result cannot be reset. If operation IDs are ambiguous across archives the route refuses; normal worker recovery resolves archive-specific outbox entries.
- `POST <keeper>/operator/control {"worker_enabled":false,"serving_enabled":false}` genuinely disables that worker and byte endpoints; health remains available and honest. Stopping its process also stops HTTP health. Re-enable explicitly or restart.

Local transfer-call creates a durable authority lock. No owner, including a forwarded holder, can schedule/configure during the lock; fixed third-party service and claims still work. Ordinary forwarding is permitted and nested transfer-call is rejected. Internal receiver fixtures are named `keep.archivepass.testnet`, `return.archivepass.testnet`, `panic.archivepass.testnet` and `forward.archivepass.testnet` (the last forwards to Bob). Receiver behavior is internal fixture code, not a public callback outcome. Unknown receiver code leaves the operation unresolved and controls locked. Native Rust/testnet evidence separately covers actual NEP-171 receiver execution; this local fixture is explicitly simulated.

## Restart, backup and limitations

Stop only the owned API/keeper processes, wait for clean shutdown, then copy the complete `data/app`, `data/keeper-a` and `data/keeper-b` directories to a chosen backup. With all DB handles closed SQLite checkpoints its WAL; if copying live, use a proper SQLite backup rather than copying only the main database. Preserve operator credentials privately. Restore each directory to its matching provider/mode/API binding. Startup does not seed or overwrite archives. The parent seed command is explicit. For a clean experiment select a new data directory; do not delete existing user data implicitly.

An interrupted upload/import is never publishable/Ready. Orphan `.upload-*`/`.import-*` files may remain and can be reviewed after stopping processes; no broad filesystem cleanup is performed. Missing/corrupt content produces an error and no proof. A stopped worker may miss its actual window; it cannot earn later. Locked SQLite operations fail after the configured busy timeout. An unknown payout remains visibly pending for operator investigation. No arbitrary payee redirection, timeout refund, old-owner override or transfer-lock administrative unlock exists.

The shipped local service binds its database to its execution mode. Testnet mutations return signed-action/deployment-required errors and never silently fall back to the local ledger. The local keeper worker deliberately refuses testnet signing when no real adapter is configured. The separate signed testnet harness may retrieve actual proof bytes from the HTTP keepers, but that alone is not evidence that this scheduler signs or runs in testnet mode. Report exact achieved status in EVIDENCE.md.

`GET /api/v1/testnet` is a separate read-only live snapshot, available alongside the explicitly local ledger. It reads the parent-maintained `docs/testnet-config.json` binding, uses only `https://test.rpc.fastnear.com`, verifies `status.chain_id`, then retrieves finalized account code hash, actual access keys and decoded `get_asset`. It reports current key/count/hash match, actual owner and ledger, observation timestamp, documented CLI signing and localhost HTTP keepers. Successful results are cached for ten seconds; expired-cache/network failures return honest 503 rather than local data. An absent configuration returns 404. No query parameter can supply another RPC, account or network. This panel does not turn demo actor commands into blockchain signatures.

## Verification

`node --test tests/server/*.test.ts` exercises 19 tests: exact conservation, immutable transfer obligations, stale authority, actual proof/path rejection, duplicate protection, deadline boundaries, concurrent selection/idempotency, fixed expiry refunds, failed/unknown payments, new credit during Pending, two recovery boundaries, full exports, 16/256 capacity limits, auth/origin/body/path guards, two HTTP imports/byte servers/proofs, a reopened persisted keeper store, JSON property-order independence, corruption rejection, actual worker acceptance/proof/claim with safe failed-payment retry, and disabled serving. A retry uses a new authoritative payment-generation ID only after no Pending/Unknown attempt remains; it cannot accidentally replay the old failed attempt's idempotency result. `node node_modules/typescript/bin/tsc -p tsconfig.server.json` checks backend/keeper types. This managed environment requires loopback network permission for HTTP tests; sandbox EACCES is an environment failure, not a passing network result.

Three additional mocked-transport tests exercise the live reader's fixed RPC/finality/binding/cache, retained-key and code-mismatch reporting, wrong-network rejection, unavailable RPC and absent configuration. These tests do not claim an actual network observation; the parent verification records the real call separately. Total backend suite: 22 tests.
