# Claims and their evidence

Every claim ArchivePass makes, with the code that implements it, the test that checks it, and the live evidence. "verify" means a line printed by `npm run verify` and shown on the [hosted verify page](https://aarash-mohsin.github.io/archivepass-live/), both computed from public NEAR testnet RPC at the moment you run them.

Code references are to `contract/src/lib.rs` unless noted. Rust tests are in `contract/src/tests.rs`.

| # | Claim | Code | Test | Live evidence |
|---|---|---|---|---|
| 1 | The NFT is its own NEAR account and holds its own upkeep fund | `ArchivePass` state, `fund_upkeep` (`lib.rs:77`) | `fund` helper, used throughout | Asset `archive.apw-mw4fsdcz.testnet`; funding tx [`C3LYenrk…`](https://testnet.near.rocks/tx/C3LYenrkBUNxjZYW7VNZyAgtQL46sEYMNGxfXv2ik1NS); verify: "Money in matches the funding events" |
| 2 | It is a standard NFT (NEP-171) | `nft_transfer`, `nft_transfer_call`, `nft_token`, `nft_tokens*` (`lib.rs:154`–`178`) | `nft_security_deposit_owner_and_approvals_enforced`, `initialization_and_metadata_enumeration_are_bounded` | `nft_mint` and `nft_transfer` events in [`GeaYLrKs…`](https://testnet.near.rocks/tx/GeaYLrKs6XvgBoy64keqWxEGVvtUUtDq4ZEHimQ5BcgE) and [`4dpF6GYy…`](https://testnet.near.rocks/tx/4dpF6GYyxLadANYswo1kAKdCSPLYUNqo82JGEQnWJyqC) |
| 3 | The asset account has no keys, so its rules are final | Created in one transaction with no `AddKey` (`scripts/testnet-deploy.mjs`) | CI: rebuild and compare the WASM hash | verify: "The asset account has no access keys", "Deployed code = the committed release WASM" |
| 4 | The archive's content is pinned by a SHA-256 hash and a Merkle root | `Manifest`, `protocol::validate_manifest` | `cross_language_manifest_merkle_and_challenge_vectors`; `tests/shared/protocol.test.ts` | verify: "The archived file matches the on-chain fingerprint" (recomputed from `fixtures/stewardship-guide.txt`) |
| 5 | Keepers are paid only for a valid Merkle proof of a random chunk | `open_challenge` (`lib.rs:113`), `submit_response` (`lib.rs:120`) | `proof_shape_bytes_padding_and_base64_are_strict`, `repeated_open_is_stable_and_wrong_provider_or_replay_cannot_earn` | verify: "Every paid answer carries a valid Merkle proof" (each answer re-verified from its transaction arguments) |
| 6 | A missed period earns nothing, and its reservation returns to the fund | `expire_period` (`lib.rs:128`) | `exact_boundary_no_proof_no_payment_and_expiry_refunds_fixed_beneficiary` | Period 2 missed: [`GXKSMQYT…`](https://testnet.near.rocks/tx/GXKSMQYTzKbhdDkXVAofimypqVPvvBLn81eCaudpYXyB); verify: "Keepers were paid exactly for the periods they proved" |
| 7 | The caretaker cannot withdraw upkeep | No withdrawal method; money leaves only through `claim` (`lib.rs:195`) | `exact_boundary_no_proof_no_payment_and_expiry_refunds_fixed_beneficiary` | verify: "Every unit of upkeep is accounted for" |
| 8 | Unused upkeep goes to a refund address fixed at creation | `Policy.refund_beneficiary`, `finalize_expiry` (`lib.rs:134`) | `expiry_requires_all_releases_and_never_destroys_earned_credit` | verify: "Unused money can only go to the fixed refund address" |
| 9 | A handover keeps every booked obligation | Commitments are immutable once proposed; `proposed_owner_epoch` recorded (`lib.rs:93`) | `handover_preserves_challenge_claim_and_old_owner_loses_authority`, `immutable_payees_rates_slots_and_endpoint_snapshots` | Periods 0 and 1, booked at epoch 0, earned and paid after the handover: [`4mBoEtUV…`](https://testnet.near.rocks/tx/4mBoEtUV8an7EFWZqmmnGBZfmYMY33g8hik9WaEUeQ5F), [`7AtPXRwN…`](https://testnet.near.rocks/tx/7AtPXRwNvsTPjUTtdnWRMvyMp2k5uvfkEpqpdhD9UHH4); verify: "Service booked before the handover is still paid after it" |
| 10 | A payout in flight during a handover still reaches its payee | `on_payment_result` (`lib.rs:143`) ignores the current owner | `dispatched_provider_payment_survives_ownership_and_both_callback_orders`, `provider_and_expiry_refund_pending_payments_keep_payees_across_handover` | Rust tests only (not staged on testnet) |
| 11 | The previous caretaker loses every owner right | `owner_action` checks `owner_id` and `expected_owner_epoch` (`lib.rs:188`); `move_owner` bumps the epoch (`lib.rs:191`) | `handover_preserves_challenge_claim_and_old_owner_loses_authority` | verify: "The previous holder kept no control" |
| 12 | A `nft_transfer_call` receiver can't act as holder and hand the token back | `transfer_call_pending` lock, `on_nft_transfer_result` (`lib.rs:165`) | `provisional_owner_cannot_spend_and_forwarding_does_not_escape_lock`, `transfer_call_keep_return_failure_and_malformed_results` | Receiver contract runs in `docs/testnet-receiver-operations.json` (earlier deployment) |
| 13 | The books always balance | `get_ledger` integrity check and `assert_books` after every change (`lib.rs:63`) | Every test calls `assert_books` | verify: "Every unit of upkeep is accounted for", "Payouts on the books = payouts on chain" |
| 14 | Anyone can fund the archive until 1 Dec 2026 | `fund_upkeep` (`lib.rs:77`), `policy.fund_expiry` | `fund` helper | verify: "Anyone can still add upkeep"; **Fund** tab on the hosted page signs `fund_upkeep` with your wallet |
| 15 | Only the current holder gets into the holder console | `site/src/nep413.ts`: NEP-413 signature, full-access key check, `nft_token` owner | `tests/shared/live.test.ts` | **Holder console** tab on the hosted page |
| 16 | Each NFT has a readable history: holders, money in, payouts, missed periods | `shared/live.ts` `readHistory` (all transactions to the asset and their event logs) | `tests/shared/live.test.ts` | **History** tab on the hosted page |

## What we do not claim

- A passed challenge is not proof of continuous storage, the whole file, or an independent copy.
- The two demo keepers run on one computer.
- The browser app in `web/` runs on a local test ledger. The live chain writes come from the owner CLI, the keeper workers, and the wallet buttons on the hosted page.
- Testnet only.

See [THREAT_MODEL.md](THREAT_MODEL.md) for the attacks these claims answer.
