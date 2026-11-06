# Demonstration

Start with the local app at5174 and keep the **Local test ledger** banner visible. Enter the local operator token from `data/app/operator-token`, selectAlice, and open the seeded stewardship guide. It is an actual public CC0 file, not a canned proof object.

1. Show the immutable whole-file digest, Merkle root, finite reserve, fixed refund beneficiary and two actual keeper origins.
2. Download from KeeperA in the browser; show the expected/actual SHA-256 and received length. Explain that this full download is distinct from a sampled response.
3. Use **Service** to schedule an affordable future period, accept as the fixed provider or import/poll the keeper, and observe the real challenge/response state. The clock is real; 120seconds is an accelerated demonstration period.
4. Preview a stewardship transfer while a commitment remains outstanding. Confirm its inherited terms. Transfer toBob; showAlice's owner controls disabled and unchanged provider/rate/payee/deadline.
5. Use `scripts/scenario.mjs` with explicit local faults to reproduce the actual serving outage, surviving full-file download, missed unpaid period and refund. It takes about70seconds and records evidence; simulated local payout delivery is clearly labeled.
6. Open **Testnet evidence**. Show `archive.ap-mw3n0te5.testnet`, actualBob ownership/epoch13, matching code hash, zero access keys and fully reconciled0.01NEAR upkeep. This view reads live RPC and cannot sign through the demo role selector.
7. Show the finalized testnet receipts: two actual provider proofs/payouts after transfer, altered/replayed response rejection, receiver return/forward/keep and temporary-holder attack rejection, missed period and0.008NEAR fixed-beneficiary refund.

Do not rerun a completed testnet scenario to stage the demo. The recorded asset has expired, and its old deadlines cannot be rewritten. A fresh demonstration requires a separately initialized/funded testnet account and exact recorded new terms. Never imply that the old expired contract is presently paying a live service period.

The product claim is **portable funded stewardship under fixed rules**. Hashes, NFTs holding money and Merkle proofs are prior art. Our useful behavior is preserving funded obligations across caretaker change, with a real retrieval/proof/refund demonstration and explicit limitations.
