# Demo walkthrough

This walkthrough reproduces the demo video: the local app for the full caretaker story, then the live testnet asset. It takes about five minutes, including two minutes of real waiting.

## Part 1: the local app

The browser app runs on a clearly labeled **local test ledger**. Its demo identities and payments are simulated, and no blockchain transaction is signed here.

1. Start the app with `pnpm dev`. In a second terminal, run `pnpm seed`. The seed loads the CC0 stewardship guide into both keepers, funds 0.01 NEAR of upkeep and books one 120-second service period with each keeper. Both periods start 120 seconds after the seed.
2. Open <http://127.0.0.1:5174>. Paste the token from `data/app/operator-token` into **Operator access** and open the archive.
3. **Overview:** check the content identity (SHA-256, Merkle root and manifest hash), the fixed refund address, and the ledger: 0.008 NEAR available and 0.002 reserved.
4. **Service:** both commitments show **Accepted**, with a fixed payee, rate and deadline.
5. **Transfer**, before the periods start: enter `bob.archivepass.testnet`, then choose **Preview inherited obligations**. Bob inherits 2 open commitments, and leftover funds still go to the refund address. Tick the confirmation and transfer.
6. The caretaker is now Bob (epoch 1). As Alice, **Service** says "Only the current stable caretaker can schedule future service".
7. Wait for the periods to start. Each keeper opens its challenge, answers with the chunk and its Merkle proof, and claims its fee. **Service** shows both commitments as **Earned**, with the challenged chunk, and **Overview** shows 0.002 NEAR paid.
8. **Download & verify:** fetch the whole file from keeper B. The browser shows the expected and actual SHA-256 hashes matching.

`pnpm scenario` covers the failure cases: a keeper outage, a missed and unpaid period, and the refund. Start the app with `ARCHIVEPASS_DEV_FAULTS=1` first. It runs in about 70 seconds.

## Part 2: the live testnet asset

1. Open **Testnet evidence** (`#/testnet`). This view reads NEAR testnet RPC directly and never signs anything. It shows `archive.apw-mw4fsdcz.testnet` owned by `bob.apw-mw4fsdcz.testnet` (epoch 1), **Verified keyless** with 0 access keys, a matching code hash, and the contract ledger: 0.02 NEAR funded, 0.003 paid, 0.017 available and nothing pending.
2. Check the same account from a terminal with the RPC commands in the README. The access-key list is `"keys": []`.
3. Open the transactions on an explorer, for example NEAR Rocks:
   - [The NFT handover to Bob](https://testnet.near.rocks/tx/4dpF6GYyxLadANYswo1kAKdCSPLYUNqo82JGEQnWJyqC)
   - [Keeper A's `submit_response`](https://testnet.near.rocks/tx/4mBoEtUV8an7EFWZqmmnGBZfmYMY33g8hik9WaEUeQ5F): the chunk, its Merkle siblings and the result `"state": "Earned"`, on a period booked at owner epoch 0, before the handover
   - [Keeper A's claim](https://testnet.near.rocks/tx/7AtPXRwNvsTPjUTtdnWRMvyMp2k5uvfkEpqpdhD9UHH4): a 0.001 NEAR transfer to the keeper, and `payment_resolved` with `success: true`

Don't rerun the completed testnet scenario to stage a demo. The asset's earlier periods have elapsed, and its history is evidence. Bob, the current caretaker, can book new periods with the owner CLI (see [RELEASE_WORKERS.md](RELEASE_WORKERS.md)) while funding is open, until 1 December 2026.

## Part 3: the hosted live page

Open <https://aarash-mohsin.github.io/archivepass-live/>. It reads NEAR testnet from your browser and needs no install.

1. **Verify:** 14 checks run against the live asset and each shows `PASS` with its transactions: no access keys, code hash = the committed WASM, books balanced, money in = funding events, payouts = payment events, the archived file matches the stored hash and Merkle root, every keeper answer's Merkle proof re-verified from its transaction arguments, service booked before the handover paid after it, and the former holder left with no control. `npm run verify` prints the same lines.
2. **History:** both caretakers with their epochs, every booked period and how it ended (three earned, one missed and unpaid), and the full event log from 22 transactions, newest first. The newest is a 0.01 NEAR contribution from a separate sponsor account ([`7L6hSvfx…`](https://testnet.near.rocks/tx/7L6hSvfxJDjHgH2YdATwyU7otUcqDp4Hxsjahxo9unYn)).
3. **Fund:** connect a testnet wallet and add upkeep. The wallet signs `fund_upkeep`, and the ledger and history update.
4. **Holder console:** click `apw-mw4fsdcz.testnet` to see the former caretaker locked out. Signing in with a wallet checks a NEP-413 signed message, the key and `nft_token`; only the current holder gets the console (book a period, hand over).

## What the demo claims

ArchivePass's claim is **portable funded stewardship under fixed rules**. A caretaker can change while funded obligations stay intact. Hashes, NFTs that hold money and Merkle proofs all exist elsewhere already. A passed challenge shows that a keeper produced the requested chunk in time. It doesn't prove continuous uptime or an independent copy, and both demo keepers run on one computer.
