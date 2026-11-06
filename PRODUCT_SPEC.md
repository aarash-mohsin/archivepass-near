# ArchivePass — Product specification

Version 1.0 · 5 November 2026 · NFTs That Do Something

Status: specification for implementation planning. This document does not assert that ArchivePass has been implemented, deployed, independently audited, or published. AllTogether is a separate product; its application code, database, contract identities, secrets, and package identity must not be reused as ArchivePass state.

## 1. Product promise

**Transfer a public archive to its next caretaker together with its restricted upkeep budget and existing provider obligations.**

ArchivePass is for small public datasets, documentation bundles, and open-source or community archives whose continued hosting currently depends on a departing maintainer. A stewardship NFT identifies the account allowed to arrange future service. A finite, restricted reserve pays agreed providers only after the contract accepts a bounded sampled content response. Existing obligations, earned claims, immutable content identity, and the unused-fund refund destination survive a change of caretaker. Neither caretaker has a direct upkeep withdrawal route. This does not prevent an eligible provider and caretaker from colluding or being controlled by the same person; the enforceable promise is restricted service payments under fixed terms, not prevention of all indirect benefit.

The NFT conveys application authority, not ownership of copyright, an HTTP server, a physical device, a unique human identity, or previously disclosed information. It does not prevent the old caretaker from keeping a copy of a public file. The useful transfer is authority over a funded service arrangement whose third-party obligations remain enforceable.

A conventional database could implement this workflow. The reason for the contract is independently inspectable custody restrictions and a standard transferable authority interface. File hashing, NFTs holding money, and Merkle proofs are established techniques; the product distinction is **portable funded stewardship with preserved provider obligations**.

### 1.1 What a successful check actually means

The contract establishes that the authorized provider account submitted the specified chunk bytes and a valid path to the committed root within that commitment's response window. It does not query HTTP, measure continuous uptime, prove full-file availability, prove an independent stored replica, or establish permanent storage. The provider may fetch the bytes from another host. A browser's complete download and SHA-256 match is a separate observation by that browser, not a settlement oracle.

Use “sampled response accepted,” “full download verified in this browser,” and “provider last observed reachable at …” as distinct labels. Do not use “storage proven,” “100% uptime,” “independent replicas,” “permanent archive,” or Filecoin-equivalent proof language.

### 1.2 Canonical demonstration

Alice uploads an actual public documentation bundle. Two actual HTTP keepers acquire independent local copies and serve the bytes. Alice funds its reserve, schedules one bounded period for each provider, and both providers accept. A keeper opens a challenge after the period begins. Alice transfers the NFT to Bob while one response is outstanding. The provider proves the fixed challenged chunk, earns its fixed claim, and withdraws to its own account. Alice can no longer schedule service; neither caretaker has an upkeep withdrawal route. Bob inherits the other fixed commitment. Host A is stopped for its next period, no authorized proof arrives, and the commitment expires without earning. The browser downloads the full archive from host B and verifies it. A repeated proof is rejected. All balances and history survive application and keeper restarts.

## 2. Audience, competition, and scope

| Person | Job | Product evidence |
|---|---|---|
| Departing maintainer | Hand over responsibility without transferring a personal hosting account or emptying upkeep money | Transfer preview, immutable terms, preserved liabilities, loss of old authority |
| Incoming caretaker | Know what is inherited and arrange the next period | Current owner, available budget, fixed existing commitments, future provider controls |
| Sponsor | Fund a specific public content version under visible restrictions | Root, finite expiry, maximum spending, fixed refund destination, ledger |
| Keeper operator | Serve actual content and collect only earned payments | Accepted terms, actual challenge, response receipt, available/pending/paid claims |
| Public reader | Retrieve and verify a useful archive | Real endpoints, full download, expected and actual digest, dated observations |
| Reviewer/operator | Reproduce the claims and adverse cases | Tests, bounded protocol, independent actors, receipts, restart and reconciliation evidence |

The competitor descriptions below carry forward the research snapshot in `../research/NFT_IDEAS.md`; they are boundaries for this product, not a new exhaustive repository audit.

| Reference | Overlap | ArchivePass boundary |
|---|---|---|
| [Deed](https://github.com/ClaudeOpusPremiumAgent/deed) | NFT-owned account, money, ownership-transfer safeguards | Add restricted archive upkeep and surviving provider liabilities; do not claim the account wrapper as new |
| [Release Passport](https://github.com/emilhuseyn/release-passport) | Release authority, file hashes, security bond | Scheduled content-response payments rather than release authorization or human security adjudication |
| [Veridom Pay](https://github.com/khrisdidukh/veridom-pay) | Escrow, receivables, retainage | Byte-verifiable bounded responses; no physical-work or TEE judgment |
| [Filecoin](https://spec.filecoin.io/) and ordinary storage services | Established storage and verification methods | A stewardship/funding layer with substantially weaker sampled evidence, not a replacement storage protocol |
| [Shelflife lead](https://x.com/Savage27z/status/2118225862168649899) | Adjacent availability concern | Prior review describes contract-source URL checks; do not equate that with keeper responses or claim an independently verified feature audit |

### 2.1 Required MVP

1. Actual upload of a bounded public file, byte-level validation, immutable manifest, whole-file digest, and Merkle root.
2. One archive version per asset: version ID `v1`, exactly one NFT, a native-NEAR restricted reserve, fixed service policy, fixed expiry beneficiary.
3. Two separately running HTTP keepers with separate content directories, operator identities, persisted work state, and actual byte-serving endpoints.
4. Owner-proposed, provider-accepted future period commitments with fixed payee, content, rate, slot, and deadline.
5. Permissionless challenge opening and expiry settlement; provider-authorized, bounded onchain proof verification; no proof means no earned payment.
6. Provider pull-payment and fixed-beneficiary unused-fund refund, with safe asynchronous failure restoration.
7. NEP-171 core ownership and transfer-call handling, useful metadata/enumeration, monotonic ownership epoch, and current-owner authorization.
8. Connected responsive screens for creation, funding, commitments, keeper/challenge progress, verified download, transfer, claims, and history/reconciliation.
9. Persistent local execution using Node 24 and SQLite, with a conspicuous local-ledger/demo-identity label.
10. Rust contract source, meaningful native tests, reproducible WASM build, testnet integration scripts, and genuine testnet execution where the environment permits it.

### 2.2 Deliberate simplifications

- One contract/account represents one immutable archive version. Changing bytes creates another asset with its own reserve and terms; the MVP does not migrate an old reserve or replace a funded root. The UI can list several local assets; the required actual testnet vertical path needs one deployed asset.
- A deployment script creates the dedicated asset account. A factory is not required. This preserves the one-asset account model without spending the deadline on factory lifecycle, multi-asset migrations, or factory recovery.
- Use native NEAR only. Local units simulate yoctoNEAR exactly; testnet uses faucet NEAR. There is no FT registration/resolver integration, token exchange, USD peg, or platform fee.
- There is no unrestricted owner-money bucket, owner withdrawal, early sponsor cancellation, provider payout-address change, or discretionary administrator refund.
- Funds from every sponsor follow the asset's same fixed refund beneficiary. This is explicitly a restricted contribution, not a donor-specific refundable deposit.
- No NEP-178 approvals/delegation, token sale, royalty, marketplace, burn, succession, or arbitrary execution method.
- One sampled chunk per provider per slot is an intentionally weak but explicit demonstration protocol. Do not silently imply it certifies the full period.

### 2.3 Stretch after all required gates

Multiple separately earmarked version buckets within one asset; a verified keyless factory; a third independently operated keeper; stronger challenge economics and selection; external storage integration with separate proof semantics; and optional managed-service pricing. None may displace transfer safety, failed payout recovery, actual HTTP service, or truthful evidence.

Excluded: private or encrypted backup, archive extraction/indexing, general web hosting, DNS or server-credential transfer, AI/TEE judgments, cross-chain operations, yield, perpetual endowments, lending, governance tokens, repair claims, API-credit marketplaces, and claims of independent replicas. Mainnet use, public hosting, GitHub publication, and social submission are outside the current development authorization.

## 3. Architecture and trust boundary

```text
Browser ── upload / local domain API ── Node 24 application ── SQLite + immutable blobs
   │                                          │
   │ full download + local SHA-256             └─ testnet views / verified receipt index
   ▼
Keeper A HTTP + worker           Keeper B HTTP + worker
own directory / identity          own directory / identity
   │ provider-signed proof/claim    │
   └────────────────┬───────────────┘
                    ▼
Dedicated NEAR asset account
one NFT + immutable content terms + commitments + restricted ledger
```

The local service is an authoritative **test ledger** in local mode. It reproduces domain rules transactionally; it is not a blockchain or wallet-authentication system. Demo identity selection is visible and never offered as NEAR authorization. The testnet contract is authoritative in testnet mode; SQLite stores content, UI metadata, receipts, work queues, and an explicitly dated cache. A failed RPC call cannot fall back to a local success.

Implement a shared, pure TypeScript protocol/domain package for byte encoding, proof construction, integer handling, and API DTOs. Rust independently implements the specified verification and ledger guards, sharing golden vectors rather than pretending to execute the JavaScript logic. Keep ArchivePass modules independent from AllTogether; its conservative creditor/callback approach may inform the design, not couple runtime state or contracts.

### 3.1 Account and upgrade model

One dedicated named testnet subaccount hosts this asset's single-token contract and native reserve. Ownership checks and changes occur in the same contract execution, avoiding asynchronous NFT ownership lookups against another contract. The parent account's ability to create a child is not itself a child spending key; all actual child access keys must nevertheless be inspected.

Prefer a keyless account without deploying a factory: the dedicated parent submits one action batch targeting the new child with `CreateAccount`, operational `Transfer`, `DeployContract`, and initialization `FunctionCall`, omitting `AddKey`. Creation, deployment, and initialization belong to the same atomic batch, so an external caller cannot initialize the deployed contract first. The initialization method is one-time and rejects repeat calls; all fixed terms, eligible provider accounts, initial NFT owner, and refund beneficiary are supplied in that batch. Fund upkeep later through its explicit method. The parent can subsequently call the public contract methods as the NFT owner without possessing an access key on the asset account. Verify this construction against actual testnet receipts and an empty access-key list before calling the deployment keyless.

The target custody model has no access keys and no contract upgrade/arbitrary-call method. If keyless deployment obstructs completion or debugging, the prototype may instead retain a dedicated full-access deployment key; it still uses atomic deployment/initialization. If retained, the UI, deployment record, README, and demo must say **“Prototype deployment key retained: the deployer can replace the contract or move funds.”** Such a deployment demonstrates rules in the current code, not irrevocable custody. Do not call it keyless or immutable custody. The content terms remain immutable through the current application API.

Key removal is a separate optional, deliberate operation after testing, with an actual onchain key-list check and code-hash record. Do not delete the sole recovery key merely to satisfy wording in this specification. Never use existing user wallets or mainnet funds; the root workflow supplies dedicated faucet-funded accounts. No owner-facing generic deploy, delete-account, add-key, or arbitrary-promise capability exists in the contract.

### 3.2 Required process boundaries

The application and both keepers run as separate processes. Keeper A and B must bind distinct ports and keep separate data directories. They may share implementation code; they may not merely be two labels pointing at one in-memory handler or one serving directory. Their location on one development computer must be disclosed: separate demo processes are not independent infrastructure operators.

The keeper worker performs scheduling. Neither the contract nor a static frontend wakes itself. The UI shows worker heartbeat, last successful poll, last action/error, and “awaiting trigger” when appropriate. A stopped worker must not be represented as an autonomous active process. Any user can still open or expire a fixed commitment.

## 4. Immutable content protocol

### 4.1 Bounds and file treatment

The required initial limits are 1 byte through 16 MiB per archive, 1,024-byte chunks, and at most 16,384 real chunks. Maximum Merkle depth is 14. Files are opaque bytes, including ZIP/TAR bundles, never extracted or executed. No symlink, filesystem path, multipart filename, or MIME declaration controls a storage path. A user uploads bytes through a bounded stream; a content digest or generated identifier selects the final path under an approved data directory.

An implementation may lower these limits for measured gas or runtime constraints before freezing fixtures; it must change all validators, UI copy, golden vectors, and tests together and document the measured reason. It may not enlarge them without measuring worst-case contract gas/storage and browser memory.

The upload form requires title, public distribution/license attestation, an optional license identifier or short note, and the actual file. State plainly that files and metadata are public. Do not add identity paperwork or collect unnecessary personal data. Sanitize the download filename and render all text as text. Serve uploaded bytes with `Content-Type: application/octet-stream`, `Content-Disposition: attachment`, and `X-Content-Type-Options: nosniff`; do not embed HTML/SVG or preview executable content.

### 4.2 Manifest

Persist the exact manifest JSON and canonical digest input. Required fields:

| Field | Rule |
|---|---|
| `schema` | `archivepass-manifest-v1` |
| `version_id` | `v1` for this release |
| `title` | Nonempty UTF-8, at most 160 bytes |
| `filename` | Display/download name, at most 180 UTF-8 bytes; not a path |
| `media_type` | Informational only, at most 100 ASCII bytes; serving remains octet-stream |
| `license_note` | At most 240 UTF-8 bytes |
| `size_bytes` | Positive decimal string, bounded as above |
| `chunk_size` | Integer `1024` |
| `chunk_count` | Integer `ceil(size_bytes / 1024)` |
| `file_sha256` | 32-byte hash represented as 64 lowercase hex characters |
| `merkle_root` | 32-byte hash represented as 64 lowercase hex characters |
| `manifest_sha256` | Hash of canonical manifest bytes described below; excluded from its own input |

Canonical bytes are the UTF-8/ASCII domain `archivepass-manifest-v1` followed by a zero byte, then length-prefixed UTF-8 strings in this order: `version_id`, `title`, `filename`, `media_type`, `license_note`; then `size_bytes` as unsigned 64-bit big-endian, `chunk_size` and `chunk_count` as unsigned 32-bit big-endian, then raw 32-byte file digest and raw 32-byte Merkle root. Each string prefix is its UTF-8 byte length as unsigned 32-bit big-endian. Reject invalid/unpaired Unicode before encoding. Hash these bytes with SHA-256. JSON field ordering, whitespace, local time, host URL, and future ownership are not part of the hash.

The browser computes or independently recomputes the file digest, tree, and canonical manifest. The server recomputes them over the received bytes and rejects mismatches. Keepers independently verify full bytes against the manifest before accepting a commitment. Onchain initialization validates sizes, counts, field bounds and manifest hash from its supplied fields; the contract does not download the entire file. The initially supplied full-file hash and root are uploader commitments; their consistency with all file bytes is established by the offchain computations, not an onchain full-file scan. Expose the manifest for readers to inspect.

### 4.3 Merkle construction

Let `N = ceil(size / 1024)` and `M` be the smallest power of two at least `N`. For real chunk `i`, `bytes_i` are exactly the slice `[i*1024, min((i+1)*1024,size))`. Compute:

```text
leaf(i) = SHA256(0x00 || u32be(i) || u32be(length(bytes_i)) || bytes_i)
pad(i)  = SHA256(0x02 || u32be(i))               for N <= i < M
node    = SHA256(0x01 || left_32 || right_32)
```

Build a complete binary tree over the `M` leaves. For `N=1`, the root is the real leaf and the proof path is empty. Path siblings are ordered leaf-to-root; orientation is derived from the bits of the real chunk index, not supplied by an untrusted caller. A valid proof has exactly `log2(M)` sibling hashes. The verifier rejects indexes outside `[0,N)`, oversized or undersized chunks, malformed hashes/base64, extra siblings, and invalid root reconstruction. The final real chunk's expected length is `size - 1024*(N-1)`; all earlier chunks have length 1024. No alternative padding algorithm is accepted.

Required cross-language vectors include 1 byte, exactly 1 KiB, 1 KiB + 1 byte, a three-chunk file requiring padding, and the 16 MiB bound. Preserve known bytes, digests, roots, indexes, and paths in committed fixtures. A whole-file digest check and a Merkle-root check are distinct validations.

## 5. Asset terms and bounded service policy

The following terms are fixed at initialization and readable together: asset account/network, token ID `archive`, initial owner, immutable manifest fields/digest, the `eligible_providers` account allowlist, `service_origin`, `period_duration`, `max_provider_rate`, `max_slot_spend`, `fund_expiry`, `refund_beneficiary`, maximum providers/commitments, and protocol version. The immutable eligible-provider set contains two through eight distinct valid accounts; these are the only possible provider/payee accounts for this asset. Amounts use yoctoNEAR decimal strings in JSON and checked `u128` in Rust; TypeScript arithmetic uses `bigint`, never floating point. Times are Unix nanoseconds as strings at contract/API boundaries and checked `u64` in Rust. UI conversion to milliseconds must use an explicit safe conversion and is never an authority check.

`service_origin` defines a grid. Slot `s` starts at `service_origin + s*period_duration` and ends at `start + period_duration`. Checked arithmetic is mandatory. A commitment must be scheduled while `now < start`, and its end must be `<= fund_expiry`. There is at most one commitment for any `(provider account, slot)` on this asset, ever. The sum of rates scheduled in one slot must not exceed `max_slot_spend`; each rate must be positive and at most `max_provider_rate`.

Use an accelerated default 120-second period for the local/testnet demonstration, clearly labeled. The immutable protocol accepts 30 seconds through 30 days; the creation UI defaults to a future origin that gives both workers time to accept. Local tests may use an injected clock, but the ordinary UI cannot edit server or chain time. Testnet scripts use real chain time and wait for actual windows. Set a finite expiry beyond the planned demonstration; do not misleadingly call 120 seconds a month of service.

Initial hard bounds: eight provider configurations per asset, sixteen nonterminal commitments, 256 total commitments over the asset lifetime, eight pending payouts, 256 total assets in a local development database, and list-page size at most 50. Onchain counters/records remain bounded; no full archive bytes or unbounded event vector is stored onchain. Compact terminal commitment summaries may remain until the lifetime limit; historic detail lives in receipt logs and the persisted offchain history. Hitting a bound returns a useful error; it must not silently evict obligations or reset uniqueness. A new deployment is needed after the explicitly finite lifetime limit in this prototype.

The owner maintains future configuration only for accounts already in the immutable eligible-provider set: display label (at most 80 UTF-8 bytes), endpoint reference (at most 256 ASCII bytes, validated HTTP/HTTPS URL without credentials), and enabled flag. Account IDs use the SDK's validated account type. The owner cannot add or replace a payee account. Endpoint strings are advisory: the contract proves response bytes, not endpoint reachability. An endpoint edit or disable applies only to newly proposed commitments. Each commitment snapshots its endpoint reference for honest history and its account/payee for settlement. Allowlisting alone does not grant access to funds. If all eligible providers disappear, the MVP can stop spending and eventually refund unused funds; it cannot expand the donor-approved set. A new asset requires separately funded new terms.

## 6. Commitment and challenge state machines

### 6.1 Commitment terms

A proposed commitment immediately reserves the whole payment from available upkeep. It records a monotonically allocated ID, slot/start/end, version/manifest digest/root, exact rate, provider account, payee equal to that provider account, endpoint reference, and proposing owner epoch. The current owner cannot rewrite or cancel it after proposal. This conservative rule avoids ambiguity over which funded terms survive transfer. A provider that never accepts earns nothing; funds remain reserved only until that bounded slot ends.

```text
Proposed -- provider accepts before start --> Accepted
Accepted -- anyone opens during slot ------> Challenged
Challenged -- valid provider proof --------> Earned
Proposed / Accepted / Challenged -- now >= end --> Missed
```

`Earned` and `Missed` are terminal. A repeated expiry call on a terminal commitment returns its state without moving money. A repeated proof fails with a distinct already-settled error. There is no renewed challenge, second earning, per-proof micro-payment, negative reserve, or owner cancellation branch.

| Operation | Authority and time | Effect |
|---|---|---|
| Propose period | Current stable owner; no transfer-call lock; `now < start`; policy and capacity limits pass | Available decreases, reserved increases by exactly rate |
| Accept | Immediate predecessor is provider; state Proposed; `now < start` | Marks consent to exact frozen terms; no ledger movement |
| Open challenge | Anyone; Accepted; `start <= now < end` | Commits one challenge index and seed digest; deadline remains end |
| Open again | Already Challenged | Returns exactly existing challenge, never reselects |
| Submit proof | Immediate predecessor is fixed provider; Challenged; `now < end`; exact identity/index/path checks | Reserved decreases, provider earned credit increases once |
| Expire | Anyone; nonterminal; `now >= end` | Reserved decreases and available increases once; no provider credit |
| Claim | Fixed credit with positive available amount and allowed pending capacity | Available credit becomes pending payment to same creditor |

Proof acceptance at the exact end timestamp fails. Expiry at that timestamp succeeds. Late opening does not extend the deadline. Unaccepted, unchallenged, and invalidly answered periods all earn zero, with different displayed reasons. The contract's result is “no accepted response before deadline”; it must not infer which HTTP server was down.

### 6.2 Challenge identity and selection

A challenge is identified by the contract/network domain, asset/token, version ID, commitment ID, fixed provider, and slot. The open call supplies only the commitment ID; clients cannot choose the index, root, deadline, rate, or challenge ID. Store the selected index, opened-at time, and selection-seed digest with the commitment before returning.

Selection uses SHA-256 over these exact concatenated bytes, in order: the ASCII domain `archivepass-challenge-v1` followed by a zero byte; network domain, contract/asset identity, version ID, and provider account as UTF-8 strings, each prefixed with its UTF-8 byte length as unsigned 32-bit big-endian; commitment ID as unsigned 64-bit big-endian; slot as unsigned 64-bit big-endian; raw 32-byte committed Merkle root; and the runtime's raw 32-byte random seed. Contract/asset identity is the actual account ID on testnet and a stable `local:<asset-id>` identifier locally. Network domain is exactly `near-testnet` or `archivepass-local-v1` for the respective supported modes. Version ID is exactly `v1`. Use checked `u64` monotonic commitment IDs and slot numbers, transported as decimal strings. Interpret the first eight digest bytes as unsigned big-endian and take modulo `N`. Store the full resulting SHA-256 as `selection_digest` and the derived index. Local mode uses server-generated 32-byte cryptographic randomness once and persists the result. No browser-provided randomness or timestamp-only index is accepted. Use an explicit contract initialization network domain; SDK APIs need not supply a chain name. Include fixed-seed golden vectors for both domains.

This is bounded challenge selection, **not a cryptographically strong storage assurance protocol**. Public chain entropy and opening time may be observable or influenced; a provider/caller may choose when to open and may exploit predictable or favorable indexes. Selection has a tiny modulo bias. A provider may retain only likely chunks or fetch the selected chunk after learning it. Once opened, retries cannot grind another index for that commitment. There is no claim of unbiased randomness, hidden challenges, economically enforced replication, or resistance to a colluding caretaker and provider. Commit-reveal would add missed-reveal and timing complexity without solving the central availability limits, so it is excluded from this MVP.

### 6.3 Provider response

The contract method receives `commitment_id`, `version_id`, `chunk_index`, bounded base64 chunk bytes, and bounded sibling hashes. The chunk uses standard padded RFC 4648 base64, with decoded length at most 1,024 bytes; each sibling is exactly 64 lowercase hex characters decoding to 32 bytes, with at most 14 siblings. `chunk_index` is an unsigned integer at most 16,383 and must also be less than the actual manifest chunk count. It compares every client identity field against the stored commitment and its actual selected index, checks authorized provider, validates the exact Merkle shape, and credits only the fixed payee. Root, rate, deadline, and payee are never accepted from the response as authoritative values. Reject malformed input before expensive work. A reasonable JSON body cap is 8 KiB for proof requests; use a tighter measured limit if practical.

An unrelated provider cannot replay another provider's valid public response to earn or settle that commitment. The fixed provider may obtain a valid proof from anyone; the protocol does not prove where those bytes were stored. Domain binding and commitment status prevent reuse as a second payment; the same chunk/path can correctly answer another legitimate challenge selecting that index, but only its own authorized provider and fixed commitment can earn that separately reserved payment.

## 7. Reserve, credits, and asynchronous payments

### 7.1 Disjoint accounting

Track these categories for the asset:

| Symbol | Meaning |
|---|---|
| `I` | Cumulative accepted upkeep principal |
| `A` | Available upkeep, still restricted to future service or final fixed refund |
| `R` | Reserved nonterminal provider obligations |
| `E[p]` | Earned, currently claimable provider credit |
| `F` | Claimable unused-fund refund credit to immutable beneficiary |
| `P[op]` | Pending payment liability, with fixed creditor/kind/amount |
| `D` | Cumulative successfully paid upkeep principal, provider plus refund payments |

At every successful state transition:

```text
I = A + R + sum(E) + F + sum(P) + D
A, R, E, F, P, D >= 0
R = sum(rate of each nonterminal commitment)
Each commitment can enter Earned at most once.
No NFT transfer moves any amount between these buckets.
```

An attached native deposit accepted by `fund_upkeep` is entirely upkeep principal; require positive amount, `now < fund_expiry`, and no expired/refunded asset state. Initialization/operational storage provisioning uses separate named methods/deposits and never silently consumes upkeep. Rejected funding reverts the receipt; it creates no accepted principal. Direct native transfers bypassing `fund_upkeep` are unallocated operational surplus, not attributed sponsorship and not owner-withdrawable. Explain this in funding instructions.

A funding receipt names the root/version, immutable eligible-provider accounts, fixed refund beneficiary, expiry, and policy caps. The sponsor expressly sees that unused funds go to that beneficiary, who may differ from both sponsor and NFT owner. The beneficiary may equal the initial owner if openly selected at creation, but transfer cannot change it or accelerate its entitlement. The eligible-provider set prevents a later caretaker from nominating a new personal payee, but does not prove providers are independent people or that they charge a fair market price.

### 7.2 Expiry and unused money

No new funding or commitments are allowed at or after `fund_expiry`. Every commitment ends no later than that expiry. Anyone can settle expired commitments in bounded batches or one at a time. Then `finalize_expiry` is allowed only when no nonterminal commitments remain, `now >= fund_expiry`, and it has not already run. It moves all `A` into `F` exactly once and marks the reserve expired. It does not touch earned provider credits or pending payments, which remain payable indefinitely under the same bounded stored records. No iteration over historical sponsors is needed.

If an individual commitment is expired after the global expiry, it still releases into `A`; finalization is unavailable until all such releases are accounted for. This prevents a later expiry from stranding returned money after a one-time refund sweep. The UI guides the user through remaining settlements before the final refund action.

### 7.3 Pull payment and callback discipline

Anyone may trigger a provider or refund claim, because the recipient is already fixed. There is no recipient override. One active attempt per creditor/kind simplifies recovery; different creditors can be pending concurrently up to the bound. Claim the current complete credit or an explicitly validated positive subset; choose one consistent MVP API in the implementation plan. Moving credit to pending is atomic before scheduling the native transfer. New earnings may accumulate separately while an older amount is pending.

Each attempt uses a new monotonic operation ID and snapshots kind, creditor, amount, and start time. A private, attempt-specific callback handles exactly one transfer result. Success removes pending and increments `D`. Failure removes pending and restores exactly the same creditor's original credit. Ownership and endpoint changes are irrelevant. Unknown/duplicate callbacks cannot move money. An external account cannot invoke a successful resolution. Do not let a callback deserialize arbitrary bytes or write large unbounded state before settling its fixed record.

Native transfers and their callbacks execute asynchronously; earlier successful receipts do not automatically undo themselves when a later receipt fails. Reserve enough callback gas and make that path small. A lost or failed callback produces an unresolved pending liability, not permission to retry payment from a timer. An operator may investigate real receipts and report uncertainty; the contract must not expose an unauthenticated “assume failed” reset that could double-pay. The local simulator must model success/failure and exactly-once resolution, and distinguish an unknown outcome. [NEAR cross-contract behavior](https://docs.near.org/smart-contracts/anatomy/crosscontract)

### 7.4 Native balance and storage separation

Upkeep principal, operational storage funding, and mandatory one-yocto security deposits are separate ledger concepts. There is no owner claim on operational surplus in this release. Keep a non-withdrawable operational reserve funded at deployment and optionally topped up through `fund_operations`.

Measure storage growth for maximum provider/commitment/credit/pending records. Before a storage-growing action, establish that the contract has operational headroom above recorded upkeep obligations and the storage stake requirement. Use actual `storage_usage * storage_byte_cost`, checked arithmetic, and a documented worst-case reserve for future state growth, including callbacks. Insufficient operational headroom rejects new work before promising service. It may not fund storage by reclassifying sponsor principal.

Onchain account balance is not the same as ledger cash while payments are in flight: a pending amount may already have left the contract before its callback arrives. Report both gross ledger conservation and a receipt-aware liquidity check. At minimum, balance net of required storage must cover nonpending cash liabilities `A + R + sum(E) + F`; track pending separately without falsely counting those amounts as still held. Do not present exact balance equality during asynchronous settlement. After all transfers settle, reconcile actual account balance with remaining liabilities and documented operational surplus. Measure and record deployment costs rather than inventing a fixed affordable storage number. [NEAR storage-cost guidance](https://docs.near.org/smart-contracts/security/storage)

## 8. Stewardship and NFT transfer safety

Implement NEP-171 `nft_transfer`, `nft_transfer_call`, resolver behavior, and `nft_token`, with the required owner checks, security deposit, receiver call, and events. Add immutable descriptive metadata and one-token enumeration for ordinary wallet discovery. No approval extension is exposed; non-null `approval_id` is rejected rather than treated as delegated authority. Use the pinned standards crate where appropriate and verify its observable behavior. [NEP-171](https://github.com/near/NEPs/blob/master/neps/nep-0171.md)

Application authority uses the immediate predecessor and current NFT owner, never merely a signer string supplied through the API. Maintain an increasing `owner_epoch` on every actual ownership change, including a transfer-call's provisional move, any forwarding transfer, and any return. Offchain local owner commands include expected epoch so stale forms fail clearly; contract ownership remains decisive. A stored proposing epoch is provenance, not a condition invalidating a provider's surviving commitment.

### 8.1 Ordinary transfer

`nft_transfer` may occur while challenges, provider claims, or payment promises are outstanding. It changes owner/epoch and emits events; it cannot alter root, available/reserved balances, fixed commitments, deadlines, payees, refunds, or pending operation IDs. The old owner loses configuration and proposal authority immediately upon execution. A stale session or prior UI selection cannot restore it.

The transfer UI displays recipient, content identity, available upkeep, reserved obligations, earned/unpaid claims, expiry/refund beneficiary, and any prototype upgrade-key disclosure. It warns that the recipient takes over future management while fixed claims remain. Use a transfer preview and recipient-account confirmation. Ordinary transfer does not pretend to obtain an onchain receiver signature; recipient acceptance is available through the standard transfer-call path where applicable. A separate offchain invitation may improve clarity but cannot change the standard ownership semantics.

### 8.2 Transfer-call authority lock

ArchivePass adds a narrowly scoped application lock for the lifetime of the receiver/resolver promise chain:

1. Validate the initial transfer, record a unique transfer-call operation/old owner/receiver, set `transfer_call_pending`, and perform the provisional NFT move.
2. While this operation is unresolved, **no account** may configure future providers or propose commitments. This applies even if the temporary receiver forwards the NFT to a third account. No new irreversible owner-controlled spending obligation can be created during reversible custody.
3. Fixed third-party actions remain allowed: funding under unchanged terms, provider acceptance/proof, challenge opening/expiry, fixed-payee claims/callbacks, and final expiry refund. They convey no temporary-owner benefit and must not depend on the transient owner.
4. Ordinary NFT forwarding can follow the standard implementation's ownership semantics. A second nested transfer-call is rejected while the application lock is set. This bounds the custom lock to one promise chain while allowing standard forwarding to be handled by the resolver.
5. The private resolver verifies its own operation and applies the standard keep/return behavior against the actual current token owner, including the case that the receiver has already forwarded it. It must not seize the token from an unrelated subsequent owner. Increment epoch if a return actually changes ownership; do not restore an old epoch.
6. Clear only the matching operation's application lock after successful resolution. A forged or repeated resolver cannot unlock another operation or change obligations.

If the resolver itself fails, show unresolved transfer-call state and freeze owner-controlled service changes rather than guessing that a timeout makes provisional ownership final. There is no arbitrary administrative unlock in this MVP. Native tests must cover receiver keep, return, receiver panic/malformed result, forwarding, attempted configuration before return, nested transfer-call rejection, and private/resolver replay guards. An actual testnet receiver fixture should exercise keep and return if deployment resources permit. Missing testnet resolver coverage must remain an explicit evidence gap.

The wallet view may show the provisional owner during this interval; the ArchivePass UI must also show “Transfer-call pending; future service controls locked.” Do not misreport final acceptance before the resolver receipt.

## 9. Actual keeper protocol and scheduling

### 9.1 Content acquisition and HTTP endpoints

Each keeper has a stable configured provider account, its own data root and SQLite work database, a configured application origin, and network/mode binding. It imports a newly assigned archive by fetching the manifest and bytes from an explicitly allowed application origin. It checks byte length, whole-file SHA-256, canonical manifest digest, and Merkle root before marking `Ready`. Store through a temporary file and atomic rename; never mark a partially downloaded file ready.

Required endpoints, whose exact path naming may be finalized in the implementation plan:

| Endpoint | Behavior |
|---|---|
| `GET /health` | Process/version/mode, provider identity, last worker poll; never claims contract success |
| `GET /archives/:assetId/manifest` | Fixed persisted manifest for a known assigned asset |
| `GET /archives/:assetId/download` | Actual local file bytes, bounded headers and attachment response |
| `GET /archives/:assetId/chunks/:index` | Exact local chunk bytes, strict decimal index validation |
| `GET /archives/:assetId/proof/:index` | Chunk/proof data built from the verified local file/tree, within limits |
| Operator import/worker action | Local authenticated operator route or CLI; not arbitrary public filesystem/network access |

Public read paths map only validated identifiers to known database entries and canonical files under the keeper root. Reject `..`, encoded traversal, drive letters, UNC paths, null bytes, symlink/reparse-point escapes, negative indexes, and out-of-range indexes. Do not expose an endpoint accepting a filesystem path. Do not extract uploaded archives. Serving a file is independent of serving a UI route.

### 9.2 Worker lifecycle

For its configured identity, the worker polls authoritative state at a bounded interval, imports assigned content, accepts exact proposed terms before start if its allowlisted policy permits, opens eligible challenges, submits responses using actual stored bytes and paths, triggers its claims, and observes their final results. The default demo cadence may be two seconds with backoff on errors. It must never auto-accept an unknown contract/network, unverified content, an unapproved rate/policy, or an already-started proposal.

The worker can also expire missed commitments permissionlessly. Persist its observed block/time cursor, attempts, errors, pending transaction hashes, and last outcome. Before resubmitting after a timeout/restart, query authoritative commitment/claim/transaction status. Successful JSON-RPC submission is not final success. Do not issue repeated transfers because an HTTP response was lost. Status transitions must be restart-safe and idempotent.

Testnet proof and acceptance calls are signed by the provider account configured for that keeper, not by the current NFT owner or an anonymous API backend. Dedicated demo keys stay in ignored secret files/environment configuration and never enter browser bundles, logs, exported manifests, or committed fixtures. Local mode explicitly supplies a demo actor to the trusted local ledger, and displays that it is simulated authentication.

### 9.3 Network safety

Do not make the application a general URL fetcher. The initial provider origins are operator-configured allowlisted origins. User-supplied provider endpoint metadata is not automatically fetched by a backend. Content ingestion allows only the configured content-source origin, disables redirects, bounds download time/size, and rejects unexpected hosts/schemes. The demo can explicitly allow the exact loopback hosts/ports needed for its three services; this exception must not become blanket access to arbitrary private addresses, cloud metadata, `file:`, or UNC resources. If external origins are added later, validate DNS resolution and every redirect to prevent SSRF/rebinding. Browser observations are also limited to configured endpoints and must show the actual origin.

Restrict CORS to configured application origins; no wildcard credentialed CORS. Local mutation/operator endpoints use an unpredictable operator token and origin checks where applicable, bind loopback by default, and are not treated as internet-ready authentication. The read-only public file boundary remains separate from local controls. Rate-limit proof/health polling, cap JSON body sizes, and avoid logging raw secret-bearing headers.

Stopping host A means stopping its actual process or disabling its actual HTTP serving and worker with an explicit development fault control. The evidence must show a failed HTTP observation and absence of its proof; a badge toggle alone is insufficient. The contract must never pay or punish based on that local observation.

## 10. Application API and persistence

### 10.1 Domain interface

The implementation plan should fix endpoint names and request DTOs before parallel development. Required operations are:

| Operation | Required inputs / outcome |
|---|---|
| Read environment/status | Mode, network, chain account/code hash if known, deployment-key disclosure, worker observations, achieved evidence levels |
| Upload/create draft | Actual stream, metadata, attestation; returns verified immutable blob/manifest and errors |
| Publish/create asset | Immutable policy, manifest, owner, expiry beneficiary; local transaction or genuine deployment binding |
| Read/list asset | Paginated public metadata, owner/epoch/lock, manifest, policy, ledger, commitments, claims, observation timestamps |
| Fund upkeep | Exact amount string, expected asset/version; authorized mode-specific transaction receipt |
| Configure future provider | Owner/expected epoch, known endpoint reference/account, enabled state |
| Propose / accept period | Frozen slot/provider/rate, then provider consent |
| Open / answer / expire | Commitment ID; proof payload for answer; stable typed result |
| Claim / retry | Credit kind/account; no arbitrary recipient; pending/final receipt |
| Finalize expiry | Fixed beneficiary and derived amount, no editable destination |
| Transfer preview / execute | Current owner/epoch, recipient/token; ordinary or transfer-call result with resolver status |
| Browser download verification | Client-local result with expected/actual digest, source, length and time; never contract settlement |
| History / reconciliation export | Paginated domain events, receipt references, integer ledger, file/protocol/deployment identifiers |

HTTP mutations need request-id idempotency for accidental repeats. Scope the key by mode, asset, actor, and operation; replay returns the same result only if the body hash matches, otherwise conflict. This is additional to domain uniqueness. Never trust a client amount, status, owner, deadline, or ledger total without authoritative checks. Return stable error codes such as `STALE_OWNER`, `OWNER_REQUIRED`, `TRANSFER_PENDING`, `INSUFFICIENT_UPKEEP`, `SLOT_ALREADY_USED`, `PROVIDER_REQUIRED`, `ACCEPTANCE_CLOSED`, `CHALLENGE_NOT_OPEN`, `PROOF_INVALID`, `PROOF_EXPIRED`, `ALREADY_SETTLED`, `STORAGE_HEADROOM`, and `PAYMENT_PENDING`.

### 10.2 SQLite requirements

Use Node 24's working SQLite support with explicit schema migrations, foreign keys, prepared statements, transaction boundaries, and appropriate locking/WAL configuration. Persist every user-visible domain change and corresponding ledger/event atomically. No runtime-only arrays or JSON fixtures may be authoritative for published assets, ownership, balances, commitments, challenges, or payment results.

Minimum logical tables: schema migrations; immutable assets/manifests; local owners/epochs and transfer-call operations; provider configurations; commitments/challenges; available credits; payment attempts; ledger totals/events; request idempotency; content blob metadata; browser/HTTP observations; network/deployment bindings and indexed receipts. Keeper databases separately persist imports and work attempts. The implementation may normalize or combine these tables if constraints remain explicit.

Store integer quantities as canonical decimal TEXT, with JavaScript `bigint` validation/arithmetic. SQLite floating-point coercion and signed-64 integer overflow must not perform money calculations. Unique constraints include asset token identity, provider-slot commitment, operation ID, and request-id scope. Serialize concurrent ledger mutations using transactions, re-read inside the transaction, and update only from validated current state.

Write blobs to a temporary file, validate them, then rename atomically and commit metadata. Recover abandoned temporary/orphaned files using a narrow data-root cleanup command; never scan/delete arbitrary user directories. Backups include SQLite and referenced blob files. Seed data is applied once to an empty database, produces actual sample content, and never overwrites existing user work on restart. Reset is explicit, local-only, and clearly warns which database/data roots it resets.

Local asynchronous payments use a durable outbox. A deterministic test delivery adapter may intentionally succeed or fail and must record delivery before resolving the outbox; its outcome is visibly simulated. An in-flight local payment that survives restart must be reconciled from the adapter's delivery record, not indiscriminately paid again. Testnet pending operations are reconciled from chain state/receipts; local failure toggles cannot modify them.

### 10.3 Contract surface

Expected application methods: initialization, `get_asset`, `get_manifest`, `get_policy`, `get_ledger`, paginated commitment/claim views, `fund_upkeep`, `fund_operations`, `configure_provider`, `propose_period`, `accept_period`, `open_challenge`, `submit_response`, `expire_period`, `finalize_expiry`, `claim_provider`, `claim_refund`, private payment callback, and NFT core/metadata/enumeration methods. The plan may choose equivalent names but must provide an ABI document with deposits/gas, argument encodings, permissions, and returned types.

Owner-controlled application mutations require a security deposit pattern appropriate to the SDK and are blocked by the application transfer-call lock. NFT transfers follow the distinct forwarding/nested-call rules in Section 8; the application lock is not a blanket prohibition on the ordinary forwarding transfer described there. Funding carries its explicit principal; other unexpected attached deposits are rejected rather than silently becoming upkeep. Security deposits are operational surplus. No arbitrary withdrawal, arbitrary promise, mutable root, payout-recipient override, or administrative accounting-reset API is permitted.

Emit standard NFT logs plus versioned ArchivePass events for creation, funding, provider configuration, commitment proposal/acceptance, challenge opening/acceptance/miss, credit/payout attempts/results, expiry refund allocation, and ownership epoch/lock changes. Events include stable IDs and exact string amounts; proof bytes, entire files, secrets, and unbounded metadata do not belong in logs. The application indexes only authenticated successful receipts from its bound contract and preserves unknown/failed receipt states.

## 11. User experience and connected flows

Use a calm, legible archive-service interface with a persistent mode badge. The central detail page should answer in one screen: **what content is this, who can arrange its upkeep, how much money is still restricted, and what was last verified?** An overview total must not hide reserved or earned liabilities.

### 11.1 Screens

1. **Archive library:** actual persisted assets, title/file size, current caretaker, available/reserved money, nearest service deadline, and create/open actions. Helpful empty state uploads an actual file or creates the documented sample once.
2. **Create archive:** file/metadata/public-content step; local hashing and upload progress; immutable manifest preview; policy/expiry/refund beneficiary step; review and create. Validate before publication and explain that changing bytes later creates a new asset.
3. **Archive overview:** title/version, content identity with copy/download-manifest controls, owner/epoch, fund/transfer controls according to role, five distinct balance cards, term/expiry summary, and provider status cards.
4. **Service and challenges:** current and scheduled slots, fixed terms and acceptance status, selected chunk and deadline, open/proof/expiry actions when legal, and genuine progress/worker state. Each success is tied to a specific commitment and receipt.
5. **Download and verify:** choose host A/B, download real bytes, display fetching/hash progress, compare expected length/digest, then offer the verified blob for saving. On mismatch, show expected/actual digests and do not label the file verified. A successful observation records host and time only in the browser/app history.
6. **Stewardship transfer:** inherited-obligation summary, recipient entry/preview, confirmation, pending/final state, and new-owner controls after authoritative refresh. Stale old-owner forms receive a clear rejection and refresh prompt.
7. **Funding and claims:** accepted upkeep principal versus operation reserve; explicit expiry beneficiary; provider earned/pending/paid rows; claim/retry action; unresolved payment explanation; final refund when eligible.
8. **Activity and reconciliation:** paginated timeline with source/mode, account, time, relevant IDs, and genuine receipt links; exact ledger equation and residual; export JSON; operational surplus and key-trust explanation.

Screens may be tabs or routes, but all visible primary actions must be connected. Do not ship decorative buttons, fake charts, constant health badges, fabricated counts, or placeholder transaction links. Errors should state what failed and what remains unchanged in the specific operation. If a chain call's result is unknown, show “checking outcome” rather than a success toast.

### 11.2 Display and accessibility

Use human-readable NEAR formatting derived from exact 24-decimal units; expose the exact integer on detail/copy controls. Do not parse user input with `Number` or allow scientific notation. Small rates should remain visibly nonzero. Dates show local time with UTC available; countdowns explicitly reference authoritative recorded deadlines. Status uses text/icons as well as color.

Support desktop and 360-pixel mobile width without horizontal page overflow. Tables become usable cards or scroll within a labeled region. Inputs have labels, keyboard access, visible focus, error association, and disabled reasons. Async actions prevent accidental double submission while permitting safe refresh/retry. Long account IDs, hashes, and filenames wrap or truncate with full copyable values. Respect reduced motion. Use adequate contrast and avoid reliance on hover.

### 11.3 Required language

- Local banner: “Local test ledger · demo identities · no blockchain funds.”
- Testnet banner: “NEAR testnet · faucet funds.” Include actual account/network, last sync, and any key-retention disclosure.
- Proof result: “Sampled response accepted: chunk [i], before [deadline]. This does not prove continuous uptime or a complete replica.”
- Browser result: “Full file downloaded from [host] and SHA-256 verified in this browser at [time].”
- Missed period: “No accepted response before the deadline. Payment returned to available upkeep.”
- Funding: “Unused funds after [expiry] go to [fixed beneficiary]. The caretaker cannot withdraw upkeep.”

## 12. Security, abuse, and practical limitations

| Threat or limit | Required handling / honest boundary |
|---|---|
| Former owner or stale browser acts after transfer | Authoritative current-owner check plus epoch freshness; never client-only gating |
| Temporary transfer-call holder reserves funds then returns NFT | Global owner-action lock through matching resolver; forwarding cannot escape it |
| Root/rate/payee/deadline rewritten during handover | Immutable commitment snapshots and no edit/cancel method |
| Proof replay, wrong provider/index/version, malformed path | Fixed identity binding, exact shape/bounds, signer check, terminal state guard |
| Owner favors own provider | Immutable eligible-provider accounts and caps prevent adding a new personal payee; a colluding eligible provider that submits valid bytes can still earn. No anti-collusion, independent-identity, or market-price guarantee |
| Provider serves proof but not public HTTP | Valid proof can still earn. Show HTTP observations separately; disclose this limitation prominently |
| Keeper fetches another keeper's chunk | Permitted by proof semantics; no independent-copy claim |
| Caller manipulates opening time | One persisted challenge, fixed slot/deadline, explicit weak-randomness analysis; no strong-assurance marketing |
| No process wakes the contract | Honest awaiting-trigger states; permissionless fixed actions; worker heartbeat and restart procedures |
| Concurrent claims or callback replay | Reserve credit before dispatch; monotonic attempt IDs; private idempotent callback; no timeout-based credit restoration |
| Callback fails after transfer succeeds | Leave unresolved pending; inspect receipts; never repay on assumption |
| Storage griefing | Hard bounds, measured operational funding/headroom, no unbounded contributor or event maps |
| Uploaded malicious or private content | Public attestation, opaque attachment delivery, no execution/extraction; local tool is not a general public-hosting moderation system |
| Path traversal/SSRF | Known IDs and canonical roots; constrained origins and redirects; no arbitrary filesystem or URL input |
| Content disappears from both keepers | Asset identity and ledger remain, but recovery is not guaranteed; finite budget and availability limitations are explicit |
| Testnet upgrade key | Display retained-key authority; no irreversible-custody claim until actually verified keyless |
| Browser/report falsifies success | Client observations do not affect contract payments; authoritative receipt checks for chain status |
| Lost/deleted provider or beneficiary account | Claim beneficiary remains fixed; failed payout restores same claim. No redirection rescue in MVP |
| All providers disappear or expiry arrives | Stop earning, release missed reservations, fixed unused-fund refund; no automatic replacement or guaranteed preservation |

There is no punishment/slashing for a missed period; nonpayment is the agreed consequence. No inference about physical storage, lawful ownership, correctness of archive contents, or long-term preservation follows from a SHA-256 match.

## 13. Verification and acceptance gates

Record each gate independently with commands, date, environment, artifacts, and actual outcomes. A later gate cannot be inferred from an earlier one. Missing network credentials or unavailable testnet are limitations, not permission to fabricate receipts or switch modes invisibly.

### Gate A — Protocol and persistent local vertical path (required)

- Fresh install starts the application and two keepers using documented commands on the actual Windows/Node environment.
- Upload a nontrivial actual file; browser, server, each keeper, and golden-vector verifier agree on its manifest/digest/root. Reject empty/oversized uploads and claimed digest mismatches.
- Both distinct HTTP ports return exact full bytes from their own content directories. Browser full-download verification succeeds against each; a corrupted response fails verification.
- Create/fund/configure/propose/accept/open/respond/claim works through connected UI/API. Accepted proof comes from actual file bytes; no canned success response substitutes for verification.
- Schedule two providers, open a challenge, transfer Alice to Bob, and show unchanged content/terms/obligations. Alice's stale proposal/configuration request fails server-side; Bob can schedule a later slot.
- Provider proof and fixed-payee payout succeed across that transfer; owner withdrawal/active-payee edit is unavailable and rejected at the authority boundary if attempted.
- Stop host A's actual process before an eligible later slot; show HTTP failure and no response. At the real local deadline settle unpaid; reserve returns to available. Host B's full file still verifies.
- Duplicate proof, altered byte, wrong index/version/provider, extra/missing sibling, boundary deadline, and same provider-slot proposal fail without ledger movement.
- Simulated payout failure restores exactly the same credit once; retry succeeds. Pending transfer/restart recovery does not double-pay. Label this simulated payment delivery.
- Restart browser, app, and both keeper processes with the same data directories. Ownership, all ledger buckets, content files, challenge indexes, obligations, credits, attempts, and history persist. A missed offline window becomes missed, not retroactively earned.
- Expire all outstanding periods, finalize upkeep expiry once, and pay only the fixed beneficiary; provider earned/pending claims remain intact.
- Concurrent local funding/proposal/claim requests preserve conservation, uniqueness, and authority. Test invalid JSON/body sizes, traversal, disallowed origins, and unknown files.
- Desktop and 360-pixel browser checks cover every main flow, keyboard/error states, actual downloads, and honest mode/health labels. Production build succeeds.

### Gate B — Rust contract unit tests and WASM (required)

- Build the actual contract using the available Rust wrapper and pinned SDK dependencies; produce a reproducible WASM artifact and its SHA-256.
- Test initialization bounds and immutable manifest hash encoding; cross-language golden vectors and final-chunk/padding edge cases.
- Test funding/principal conservation, provider-slot/rate/cap guards, provider consent, actual proof verification, missed release, expiry finalization, and fixed-beneficiary refund.
- Test ordinary NFT transfer during a challenge and during payout; old authority rejected, fixed claims retained, owner epoch increases correctly.
- Test transfer-call keep/return/failure/malformed result/forwarding, attempted owner action during provisional custody, nested call guard, and resolver replay/private checks.
- Test callback success, transfer failure, wrong/duplicate callback, new credit earned during pending payment, unknown outcome staying pending, and unauthorized recovery rejection.
- Test worst-case chunk/proof and bounded collections, checked overflow, insufficient operational storage headroom, unauthorized payable calls, exact-one-yocto NFT behavior, and one-token metadata/enumeration.
- Measure actual worst-case storage/gas where the available environment permits; explicitly separate native mocked-context tests from receipt-level or testnet behavior.

Native unit tests do not prove real cross-account receipts execute as modeled. WASM compilation proves an artifact was built, not that it was deployed or exercised.

### Gate C — Actual NEAR testnet vertical proof (target; report exact achieved subset)

Use dedicated faucet-funded archive, caretaker A/B, provider A/B, and fixed refund accounts. Bind the UI/worker to actual contract/network values. Preserve real transaction hashes, final receipt status, account balances, code hash, and timestamps; do not invent explorer URLs. A read-only view plus scripts is acceptable for wallet signing in the development prototype if the UI clearly exposes which actions require the documented signed script. Core local UI actions must still be fully connected.

Required target sequence:

1. Deploy/initialize actual WASM, read token/manifest/policy/keys, and fund actual native upkeep plus separate operations balance.
2. Propose and provider-sign acceptance for actual bounded periods; two keepers have verified actual archive bytes.
3. Open an actual challenge and submit an actual provider-signed chunk/path; confirm earned credit in chain state.
4. Transfer the actual NFT during another outstanding challenge; confirm new owner and failed stale-owner call.
5. Prove after transfer and make an actual native payout; confirm transfer receipt and fixed recipient. Exercise ownership transfer during a pending payout if the harness can deterministically create that interleaving; otherwise retain the unit-test evidence and label the live interleaving unverified.
6. Let a genuine period miss its chain deadline, settle it, and demonstrate replay/invalid-proof rejection in finalized receipts.
7. Exercise fixed expiry refund with an appropriately short-lived separate test fixture if the primary asset's expiry is too distant.
8. Exercise a real failed native transfer and recovery using a deliberately unavailable dedicated destination/account fixture where feasible; show failure and restored fixed credit. A local failure toggle is not evidence for this gate.
9. Reconcile all completed chain payments and remaining principal against actual balances/operational funds. Record any unresolved pending receipt honestly.

A deployed contract with only successful view calls is “deployed, flow unverified.” A keeper serving localhost while signing actual testnet transactions is “testnet settlement with local HTTP keepers,” not public decentralized hosting. Transfer-call receiver fixtures, measured worst-case gas, and keyless deployment are separate explicit rows in the evidence matrix, with pass/fail/not-run states.

### Gate D — Reproducibility and delivery (required)

Provide README, architecture/threat notes, exact API/ABI, manifest/proof protocol and golden fixtures, environment template, schema/migration/reset/backup instructions, keeper start/stop/restart commands, test and build commands, actual deployment/verification scripts, and a concise demonstration script. Commit no keys, generated databases, full user uploads, secret-bearing logs, or fabricated proof of execution.

The final report states local functional, Rust unit, WASM, receipt integration, actual testnet, live transfer-call, and keyless status independently. Capture screenshots of actual UI and a machine-readable scenario/evidence report. Public repository creation, deployment hosting, and social posting require later authorization; preparing local artifacts does not authorize those actions.

## 14. Operational deliverables and implementation constraints

Use the already available Node 24 runtime and built-in SQLite. The workspace has Rust tooling through a workspace-local toolchain script, a WASM target, and near-sdk/near-contract-standards 5.30.0; verify paths/version output when implementing instead of reinstalling the stack unnecessarily. Package manager invocation and local TCP/dependency operations may require the environment's approval mechanism. Default ArchivePass ports are application API `8788`, frontend development server `5174`, keeper A `8791`, and keeper B `8792`, distinct from AllTogether's `8787`/`5173`; configure them through documented environment variables.

Suggested independent layout, to be finalized by the implementation plan:

```text
archivepass/
  PRODUCT_SPEC.md
  IMPLEMENTATION_PLAN.md
  README.md
  package.json / lockfile
  src/ or apps/          browser and application service
  packages/protocol/    pure byte/proof/DTO utilities
  keeper/               actual HTTP service and persistent worker
  contract/             independent Rust crate and tests
  scripts/              start, fixtures, deploy, verify, evidence
  tests/                domain/API/process/browser scenarios
  fixtures/             public sample archive and golden vectors
  docs/                 ABI, operations, evidence, threat notes
  data/                 ignored SQLite/blobs/keeper copies
  .secrets/              ignored dedicated testnet credentials
```

The sample archive must contain useful, redistributable documentation/data created for this demonstration; no private user documents. At least one file must span multiple non-power-of-two chunks so the live proof path exercises padding. Different provider IDs, owner IDs, and refund beneficiary should be obvious in the demo; shared control by the development operator is disclosed.

Recovery documentation covers interrupted uploads, orphan files, locked SQLite, keeper import mismatch, stopped workers, RPC throttling, missed deadlines, pending payment outcomes, callback failure, and exhausted operational storage headroom. A retry must be safe because authoritative state was checked, not because the UI assumes a prior click failed.

No product implementation begins until the separate implementation plan is complete. That plan should freeze protocol/API ownership boundaries, test fixtures, and independent development work packages before integration. It may refine module structure and operational defaults; any relaxation of a monetary, transfer, or evidence invariant requires an explicit specification amendment rather than an undocumented shortcut.

## 15. Completion standard

ArchivePass is a credible prototype when a reviewer can retrieve a real file, verify it, observe a real sampled response earn only its bounded payment, transfer stewardship with that payment obligation intact, reject the stale caretaker, observe a genuinely missed provider period return its reservation, and reconcile the finite reserve after restart. The report must make clear exactly which portions were local, unit-tested, built, and executed on testnet.

The final claim is portable funded stewardship under explicit trust assumptions. It is not proof of permanent, independent, continuously available storage.
