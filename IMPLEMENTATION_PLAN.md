# ArchivePass implementation plan

5 November 2026 · handoff protocol `archivepass-v1`

This plan implements PRODUCT_SPEC.md v1.0. No implementation begins until this file is complete. It authorizes no public hosting, mainnet use, repository publication or social posting. AllTogether remains independent in `../alltogether`: share only the existing toolchain, never application code, contracts, identities, databases or keys. The product specification remains authoritative for monetary and transfer invariants.

## 1. Sequence and exclusive development ownership

The integrating agent creates the single-package configuration, `shared/**` DTO/protocol modules and golden fixtures first, then dispatches three development agents concurrently. They can implement against the interfaces below while shared code is being completed; they must not change shared interfaces independently.

| Owner | Exclusive paths | Responsibility |
|---|---|---|
| Integrator | `shared/**`, `fixtures/**`, `scripts/**`, `tests/integration/**`, root configuration, README and general docs | Protocol, fixture freeze, package scripts, integration, testnet adapter/harness, evidence |
| Backend/keeper agent | `server/**`, `keeper/**`, `tests/server/**`, `tests/keeper/**`, `docs/STORAGE.md`, `docs/OPERATIONS.md` | Persistent local domain/API, durable payments and two actual HTTP keeper processes |
| Frontend agent | `web/**`, `tests/web/**` | Complete connected responsive browser workflow and independent browser hashing |
| Rust agent | `contract/**`, `docs/CONTRACT.md` | Independent contract, native tests, reproducible WASM build instructions |

Agents report commands/results, omissions and touched files. Integrator reviews monetary/transfer invariants before joining components, resolves interface mismatches and owns final QA. Required stages: freeze interfaces/fixtures; parallel implementation; integrated local canonical/adverse/restart flows; genuine testnet target; mobile/accessibility/evidence delivery. Any relaxation of specification invariants requires a specification amendment, not an undocumented shortcut.

## 2. Package and environment

Use single independent ESM package `archivepass`, Node 24.22.1 and built-in `node:sqlite`, React/React DOM 19.3.1, Vite 8.3.6, TypeScript 7.0.2, near-api-js 7.4.0. Rust uses near-sdk/near-contract-standards 5.30.0 via `../scripts/with-rust.ps1`. Verify installed APIs/tool versions rather than reinstalling. Bundled pnpm invocation is recorded in root EXECUTION_STATUS.md. Preserve AllTogether's running services.

```
archivepass/
  shared/{types,validation,encoding,merkle,manifest,challenge,money,index}.ts
  server/{main,config,http,db,content,domain,outbox,chain}.ts
  server/migrations/**
  keeper/{main,config,http,db,import,worker,authority}.ts
  web/{index.html,src/**}
  contract/{Cargo.toml,Cargo.lock,src/**}
  fixtures/{sample-public.txt,protocol-v1.json}
  scripts/**
  tests/{protocol,server,keeper,integration,web}/**
  docs/{API,PROTOCOL,CONTRACT,STORAGE,OPERATIONS,SECURITY,EVIDENCE}.md
  data/{app,keeper-a,keeper-b}/       # ignored
  .secrets/                         # ignored, dedicated faucet keys only
```

Ports: API `127.0.0.1:8788`, Vite `127.0.0.1:5174`, A `127.0.0.1:8791`, B `127.0.0.1:8792`. API prefix `/api/v1`. Environment: `ARCHIVEPASS_MODE=local|testnet`, `ARCHIVEPASS_DATA_DIR`, `ARCHIVEPASS_API_PORT`, `ARCHIVEPASS_WEB_ORIGIN`, `ARCHIVEPASS_OPERATOR_TOKEN`, `ARCHIVEPASS_KEEPER_ORIGINS`, testnet RPC/registry path. Keeper CLI: `--id a|b --port --data-dir --provider --api-origin --mode`; config supplies operator token, approved assets/policy and optional dedicated provider key path. A/B have distinct directories, SQLite files, identities and processes. Never print secrets.

Required scripts: `dev:api`, `dev:web`, `keeper:a`, `keeper:b`, `seed`, `typecheck`, `test`, `test:protocol`, `test:server`, `test:keepers`, `test:integration`, `build`, `contract:test`, `contract:build`, `testnet:bootstrap`, `testnet:scenario`, `evidence`. Prefer Node test runner and existing tools. Document exact Windows commands. Stop owned processes through their exec sessions; network PIDs may be redacted to zero. A supervisor may launch children but must preserve distinct processes and report child failure.

## 3. Frozen shared DTOs

JSON and TypeScript DTOs use snake_case matching Rust serde. No camelCase aliases. Monetary values are yoctoNEAR canonical decimal strings. Times/durations are Unix nanoseconds/u64 strings; all IDs, epochs, slots, counters and byte lengths also decimal strings except explicitly numeric fields below. Grammar `0|[1-9][0-9]*`, checked u64/u128 bounds; never floats, exponent notation, leading zeroes or serialized bigint. Hashes exactly 64 lowercase hex characters. Account IDs use NEAR grammar even for local demo actors. Asset IDs are generated lowercase UUIDs, never filenames. Local actors can be `alice.archivepass.testnet`, `bob.archivepass.testnet`, `keeper-a.archivepass.testnet`, `keeper-b.archivepass.testnet`, `refund.archivepass.testnet`; local labels do not assert actual chain accounts.

```ts
export type Decimal = string;
export type AccountId = string;
export type HashHex = string;
export type AssetId = string;
export type Mode = 'local'|'testnet';
export interface Manifest {
  schema:'archivepass-manifest-v1'; version_id:'v1'; title:string;
  filename:string; media_type:string; license_note:string;
  size_bytes:Decimal; chunk_size:1024; chunk_count:number;
  file_sha256:HashHex; merkle_root:HashHex; manifest_sha256:HashHex;
}
export interface Policy {
  service_origin:Decimal; period_duration:Decimal; max_provider_rate:Decimal;
  max_slot_spend:Decimal; fund_expiry:Decimal; refund_beneficiary:AccountId;
  eligible_providers:AccountId[]; max_nonterminal_commitments:16;
  max_total_commitments:256; max_pending_payouts:8;
}
export interface ProviderConfig {
  provider_id:AccountId; label:string; endpoint:string; enabled:boolean;
}
export interface Challenge {
  chunk_index:number; opened_at:Decimal; deadline:Decimal; selection_digest:HashHex;
}
export type CommitmentState = 'Proposed'|'Accepted'|'Challenged'|'Earned'|'Missed';
export interface Commitment {
  commitment_id:Decimal; provider_id:AccountId; payee:AccountId; slot:Decimal;
  start:Decimal; end:Decimal; rate:Decimal; version_id:'v1';
  manifest_sha256:HashHex; merkle_root:HashHex; endpoint:string;
  proposed_owner_epoch:Decimal; state:CommitmentState; challenge:Challenge|null;
  accepted_at:Decimal|null; settled_at:Decimal|null;
  missed_reason:'not_accepted'|'not_opened'|'no_accepted_response'|null;
}
export interface Proof {
  commitment_id:Decimal; version_id:'v1'; chunk_index:number;
  chunk_base64:string; siblings:HashHex[];
}
export interface Credit {
  kind:'provider'|'refund'; creditor:AccountId; available:Decimal; pending:Decimal;
  paid:Decimal; pending_operation_id:Decimal|null;
}
export interface Receipt {
  source:'local'|'near-testnet'; status:'Pending'|'Succeeded'|'Failed'|'Unknown';
  transaction_hash:string|null; receipt_ids:string[];
  local_event_id:Decimal|null; explorer_url:string|null;
}
export interface PaymentAttempt {
  operation_id:Decimal; kind:'provider'|'refund'; creditor:AccountId; amount:Decimal;
  started_at:Decimal; status:'Pending'|'Succeeded'|'Failed'|'Unknown';
  receipt:Receipt|null; resolved_at:Decimal|null;
}
export interface Ledger {
  principal_in:Decimal; available_upkeep:Decimal; reserved_upkeep:Decimal;
  earned_credit:Decimal; refund_credit:Decimal; pending_payments:Decimal;
  principal_paid:Decimal; conservation_residual:Decimal;
  operations_funded:Decimal; security_deposits:Decimal;
}
export interface TransferLock {
  operation_id:Decimal; old_owner:AccountId; receiver_id:AccountId; started_at:Decimal;
}
export interface Asset {
  asset_id:AssetId; mode:Mode;
  network_domain:'archivepass-local-v1'|'near-testnet'; contract_id:string;
  token_id:'archive'; protocol_version:'archivepass-v1'; manifest:Manifest;
  policy:Policy; owner_id:AccountId; owner_epoch:Decimal;
  transfer_call_pending:TransferLock|null; reserve_expired:boolean;
  providers:ProviderConfig[]; ledger:Ledger; credits:Credit[];
  created_at:Decimal; observed_at:Decimal;
  deployment:{code_hash:string|null;
    key_status:'local'|'verified_keyless'|'retained'|'unknown'; verified_at:Decimal|null};
}
export interface Event {
  event_id:Decimal; asset_id:AssetId; at:Decimal; actor_id:AccountId|null;
  name:string; data:Record<string,unknown>; receipt:Receipt;
}
export interface Page<T> {items:T[]; next_cursor:string|null;}
export interface ApiError {
  error:{code:string;message:string;details?:Record<string,unknown>}; request_id:string|null;
}
export type ChainAsset = Omit<Asset,'asset_id'|'mode'|'observed_at'|'deployment'>;
```

`conservation_residual` must be `"0"`; disagreement raises integrity diagnostics, never clamping or rewriting balances. Totals aggregate separate creditor rows. Numeric exceptions: chunk count/size/index, page limit and fixed bound constants. UI converts ns to ms explicitly/safely and parses/formats NEAR exactly; authority compares original ns.

Environment DTO: `{mode,network_domain,now,api_version,local_actors:AccountId[],keeper_bindings:{provider_id,origin}[],operator_auth_required:boolean,deployments:{asset_id,contract_id,code_hash,key_status}[],last_sync_at:Decimal|null,evidence:Record<string,{status:'pass'|'fail'|'not_run',observed_at:Decimal|null,detail:string}>}`. Evidence keys are `local_functional,rust_unit,wasm,receipt_integration,testnet_flow,live_transfer_call,keyless`. Never promote unrun gates based on health.

## 4. Frozen HTTP and command contract

Responses are direct DTOs. JSON mutation bodies capped 8 KiB (64 KiB for asset creation); proof caps also enforce <=1024 decoded chunk bytes and <=14 siblings. Errors use ApiError. Status: malformed 400, missing token 401, authority 403, absent 404, stale/domain conflict 409, invalid bounds/proof 422, oversized 413, throttled 429, RPC unavailable 503. Stable codes include specification codes plus `INVALID_INPUT,NOT_FOUND,REQUEST_ID_CONFLICT,MODE_MISMATCH,PAYMENT_UNKNOWN,CONTENT_MISMATCH,CAPACITY_REACHED,SIGNED_ACTION_REQUIRED,SIGNED_DEPLOYMENT_REQUIRED`.

Local mutations require `Authorization: Bearer <operator-token>` and exact configured browser Origin when present. Token is deliberately supplied through local setup, not public environment responses; it is a local operator credential, never a wallet. Every mutation requires `X-Request-Id` UUID. Scope by mode/asset-or-draft/actor/operation; persist validated normalized body hash and result. Same key/body replays stored result; changed body conflicts. External payment replay never follows HTTP retry blindly.

| Route | Request | Result |
|---|---|---|
| `GET /health` | none | `{status:'ok',mode,version,now}` |
| `GET /api/v1/environment` | none | Environment |
| `POST /api/v1/drafts` | raw octet-stream plus metadata header below | 201 `{draft_id,manifest,created_at}` |
| `GET /api/v1/drafts/:draft_id` | none | persisted draft DTO |
| `POST /api/v1/assets` | `{draft_id,owner_id,policy,providers:ProviderConfig[]}` | local 201 Asset; testnet SIGNED_DEPLOYMENT_REQUIRED |
| `GET /api/v1/assets?cursor=&limit=20` | limit 1..50 | Page<Asset> |
| `GET /api/v1/assets/:id` | none | Asset |
| `GET /api/v1/assets/:id/manifest` | none | Manifest |
| `GET /api/v1/assets/:id/download` | none | actual immutable bytes |
| `GET /api/v1/assets/:id/commitments?cursor=&limit=20` | optional provider_id | Page<Commitment> |
| `GET /api/v1/assets/:id/payments?cursor=&limit=20` | none | Page<PaymentAttempt> |
| `GET /api/v1/assets/:id/history?cursor=&limit=20` | none | Page<Event> |
| `GET /api/v1/assets/:id/export` | none | `{schema:'archivepass-export-v1',exported_at,asset,commitments,payments,events,observations}` |
| `GET /api/v1/assets/:id/transfer-preview?receiver_id=...` | account | `{asset,receiver_id,nonterminal_commitments,unpaid_credits,disclosures:string[]}` |
| `POST /api/v1/assets/:id/commands` | CommandEnvelope | CommandResult |
| `POST /api/v1/assets/:id/observations` | observation below | persisted `{observation_id,...}` |
| `GET /api/v1/workers` | none | array `{provider_id,origin,last_observed_at,reachable,health:null|object,error:null|string}` |

Upload `X-Archive-Metadata` is base64 UTF-8 JSON `{title,filename,media_type,license_note,public_distribution_attested:true,expected_file_sha256,expected_merkle_root,expected_manifest_sha256}`; header <=8 KiB. Stream body 1..16 MiB. Browser computes expectations; server recalculates all hashes/tree and rejects discrepancies. No multipart dependency required. Draft IDs UUIDs; no partial upload becomes publishable. Content deduplicates only within ArchivePass.

```ts
export type Command =
 | {type:'fund_upkeep';amount:Decimal;version_id:'v1'}
 | {type:'fund_operations';amount:Decimal}
 | {type:'configure_provider';expected_owner_epoch:Decimal;provider:ProviderConfig}
 | {type:'propose_period';expected_owner_epoch:Decimal;provider_id:AccountId;slot:Decimal;rate:Decimal}
 | {type:'accept_period';commitment_id:Decimal}
 | {type:'open_challenge';commitment_id:Decimal}
 | {type:'submit_response';proof:Proof}
 | {type:'expire_period';commitment_id:Decimal}
 | {type:'finalize_expiry'}
 | {type:'claim_provider';provider_id:AccountId}
 | {type:'claim_refund'}
 | {type:'nft_transfer';expected_owner_epoch:Decimal;receiver_id:AccountId;token_id:'archive'}
 | {type:'nft_transfer_call';expected_owner_epoch:Decimal;receiver_id:AccountId;token_id:'archive';msg:string};
export interface CommandEnvelope {actor_id:AccountId;command:Command;}
export interface CommandResult {
  asset:Asset;commitment:Commitment|null;payment:PaymentAttempt|null;receipt:Receipt;
}
```

Claims always claim full available credit. No amount/recipient override. One pending per creditor/kind, <=8 total; a second claim returns PAYMENT_PENDING even if new earnings accumulated. New earnings remain available until pending resolution. Funding simulates accepted principal locally, not a bank balance/wallet transfer.

Command roles: current stable owner + matching epoch for configure/propose/ordinary transfer/transfer-call; provider predecessor for accept/prove; anyone for fund/open/expire/finalize/fixed claims. NFT forwarding during transfer-call lock remains legal ordinary transfer; configure/propose remain locked, nested transfer-call rejected. Expected epoch is local stale-form guard and contract extension on owner app methods; actual predecessor/current ownership always decisive.

Observation body `{source_origin,started_at,finished_at,size_bytes,expected_sha256,actual_sha256,verified:boolean,error:string|null}` is persisted as `browser_reported`, never a settlement oracle. Source must be configured keeper origin. Worker observation errors do not modify commitments.

Testnet browser commands return SIGNED_ACTION_REQUIRED with exact documented signed-script instruction unless genuine browser signing is implemented. `actor_id` must never impersonate a chain signer. API provides authoritative views and real indexed receipts; operator CLI binds verified deployment, no public self-asserted contract-state route. Workers sign their provider account. Failed RPC never falls back to local success.

Development fault endpoints require token and `ARCHIVEPASS_DEV_FAULTS=1`: `POST /api/v1/dev/payments/next-outcome` `{outcome:'success'|'failure'|'unknown'}`; `POST /api/v1/dev/payments/:operation_id/reconcile` `{}` consults durable delivery receipt, accepts no outcome/credit override. Disable these in testnet. No ordinary clock-edit, forged callback, payee-edit or admin unlock endpoint.

## 5. Shared cryptography and protocol freeze

Shared hashes are **async WebCrypto** SHA-256 over Uint8Array, usable unchanged in browser and Node. Public API: `validateManifest(manifest):void`, `encodeManifest(manifest):Uint8Array`, `hashManifest(manifest):Promise<HashHex>`, `buildArchive(bytes,metadata):Promise<{manifest,tree}>`, `buildProof(tree,bytes,index,commitment_id):Promise<Proof>`, `verifyProof(manifest,proof):Promise<boolean>`, `encodeChallenge(input):Uint8Array`, `selectChallenge(input,seed):Promise<{selection_digest,chunk_index}>`, `parseU64`, `parseU128`, `parseNear`, `formatNear`. Metadata type excludes computed fields; tree is immutable hash levels, leaf-to-root representation documented in shared/types. Integrator publishes exact signatures before agent code needs them.

No awaits inside synchronous monetary SQLite transaction: precompute/verify proof against a snapshot outside transaction, then transaction re-reads asset/challenge/provider/state/deadline and confirms immutable fields match snapshot before credit. Challenge random seed can be generated/hash-computed before transaction but re-read state and insert only if not already opened; race loser returns existing challenge. No browser randomness accepted.

Implement specification byte encodings verbatim: UTF-8 length prefixes, checked BE u32/u64, null-terminated domains, real/padded leaf separation, complete power-of-two tree, exact final chunk length and path depth, orientation from index. Validate unpaired surrogates, byte-based metadata limits, strict lowercase hex and canonical padded base64 (decode/re-encode comparison). File/root/canonical manifest hashes are separate validations. Limits stay 1..16 MiB, chunk1024, <=16384 leaves, depth<=14.

Golden fixture schema `archivepass-fixtures-v1`: deterministic bytes `byte[i]=i mod 251`, sizes 1,1024,1025,2500,16777216; metadata, canonical manifest bytes hex, file digest/root, selected exact proofs, fixed seed/domain/challenge inputs, selection digest/index. Store small bytes base64 and large generator description; no 16 MiB committed upload needed. All indices for small cases, first/middle/last maximum. Include both local/network domains, stable local identity and testnet account identity. Independently verify expected outputs using Rust or standalone reference, then freeze; tests consume committed outputs, not freshly generated expected values. Include malformed chunk/path/base64/Unicode vectors and overflow boundaries.

Sample public file is original redistributable useful ArchivePass operating/recovery documentation with CC0 notice, 2–4KiB and three chunks to exercise padding. It must actually be uploaded/served/proved, never replaced by canned success JSON.

## 6. Backend persistence and domain

SQLite: explicit migrations, foreign keys, WAL, busy timeout, prepared statements, short BEGIN IMMEDIATE transactions. Every domain change, ledger update, event and idempotency result commit atomically. Decimal TEXT arithmetic in BigInt, never SQLite SUM/casts/float. Re-read all authority/current state inside transaction. Tables: migrations; drafts/blobs; assets immutable manifest/policy plus owner/epoch/lock; provider_configs; commitments/challenges; credits; payment_attempts; local_delivery_outbox/receipts; ledger_totals; events; idempotency; observations; deployment_bindings/chain_receipts. Bounded JSON for nested immutable terms allowed; runtime arrays/fixtures cannot be authority.

Uniqueness: asset token identity, `(asset_id,provider_id,slot)` forever, `(asset_id,operation_id)`, creditor/kind, request scope. Enforce <=256 local assets, <=8 provider configs, <=16 nonterminal/256 lifetime commitments, <=8 pending payouts; never evict obligations or reuse slot uniqueness. No cancel/edit commitment route.

Blob lifecycle: write temp under canonical approved root, bounded stream+hash, validate complete manifest/tree, close and atomic rename to digest-derived final path, then commit metadata. Interrupted upload is never Ready. Failed metadata commit may leave orphan; explicit cleanup only traverses known roots/references, never user directories or reparse points. Backup consistent SQLite snapshot plus referenced blobs. Seed once on empty state, never overwrite existing work on boot; reset explicit/narrow/local.

Propose reserves complete rate immediately. Slots derived from origin+slot*duration with checked u64; future-only, end<=expiry, positive rate<=cap, sum per slot<=cap. Provider accepts only before start. Open in [start,end), stores seed-derived challenge exactly once; reopen returns same. Proof exact end fails; expire exact end succeeds. Terminal expiry idempotent; repeated proof ALREADY_SETTLED. Configure affects only future proposals. Owner transfer changes only owner/epoch, never commitments/buckets/payees/refund. Assert conservation after every transaction and on boot; never silently repair mismatches.

Durable local payment: claim transaction moves full credit to Pending and creates outbox before delivery. Adapter writes unique durable delivery receipt by operation before resolver, with visibly simulated success/failure. Success moves pending to paid once; failure restores fixed original creditor/kind once; unknown remains pending. On restart consult receipt before any delivery; timer never implies failure. New earnings stay separate. Private internal resolver derives amount/recipient from fixed attempt, ignores duplicate/unknown callbacks. Tests interrupt after outbox creation and after delivery receipt before resolution.

Local transfer-call uses durable operation/lock and test receiver fixtures, follows standard keep/return/forward semantics. Return only if actual owner is receiver; forwarding cannot clear owner-action lock; nested call rejected. Receiver outcome cannot be forged through generic public mutation. Unresolved callback freezes future owner service controls, not fixed provider actions or funding/expiry/claims. Native Rust tests are primary full transfer-call semantics evidence; mark local simulation honestly.

## 7. Two actual keeper processes

Each keeper has own HTTP byte server, worker, content directory and SQLite imports/work database. Shared implementation is allowed; shared serving directory/state is not. DB stores approved assets/contracts/policy, imports, cursor, action attempts, tx hashes, heartbeat/poll/error/outcome. Startup validates provider/network/data-root binding. Poll 2s default, bounded exponential error backoff/jitter. Distinguish process heartbeat, last successful authoritative poll and final contract action.

| Keeper route | Result |
|---|---|
| `GET /health` | `{status:'ok',version,mode,provider_id,now,last_poll_at,last_successful_poll_at,last_action,last_error,worker_enabled,serving_enabled}` |
| `GET /archives/:asset_id/manifest` | independently verified persisted Manifest |
| `GET /archives/:asset_id/download` | actual keeper-local full bytes |
| `GET /archives/:asset_id/chunks/:index` | exact raw chunk |
| `GET /archives/:asset_id/proof/:index?commitment_id=...` | Proof, index validated against imported manifest |
| `POST /operator/import` | authenticated `{asset_id}` -> `{asset_id,status:'Ready'|'Importing'|'Failed',manifest_sha256,error:null|string}` |
| `POST /operator/poll` | authenticated `{}` -> health after one safe poll |

Import accepts asset ID only, not arbitrary URL/path. Fetch only exact configured API source origin, redirects disabled, bounded size/time; verify full length/digest/canonical manifest/root before atomic rename and Ready. Cache tree only bound to verified content digest. Public path resolution uses validated UUID/index and DB-known canonical path; reject traversal/encoded traversal, drive/UNC/null/symlink/reparse escapes and unknown records. Serve octet-stream, attachment sanitized filename, nosniff, exact length. No extraction/preview.

Worker only handles explicitly approved assets/network/contracts and permitted rate/policy. Local seed enrolls/imports demo asset explicitly. Sequence: authoritative state -> independently verified import -> provider acceptance before start -> open eligible challenge -> actual local bytes/path proof -> provider-authorized submission -> final state observation -> fixed claim if no pending -> permissionless expire elapsed commitments. Missing/corrupt file prevents proof and records error. Before retry after timeout/restart, query commitment/payment/transaction status. Testnet provider signs acceptance/proof, never owner backend; store transaction reference and wait FINAL. Local actor is trusted demo identity, disclosed.

Exact configured origins only for CORS/fetch; user endpoint metadata is never automatic arbitrary backend fetch. Local operator token protects mutation controls. No blanket private-address access or arbitrary redirect following. API worker aggregator only probes configured A/B origins. Stop A actual owned process before a later slot, show real HTTP failure/no proof, expire at actual deadline; B stays serving. Fault control, if used, must actually disable both serving and worker. Separate same-machine processes do not imply independent infrastructure/operators.

## 8. Rust ABI and contract work

One independent crate, checked u128/u64, SDK AccountId, bounded collections, no archive bytes or unbounded event vector. Independently implement protocol against golden fixtures. Initialization one-time, full manifest hash/size/metadata validation, 2..8 distinct provider allowlist, policy constants, duration 30s..30days, viable origin/expiry. Contract ID derives current account, token `archive`, epoch `0`. No factory needed.

| Method | Args | Deposit |
|---|---|---|
| `new` | `{owner_id,manifest,policy,providers,network_domain:'near-testnet',protocol_version:'archivepass-v1'}` | 0; batch Transfer supplies operations |
| `get_asset` | `{}` | view ChainAsset |
| `get_manifest`,`get_policy`,`get_ledger` | `{}` | matching DTO views |
| `get_commitments` | `{from_index:Decimal,limit:number}` | Page<Commitment>, next cursor decimal |
| `get_credits` | `{}` | bounded Credit[] |
| `get_payments` | `{from_index:Decimal,limit:number}` | current/retained payment summaries |
| `fund_upkeep` | `{version_id:'v1'}` | positive deposit entirely principal |
| `fund_operations` | `{}` | positive deposit entirely operations |
| `configure_provider` | `{provider,expected_owner_epoch}` | exactly 1 yocto |
| `propose_period` | `{provider_id,slot,rate,expected_owner_epoch}` | exactly 1 yocto |
| `accept_period`,`open_challenge`,`expire_period` | `{commitment_id}` | 0 |
| `submit_response` | Proof fields top-level | 0 |
| `finalize_expiry`,`claim_refund` | `{}` | 0 |
| `claim_provider` | `{provider_id}` | 0; anyone triggers fixed recipient |
| `on_payment_result` | `{operation_id}` | private callback, 0 |
| `nft_transfer` | `{receiver_id,token_id:'archive',approval_id:null,memo:null}` | exactly 1 yocto |
| `nft_transfer_call` | same plus `msg` | exactly 1 yocto |
| NFT views | standard NEP-171/177/181 | views |

Adapter assembles HTTP Asset by adding verified local binding/mode/observed_at/deployment to ChainAsset. Chain mutation outputs can be relevant record/unit; adapter always reads authoritative state after finalized receipt for CommandResult. Decoded function value is not a receipt. Contract agent documents precise returns in ABI docs before adapter integration. Unknown attached deposits rejected; security deposits operations only.

Maintain <=8 active payment attempts. Retain last completed summary per creditor/kind plus monotonic ID, not unbounded attempts; complete history emitted/indexed. `get_payments` is explicitly current/latest summaries, local DB history complete. Allocate no attempt for zero credit. Keep 256 lifetime commitments/provider-slot uniqueness and bounded fixed credit map. Native storage headroom must cover future callback growth and storage stake without consuming upkeep. Net balance must cover nonpending A+R+E+F; pending may already have left account. Measure bounded record storage deltas and document conservative margin; reject storage-growing work before inadequate operations reserve. No owner operations withdrawal.

NEP-171 ownership/transfer-call plus metadata/enumeration. Reject non-null approval_id; no approvals API. Standard NFT logs plus ArchivePass EVENT_JSON (`standard:'archivepass',version:'1.0.0'`) with stable IDs/amounts, no proof bytes. Metadata immutable, manifest reference/hash, one token enumeration.

Transfer-call cannot be a blind standards wrapper: record unique operation and lock before provisional transfer, increment epoch on every actual owner move including forward/return; configure/propose blocked globally through resolution; ordinary forwarding allowed; nested transfer-call rejected. Private matching resolver implements standard boolean/failed/malformed result semantics, returns only if receiver still owns token, does not seize forwarded token, clears matching lock only. Forged/duplicate resolver cannot unlock/change state. Resolver failure remains pending, no admin unlock.

Claim moves full credit to fixed Pending before Promise transfer; callback reads exactly one result, resolves matching operation once, success increments paid/failure restores original credit, owner irrelevant. New earnings during pending survive. No timeout reset/arbitrary successful callback. No withdrawal, root mutation, payee override, upgrade/delete/add-key/arbitrary call methods. Provisional gas budgets: proof 80 Tgas, claim80 including >=20 callback, transfer-call150 including receiver/resolver; measure/tune and document, native mocks do not prove actual receipt gas.

## 9. Browser workflow and accessibility

React imports frozen shared types/protocol. Library/create/detail/service/download/transfer/claims/history can be routes/tabs but every primary action is connected. Role selector is visibly demo identity; token local operator credential. Preserve request ID for retry of same body, new ID for changed body; prevent double-submit, abort obsolete requests, refresh authoritative state after mutation and STALE_OWNER. Bounded polling only for active work.

Create: public attestation/metadata/file -> independently async hash/tree/canonical manifest -> real upload -> compare server result -> policy/providers/beneficiary -> immutable review/create. Default period120s with origin >=90s ahead to allow acceptance, expiry covering demo slots. Exact NEAR parser/formatter, explicit available/reserved/earned/refund/pending/paid; operations top-up separate. No owner withdrawal.

Overview shows content IDs/copy/manifest, owner/epoch/lock, mode/network/key trust and dated health/observations. Service cards show fixed terms/consent/index/deadline and accepted response receipt; manual provider proof can fetch actual proof from allowlisted keeper then submit as selected provider, worker normally handles it. Old endpoint snapshot remains visible after config edits.

Download fetches actual configured keeper bytes in browser, bounds size and hashes SHA-256 locally, compares length/digest (optionally tree), shows expected/actual/source/time; offer verified blob save only after match, revoke URLs. Corrupt/failed response never green success. Browser observation is self-reported only. B remains selectable if A fails. No arbitrary URL entry/fetch.

Transfer preview exposes inherited commitments/credits/available/expiry/fixed beneficiary and key disclosure, recipient entry/confirmation and expected epoch. New owner controls only after authoritative refresh; pending transfer-call explicitly locks future service. Claims distinguish local simulated delivery, real chain pending and unknown; no force-retry action. History/export preserves exact ledger equation and actual receipts; local event IDs never tx hashes.

Use spec's exact local/testnet banner, proof limitation, browser verification, missed-period and funding-beneficiary wording. Test desktop and actual 360px viewport: no horizontal page overflow, wrapping accounts/hashes, cards or labelled table scroll, labels/errors aria-describedby, live async status, keyboard/focus restoration, visible focus, contrast/reduced motion. Local dates with UTC available. Both READMEs name other separate hackathon product.

## 10. Dedicated testnet harness

Integrator creates only new ignored ArchivePass faucet keys/accounts, never reads user wallet stores or AllTogether secrets. Verify near-api-js 7.4.0 installed types/action APIs. Network commands may need escalation; failures are honest gaps. Preserve full finalized transaction/receipt outcomes, not just decoded call values. Public evidence excludes secrets/headers.

Fresh faucet root creates actor subaccounts and dedicated asset child. Asset deployment is one atomic root-signed batch targeting new child: CreateAccount -> Transfer operational endowment -> DeployContract actual WASM -> FunctionCall new; **omit AddKey**. Initialization in same batch prevents first-caller capture. NFT owner calls public methods without asset account access key. Record actions, code hash, receipt, actual empty view_access_key_list, init views/balance before claiming keyless. No key deletion required. No factory required. If retained-key fallback, exact spec warning appears UI/README/evidence; never call it keyless/irrevocable custody. No existing wallet/mainnet funds.

Operator CLI verifies account/network/code/manifest before registry binding. Testnet views cannot fall back to local on RPC error. Localhost keepers signing testnet transactions are labelled testnet settlement with local HTTP keepers.

Live sequence: actual upload/keeper copies; deploy/fund operations/upkeep; two future provider commitments/acceptance; challenge; transfer during outstanding challenge; proof after transfer; finalized stale-owner rejection; actual native claim with fixed recipient receipt; duplicate/invalid proof receipt rejection; genuine elapsed missed period; short-lived separate expiry/refund fixture if needed. Test genuine failed native transfer to unavailable dedicated destination where feasible and verify credit restored, otherwise not_run (local toggle never evidence). Dedicated receiver fixture keep/return/failure/malformed/forward where resources permit. Live transfer during pending payout may be nondeterministic; report native-only if not reproduced.

Save real hashes/statuses/receipt IDs/time/account balances/code/key views. Explorer links only from actual tx hashes. Reconcile final settled principal separately from storage/operational surplus; pending amounts may already be transferred. Unknown outcomes remain pending. A deployment with views only is deployed/flow unverified.

## 11. Verification and evidence gates

Protocol tests consume frozen cross-language vectors: all sizes, final chunk/padding, canonical UTF-8, base64/hex strictness, fixed-seed domains, integer overflow and tampering.

Backend tests with test-only injected clock cover upload limit/mismatch; authority/epoch/lock; provider/grid/rate/slot cap/16/256 bounds; frozen terms; exact start/end boundaries; actual proof plus wrong byte/index/version/provider/path/replay; missed release and global finalization only after all obligations; full claims/new earnings during pending/failure exactly once/unknown; simultaneous fund/propose/claim/idempotency conservation. Invalid JSON/body/Origin/token/traversal/unknown file/security exports. No production clock edit.

Keeper integration launches separate A/B processes/roots/ports, verifies sample import and exact independent HTTP bytes/proofs, corrupt file rejection, restart and lost-response authority checks, backoff, actual A shutdown/HTTP failure/no proof/real deadline and B verified download. Record distinct canonical files/processes without independent-operator claim.

Rust tests cover Gate B: initialization/hash/bounds; funding/conservation/checked overflow; provider consent/proof/time and missed expiry; fixed refund; all owner epoch moves and transfer during challenge/payout; transfer-call keep/return/failure/malformed/forward/nested/lock/private/replay; payment callback success/failure/duplicate/unknown/new earnings/private guard; security deposits, metadata/enumeration, worst proof/bounded records/storage headroom. Distinguish mocked contexts/promises from receipts. Build actual WASM through wrapper, record versions/flags/hash/Cargo.lock; claim byte reproducibility only after repeated matching build hashes.

Integrated local scenario: real file create/fund/config/propose/accept/open/transfer/proof/claim, stale-owner/replay rejection, A stopped/missed/B browser verified, simulated payout failure/retry/unknown, restart browser/app/keepers same directories, expiry/refund and exact export conservation. Crash points: outbox before delivery; delivery record before resolution; blob rename before DB metadata. Offline missed windows cannot earn retroactively. Restart must preserve owner/epoch/root/commitments/challenges/credits/attempts/history and actual content.

Browser QA covers every main flow at desktop and actual 360px viewport, keyboard/errors/download success and corruption failure. Capture actual screenshots. Typechecks/production build/API/process/native/WASM tests each get independent evidence. Repeat tests when changed/failing concerns justify it, not for inflated counts.

Gate A local/persistence/UI, Gate B Rust/WASM, Gate C achieved genuine testnet subset, Gate D reproducibility reported independently in docs/EVIDENCE.md and integration-status.json with command/date/result/artifact/limitation. Explicit statuses: local_functional,rust_unit,wasm,receipt_integration,testnet_flow,live_transfer_call,keyless. Never call sampled response storage proven/continuous uptime/permanent archive/independent replicas. Required local/native/build work finishes even if testnet unavailable.

## 12. Documentation and completion

README gives prerequisites/exact commands/ports/env, local token/roles, complete demo, trust boundaries/two-product disclosure. API/CONTRACT docs preserve routes/ABI/deposits/gas/errors. PROTOCOL has byte encoding/vectors/bounds. STORAGE/OPERATIONS covers migrations/backup/restore/narrow reset, interrupted/orphan uploads, locked SQLite, keeper mismatch/stopped process, RPC throttle/missed deadline, unknown payment/callback failure and exhausted operations headroom. SECURITY covers public opaque files/no extraction, collusion/sample limits, SSRF/Origin/token boundaries and key trust. No keys, runtime DBs/user uploads or secret logs committed.

Integrator publishes shared signatures/fixtures, confirms agent conformity, reviews invariant gaps, integrates and runs required gates. Final report includes usable commands, evidence paths, exact achieved subsets and honest not-run rows, with no placeholder success or public publication claim. This plan is complete; implementation may now begin.
