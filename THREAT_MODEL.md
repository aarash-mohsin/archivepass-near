# Threat model: what happens to money and control when the NFT changes hands

ArchivePass is one NFT that is also its own NEAR account (`archive.apw-mw4fsdcz.testnet`). The account holds the archive's upkeep fund and the agreements with the storage keepers. This document covers one question: **when the NFT moves to a new caretaker, can the old caretaker keep any money or any control?** It also covers the other attackers who matter to that question: the new caretaker, a keeper, a receiving contract and a random caller.

Each row names the attack, the line of code that stops it, the test that tries it, and, where one exists, the testnet transaction that shows it on the live asset. `npm run verify` and the [hosted verify page](https://aarash-mohsin.github.io/archivepass-live/) re-check the live rows from public RPC.

Code references are to `contract/src/lib.rs`. Tests are in `contract/src/tests.rs` (run with `pnpm test:contract`).

## Who is trusted with what

| Party | Can do | Cannot do |
|---|---|---|
| **Current caretaker** (NFT holder) | Book future service periods within the fixed caps, configure a keeper's endpoint, hand the NFT on | Withdraw upkeep, change a booked period, change the refund address, change the code |
| **Former caretaker** | Nothing beyond any other account | Everything the current caretaker can do |
| **Keeper** (eligible provider, fixed at creation) | Accept a period offered to it, answer its challenge, claim fees it has earned | Earn without a valid Merkle proof in time, claim another keeper's fee, be replaced by the caretaker |
| **Anyone** | Fund upkeep, open a challenge, expire a lapsed period, trigger a payout to its fixed payee, finalize expiry | Choose who is paid or how much |
| **The deployer** | Nothing after creation: the account has no keys | Redeploy, add a key, move funds |

## Attacks by the former caretaker

| # | Attack | What stops it | Test | On chain |
|---|---|---|---|---|
| 1 | **Withdraw the fund before (or after) handing over** | There is no withdrawal method. Upkeep can leave only through `claim` to a keeper credit or the fixed refund credit (`lib.rs:195`). The ledger check `principal_in = available + reserved + earned + refund + pending + paid` runs after every change (`get_ledger`, `lib.rs:63`). | `exact_boundary_no_proof_no_payment_and_expiry_refunds_fixed_beneficiary` | The ledger has balanced since creation: 0.02 in, 0.003 paid to keepers, 0.017 available. Checked by `verify` ("Every unit of upkeep is accounted for") |
| 2 | **Keep booking or repricing service after the handover** | Every owner method calls `owner_action` (`lib.rs:188`): the caller must be `owner_id`, and its `expected_owner_epoch` must equal the current epoch. A transfer increments the epoch (`move_owner`, `lib.rs:191`), so a transaction signed before the handover fails with `STALE_OWNER`, and one signed after it fails with `OWNER_REQUIRED`. | `handover_preserves_challenge_claim_and_old_owner_loses_authority` (Alice's `propose_period` after the transfer fails) | After [`4dpF6GYy…`](https://testnet.near.rocks/tx/4dpF6GYyxLadANYswo1kAKdCSPLYUNqo82JGEQnWJyqC), every booking is signed by Bob ([`3UNTPasc…`](https://testnet.near.rocks/tx/3UNTPasc3DXeLJYEc7k3j9iYDB2VQYf5YH1hLuBAzWmm)). `nft_supply_for_owner(apw-mw4fsdcz.testnet) = 0` |
| 3 | **Cancel, shorten or redirect a booked period** so the money comes back to the fund for a later grab | No method edits a commitment. The payee, rate, slot, endpoint and content hash are copied into the commitment when it is proposed (`propose_period`, `lib.rs:93`). The only exits are Earned (with a proof) or Missed (after the deadline, returning to `available`, which is still ring-fenced). | `immutable_payees_rates_slots_and_endpoint_snapshots` | `get_commitments` shows periods 0 and 1 booked at epoch 0 with their original payees and rates |
| 4 | **Change the refund address to their own account** before leaving | The refund beneficiary is part of the `Policy` fixed in `new` (`lib.rs:37`). No method writes it. | `exact_boundary_no_proof_no_payment_and_expiry_refunds_fixed_beneficiary` | The creation transaction [`GeaYLrKs…`](https://testnet.near.rocks/tx/GeaYLrKs6XvgBoy64keqWxEGVvtUUtDq4ZEHimQ5BcgE) set `refund.apw-mw4fsdcz.testnet`; `get_policy` still returns it ("Unused money can only go to the fixed refund address") |
| 5 | **Leave an approval behind** and use it to take the NFT back | Approvals (NEP-178) are not implemented: `nft_checks` (`lib.rs:190`) rejects any `approval_id`, and `nft_token` always returns `approved_account_ids: {}`. | `nft_security_deposit_owner_and_approvals_enforced` | `nft_token` on the live asset: `"approved_account_ids": {}` |
| 6 | **Keep a key** to the asset account, or upgrade the code later | The asset was created, funded, deployed and initialized in one transaction with no `AddKey`. The account has zero access keys and the contract has no upgrade or generic execute method. | CI rebuilds the WASM and checks its hash against the deployed one | [`GeaYLrKs…`](https://testnet.near.rocks/tx/GeaYLrKs6XvgBoy64keqWxEGVvtUUtDq4ZEHimQ5BcgE); `view_access_key_list` returns `"keys": []`; code hash `8DVxZxb2…` = `contract/target/near/archivepass.wasm` |
| 7 | **Collude with a keeper** to be paid without storing anything, then split the fee | Fees are capped per period (`max_provider_rate`) and per slot (`max_slot_spend`). A fee is earned only by `submit_response` with a valid Merkle proof of a randomly chosen chunk (`lib.rs:120`). Keepers are fixed at creation, so a caretaker can't add a friendly one. **Residual risk:** an eligible keeper that colludes can still pass challenges by fetching the bytes from elsewhere. | `slot_consent_and_spend_boundaries_prevent_overcommitment`, `repeated_open_is_stable_and_wrong_provider_or_replay_cannot_earn` | Every accepted answer is re-verified from its transaction arguments by `verify` ("Every paid answer carries a valid Merkle proof") |

## Handover in the middle of a service period

This is the case the track prompt asks about: a sale in the middle of a payout.

**The rule.** Transferring the NFT moves only the right to arrange *future* service. A period that was booked, accepted, challenged or earned before the transfer carries on exactly as it would have, and its fee goes to the payee recorded at booking time. Payments already dispatched resolve through their callback without looking at the current owner.

**Tests.**
- `handover_preserves_challenge_claim_and_old_owner_loses_authority`: a challenge is open when the NFT moves. The keeper answers after the transfer, earns, claims and is paid. The old owner's booking fails and the new owner's succeeds.
- `dispatched_provider_payment_survives_ownership_and_both_callback_orders`: a payout is already in flight when the NFT moves (by plain transfer, transfer-call kept, returned or forwarded). Both callback orders are tried, for successful and failed payments. The payee and the amount never change, and the books balance in every case.
- `provider_and_expiry_refund_pending_payments_keep_payees_across_handover`: the same for refund payouts.
- `transfer_call_lock_does_not_block_existing_provider_or_fixed_claim`: while a transfer-call is unresolved, keepers can still answer and claim.

**On the live asset.** This happened for real on 6 November 2026:

1. The first caretaker, `apw-mw4fsdcz.testnet`, booked periods 0 and 1 at owner epoch 0 ([`89H1wipw…`](https://testnet.near.rocks/tx/89H1wipwcwffWxYiA9gzHBoXyTXQt6BgGWNLrUGTp5e1)), and both keepers accepted.
2. The NFT moved to `bob.apw-mw4fsdcz.testnet` ([`4dpF6GYy…`](https://testnet.near.rocks/tx/4dpF6GYyxLadANYswo1kAKdCSPLYUNqo82JGEQnWJyqC)) before the periods started.
3. Keeper A opened its challenge ([`BoaGztdP…`](https://testnet.near.rocks/tx/BoaGztdPSvrHJjEHHzsN6PFPg57MDsa2LLTSv7aAm72h)), answered with chunk 2 and its Merkle proof ([`4mBoEtUV…`](https://testnet.near.rocks/tx/4mBoEtUV8an7EFWZqmmnGBZfmYMY33g8hik9WaEUeQ5F)), and was paid 0.001 NEAR ([`7AtPXRwN…`](https://testnet.near.rocks/tx/7AtPXRwNvsTPjUTtdnWRMvyMp2k5uvfkEpqpdhD9UHH4)). Keeper B did the same.

`npm run verify` checks this from chain data in the line "Service booked before the handover is still paid after it".

## Attacks by the new caretaker

| # | Attack | What stops it | Test |
|---|---|---|---|
| 8 | **Refuse to honour inherited obligations** by cancelling them | As in row 3: there is no cancel. The new caretaker isn't needed for a keeper to be paid. | `handover_preserves_challenge_claim_and_old_owner_loses_authority` |
| 9 | **Book more service than the fund can pay**, or more than the caps | `propose_period` reserves the fee from `available` up front and enforces the rate and slot caps and the 16-open-commitment limit. | `slot_consent_and_spend_boundaries_prevent_overcommitment` |
| 10 | **Spend operational funds or storage headroom as upkeep** | Operations and upkeep are separate balances. `assert_headroom` refuses any change that would leave less than the storage cost plus all non-pending upkeep. | `insufficient_operational_balance_cannot_spend_principal_on_storage` |

## Attacks through `nft_transfer_call`

| # | Attack | What stops it | Test |
|---|---|---|---|
| 11 | **A receiver contract acts as holder** during the call (books service or transfers on), then returns the token | While a transfer-call is pending, owner actions that need a stable owner are refused (`TRANSFER_PENDING`), and nested transfer-calls are blocked. When the token comes back, the epoch still advances, so nothing signed by the receiver survives. | `provisional_owner_cannot_spend_and_forwarding_does_not_escape_lock`, `transfer_call_keep_return_failure_and_malformed_results` |
| 12 | **A forged or replayed callback** resolves a transfer or payment | `on_nft_transfer_result` and `on_payment_result` are `#[private]` and check the operation id and pending amounts. | `pending_is_not_reset_by_elapsed_time_and_forged_callback_rejected` |
| 13 | **Too little gas**, so the callback never runs and state is stuck | The transfer-call needs at least 175 Tgas and a claim at least 120 Tgas before anything changes. | `insufficient_prepaid_gas_rejects_before_reserving_payment_or_provisional_owner` |

## Attacks by keepers and other callers

| # | Attack | What stops it | Test |
|---|---|---|---|
| 14 | **Get paid without the file** | The challenged chunk is chosen from the block's random seed after the period starts. The answer must hash up to the stored Merkle root (`protocol::verify_proof`). | `proof_shape_bytes_padding_and_base64_are_strict`, `cross_language_manifest_merkle_and_challenge_vectors` |
| 15 | **Claim another keeper's fee**, or answer for it | `submit_response` requires `predecessor = provider_id`. Payouts go only to the credit's own creditor. | `repeated_open_is_stable_and_wrong_provider_or_replay_cannot_earn` |
| 16 | **A failed payout loses the money** | On failure the callback re-credits the exact amount, and the keeper can claim again. | `payment_failure_restores_exact_credit_new_earnings_survive_pending` |
| 17 | **Fill the contract's storage** so it can't operate | All collections have fixed limits (256 commitments, 16 open, 8 pending payouts). The worst-case state fits the reserved storage. | `worst_case_bounded_state_fits_reserved_application_storage` |

## What ArchivePass does not protect against

- **A passed challenge is a sample, not storage proof.** It shows a keeper produced one randomly chosen chunk in time. It does not prove continuous uptime, the whole file, an independent copy, or that the keeper didn't fetch the bytes from someone else.
- **Keepers are trusted to keep serving.** The fund only stops paying a keeper that stops answering. In the demo, keeper A missed a period while it was stopped and earned nothing for it ([`GXKSMQYT…`](https://testnet.near.rocks/tx/GXKSMQYTzKbhdDkXVAofimypqVPvvBLn81eCaudpYXyB)), but nothing restores the data.
- **The eligible keeper list is fixed.** That stops a caretaker adding a colluding keeper, but it also means a bad keeper can't be replaced without a new asset.
- **The holder console on the hosted page is a convenience.** It checks a NEP-413 signature, that the key is a full-access key of the account, and `nft_token`. A static page can't keep secrets, so the real gate is the contract's own owner check, which the console's actions go through.
- **Both demo keepers run on one computer**, and this is testnet only.
