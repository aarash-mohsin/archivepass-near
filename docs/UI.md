# ArchivePass browser UI

The React app is served by Vite on `http://127.0.0.1:5174`, with `/api` proxied to the application service on port 8788. Keeper reads and operator actions go directly to the configured keeper origins on ports 8791 and 8792. Those services must allow the exact browser origin and the authorization/request-ID headers; no arbitrary endpoint fetch field exists.

Enter the local operator token supplied by your startup environment in **Operator access**. The UI stores it in `sessionStorage`, never in a public configuration response or generated manifest. Selected demo identities are explicitly local simulation; they do not authenticate blockchain accounts. Token-free public reads and download verification remain available. Actual testnet writes are delegated to signed scripts unless the backend provides a real signing flow; errors never silently become local transactions.

## Connected flows

- Library lists persisted archives and paginates. A fresh empty library links to actual file creation.
- Creation independently computes the full file hash, Merkle root and canonical manifest in the browser; uploads actual bytes with expected hashes; checks the server manifest; collects fixed provider, rate, slot, expiry and beneficiary rules; and requires an immutable review before creation.
- Overview distinguishes available, reserved, earned, pending and paid principal, with refund credits separately visible. Operational funding is separate. It exposes immutable content fingerprints and downloadable manifest JSON.
- Keeper cards use actual API health observations, operator imports and safe worker polling; they disclose that both processes share this development computer.
- Service management reserves a future payment, exposes provider consent, challenge index and actual deadline, retrieves a real proof from the fixed keeper and submits it as the selected local provider. Missed periods settle without payment. Future settings cannot edit existing commitments.
- Download verification fetches a complete bounded file from a configured keeper, computes SHA-256 in this browser and checks exact length/hash. An altered, truncated, oversized or unreachable file cannot produce the verified download link. Browser observations never settle service payments.
- Transfer requires a recipient preview and explicit confirmation of inherited obligations. Ordinary NFT and standard transfer-call commands are distinct. Pending transfer-call state locks future configuration/proposals. The previous owner loses visible controls after authoritative refresh.
- Claims always target the fixed creditor and claim full available credit. Pending operations disable another claim; unknown delivery remains visibly unresolved. The UI labels local delivery as simulated.
- Activity displays paginated persisted events, exact ledger terms/residual and complete JSON export. Local event IDs are never presented as chain transaction hashes.

Request IDs are reused for an identical mutation body after a network failure, with backend idempotency authoritative. After successful mutation the UI reads current state again; it does not increment ledger totals optimistically. Asset generation guards discard obsolete refreshes when navigating. Content is rendered as text, files are opaque downloads, verified object URLs are revoked, and downloaded filenames are sanitized.

## Responsive and accessible behavior

The **Testnet evidence** navigation item opens `#/testnet`, a separate read-only view fetched from `GET /api/v1/testnet`. It displays live RPC observation time, actual owner/epoch, account/code hash, access-key count, immutable manifest/policy and contract ledger. It never uses the demo identity to sign a chain call and never substitutes local data after an RPC failure. The page distinguishes the read-only `node scripts/testnet-view.mjs` command from the mutable fresh-workflow scenario script, which must not be blindly replayed after completion. Actual browser verification of the live endpoint is recorded separately by the integrator.

The layout uses labeled native controls, visible keyboard focus, live action/error status, explicit disabled reasons, text status badges and reduced-motion support. Main sections collapse to cards and one column on small viewports. Long accounts, hashes and ledger integers wrap; tab navigation scrolls within its own strip. CSS targets a 360px viewport; actual browser QA belongs in the integration evidence and is not implied merely by these rules.

## Validation

`node node_modules/typescript/bin/tsc -p tsconfig.web.json` checks the browser bundle. `node --test tests/web/workflow.test.ts` verifies caretaker transfer locks, deadline boundaries, actual file corruption/truncation detection, bounded HTTP streams, keeper origin restrictions and Unicode upload headers. The parent integrator records production build and browser workflow results separately.
