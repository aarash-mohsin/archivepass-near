# ArchivePass contract ABI

Independent Rust crate: `contract/`. JSON fields are snake_case. Amounts are canonical decimal yoctoNEAR strings (`u128`), timestamps/slots/IDs/epochs canonical decimal strings (`u64`); indexes, limits and protocol bounds are JSON numbers. Invalid leading zeros, negative values, exponents, numbers instead of strings, and overflow are rejected. Account IDs use the SDK's validated type. Hashes are 64 lowercase hexadecimal characters.

The contract represents one immutable archive version and token `archive`. `get_asset` returns the plan's `ChainAsset` (HTTP fields `asset_id`, `mode`, `observed_at`, `deployment` are added by the application adapter). Views have no external-call side effects.

| Method | JSON arguments | Deposit | Result |
|---|---|---|---|
| `new` | `{owner_id,manifest,policy,providers,network_domain:"near-testnet",protocol_version:"archivepass-v1"}` | 0 | Initial contract state; once only |
| `get_asset` | `{}` | view | ChainAsset |
| `get_manifest`, `get_policy`, `get_ledger` | `{}` | view | Matching DTO |
| `get_credits` | `{}` | view | Credit[] (eligible providers plus fixed refund beneficiary) |
| `get_commitments` | `{from_index:"0",limit:50}` | view | `{items:Commitment[],next_cursor:string|null}` |
| `get_payments` | `{from_index:"0",limit:50}` | view | Page of latest attempt per creditor/kind, including pending attempts |
| `get_storage_quote` | `{}` | view | Actual/fixed storage bytes, serialized application bytes, required operational yoctoNEAR |
| `fund_upkeep` | `{version_id:"v1"}` | Positive, entirely principal | Ledger |
| `fund_operations` | `{}` | Positive, entirely operations | Ledger |
| `configure_provider` | `{provider,expected_owner_epoch}` | Exactly 1 yocto | ProviderConfig |
| `propose_period` | `{provider_id,slot,rate,expected_owner_epoch}` | Exactly 1 yocto | Commitment |
| `accept_period`, `open_challenge`, `expire_period` | `{commitment_id}` | 0 | Commitment |
| `submit_response` | `{commitment_id,version_id,chunk_index,chunk_base64,siblings}` | 0 | Commitment |
| `finalize_expiry` | `{}` | 0 | Ledger |
| `claim_provider` | `{provider_id}` | 0 | Promise resolving to callback success bool |
| `claim_refund` | `{}` | 0 | Same, fixed refund destination |
| `nft_transfer` | `{receiver_id,token_id:"archive",approval_id:null,memo:null}` | Exactly 1 yocto | Unit |
| `nft_transfer_call` | Same plus `{msg}` | Exactly 1 yocto | Promise resolving to standard kept=true/returned=false |
| `nft_token` | `{token_id:"archive"}` | view | Token or null |
| `nft_metadata`, `nft_total_supply` | `{}` | view | Metadata / decimal supply |
| `nft_supply_for_owner` | `{account_id}` | view | Decimal supply |
| `nft_tokens` | `{from_index:"0",limit:50}` (both optional) | view | Zero or one Token |
| `nft_tokens_for_owner` | Same plus `{account_id}` | view | Zero or one Token |

ProviderConfig, Manifest, Policy, Commitment, Credit and Ledger are exactly those in `IMPLEMENTATION_PLAN.md` and `shared/types.ts`. No approvals extension exists; any non-null approval ID is rejected. The asset has no unrestricted withdrawal, upgrade, add-key, arbitrary call, delete-account, payee override, cancellation or manual callback-reset method.

Commitment IDs start at `"0"` and equal their bounded append-only position. At most 256 lifetime commitments / 16 nonterminal commitments exist; uniqueness of provider+slot persists after settlement. A proposal reserves its full rate immediately; provider acceptance must precede the start. Challenges can open only in `[start,end)` and reopening returns the exact persisted selection. Responses at `end` fail; expiry at `end` succeeds. Unaccepted/unopened/unanswered periods earn nothing. Provider configuration changes apply only to future proposals.

Claims move the complete available fixed credit to pending, at most one pending per creditor/kind and eight overall. A new monotonically increasing operation ID is allocated. A failed transfer restores the same credit; a successful transfer increments paid. New earnings during pending remain separate. Completed summaries are replaced only by that creditor/kind's next claim, keeping state bounded; full history comes from events and finalized receipts. No timeout-based restoration exists.

Private callbacks `on_payment_result({operation_id})` and `on_nft_transfer_result({operation_id})` require predecessor=current account and one actual promise result. Duplicate or unmatched operation IDs cannot repeat a payment/return or clear a newer lock. Payment callback response read is bounded; NFT receiver results are capped to 16 bytes and malformed/failed responses request return. An unresolved callback remains pending. NFT forwarding is allowed during transfer-call; future owner-controlled proposals/configuration and nested transfer-call are locked. The resolver never seizes a forwarded token.

Suggested call gas: response 80 Tgas; claim 80 Tgas (25 Tgas reserved for callback); transfer-call 150 Tgas (50 receiver +25 resolver, minimum supplied100); other mutations 50–80 Tgas. These are initial budgets, not claims of measured receipt-level execution. The parent evidence report records actual testnet gas/results. All methods reject unexpected deposits. Mandatory one-yocto deposits are operations, never upkeep principal.

Events use `EVENT_JSON:` with standard `archivepass`, version `1.0.0`, fixed event names and decimal amounts/IDs. Standard `nep171` mint/transfer events are emitted. Byte proofs are not logged. A sampled response proves only the fixed account's timely response of a committed chunk, not continuous HTTP service or an independent complete replica.

Receiver fixture: independent `contract/receiver` WASM provides `nft_on_transfer` for `msg="keep"`, `"return"`, `"panic"`, `"malformed"`, or `"forward:<account-id>"`. `"attack:<JSON propose_period arguments>"` attempts a provisional-owner proposal using the supplied provider/slot/rate/epoch. It must fail `TRANSFER_PENDING` and the resolver should return the NFT without a new obligation. Forwarding/attack branches need an operational one-yocto balance. The fixture is113,561bytes at `contract/target/near/archivepass_receiver/archivepass_receiver.wasm`. It is a test fixture, not a production service.

Build from `contract/` using `../../scripts/with-rust.ps1 cargo near build non-reproducible-wasm --no-abi`; native tests use `../../scripts/with-rust.ps1 cargo test --offline --workspace`. The wrapper resides at workspace root, so the relative invocation is `..\..\scripts\with-rust.ps1` on Windows. Build/deployment status is recorded separately in EVIDENCE; source presence alone does not imply either.
