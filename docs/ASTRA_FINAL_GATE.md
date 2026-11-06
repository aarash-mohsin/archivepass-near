# ArchivePass independent final gate

Reviewed 6 November 2026. This is an independent source/evidence review of the new signed testnet adapter, worker entry point and reusable operator CLI, with a targeted review of their contract authority/payment interfaces. It is not a formal audit or mainnet approval. No private keys were read, no chain transactions were sent, and no existing application data was modified.

## Final decision after recovery fixes

**FG-01 and FG-02 are closed by independently reviewed repairs and 18 independently rerun passing recovery tests.** No remaining P0/P1 defect was confirmed in this bounded review. The honestly labeled local prototype and recorded finite testnet demonstration are supported, subject to the normal final package checks. The user explicitly chose to leave the final 50T full-capacity test unverified and declined further QA funding transfers. That is an authorized scope exception, not a passing benchmark: the older 25T run cannot qualify the final artifact's worst-state gas behavior.

This review caught two concrete recovery failures beyond the previously passing tests. The findings below preserve their original failure analysis and evidence. The final re-review section records the actual fixes and separate validation; the historical live receipts are not represented as executions of the later repaired source.

## New findings

### FG-01 — P1: restarting a signed keeper can destroy readiness when the source is offline

**Source:** `keeper/testnet-main.ts:6` unconditionally awaits `app.keeper.importAsset(binding.source_asset_id)` before installing the polling/shutdown loop. `KeeperService.importAsset` first overwrites the persisted import record with `Importing`, then downloads from `api_origin`, and changes the record to `Failed` if that download fails.

An already imported, locally intact keeper therefore cannot restart when the original content-source process is unavailable. Startup rejects before automatic work begins, and the otherwise usable keeper bytes now have a Failed record. This defeats the retained replica exactly when the original source has disappeared; it also suppresses the earned-credit and expiry work that was deliberately made independent of content availability.

**Executed reproduction:** import the committed one-byte fixture, stop/reopen the keeper, verify Ready, then invoke the exact startup import with a failed source fetch. Result: `Ready → Failed` while the existing blob is still byte-for-byte intact. See `ASTRA_FINAL_GATE-repro.mjs` and `ASTRA_FINAL_GATE-repro.json`. This uses mocked source transport and real temporary SQLite/blob storage; it is not a live process/network outage test.

**Required correction:** verify and reuse an existing matching local import on startup. Re-import only when needed; failed source repair must not prevent the process from running fixed-credit/expiry work. Preserve the immutable chain/binding checks and never accept/prove from missing or corrupt bytes. Add regression coverage for source-offline restart with intact bytes and for missing/corrupt bytes with earned credit. Verify the actual entry point starts and its surviving download works with the source stopped.

**Disposition:** closed after source review and independent recovery tests, including the actual worker entry point with its original source stopped, exact retained-byte HTTP download and automatic fixed-credit settlement against mocked chain RPC. See final re-review below.

### FG-02 — P1: the dispatch crash boundary can permanently strand the signer

**Source:** `keeper/testnet-adapter.ts:31` durably changes an attempt to `Broadcasting` before calling `send_tx`. A process crash or connection failure before RPC acceptance leaves a hash the node has never seen. `reconcilePending` (`:29`) only calls `tx`; it never retransmits the persisted signed bytes. `execute` rejects every same-ID or fresh-ID attempt while any Broadcasting/Unknown record remains.

Consequently a single pre-dispatch interruption can block every subsequent action for this signer indefinitely, including claims and elapsed-period cleanup. The existing successful lost-response recovery test and live fault injection cover a transaction that **was already accepted/executed**, which is a different crash boundary. The no-new-signature rule is correct, but need not prohibit retransmission of the identical already-signed transaction.

**Executed reproduction:** create the exact durable state immediately after the Broadcasting update and before the RPC call, close/reopen the adapter, return `UNKNOWN_TRANSACTION` from the node, and retry both the original and a fresh request. Result: phase Unknown, three lookups, zero broadcasts, zero new signatures, both requests rejected. The reproduction journal is newly created temporary data and uses no real signature or network.

**Required correction:** provide bounded safe retry/recovery for the existing exact signed bytes/hash, preserving nonce, body, request identity and receipt finality. Never replace an ambiguous transaction with a new signature on timeout. Cover crash-before-send, transport failure before acceptance, response loss after acceptance, and successful restart with exactly one onchain effect. Document the intentionally unresolved case when old transaction inclusion/expiry cannot be established; do not invent a timeout-based failed outcome. Also ensure never-dispatched `Prepared` records can be safely handled when their original deadline/owner eligibility has changed: current resume re-runs `prepare`, so a now-ineligible Prepared action can otherwise block unrelated later actions indefinitely.

**Disposition:** closed after source review and independent replay/retirement tests. No new signature replaces an ambiguous attempt. See final re-review below.

## Supported evidence and original-review dispositions

The reviewed adapter/entry/service/CLI hashes match `RELEASE_WORKERS-source.json`: adapter `9b6f4ca9a692b7887f4b67a4b6b3ca07ea34c0657ba36b358021ddbd948f8596`, entry `da2eca97f1eeb5fab9ce85724193fdc2c34b26df09c31b6f9a47673f7a065164`, service `7f0c803bd6b69766f9f4825eec2b13b2d1bd7c3d053898112743c4140b8b1e87`, CLI `d38458a3e3a736d554d281062b0723b068d4d592d33ab59f636e041823ac5b23`. Any subsequent fixes need new source identities and validation; historical live evidence must retain its actual tested version.

| Original issue | Final-review disposition |
|---|---|
| AP-01/02 isolation and content-independent settlement | Core service changes address the original polling paths; the new startup-specific FG-01 gap is now repaired and independently verified. |
| AP-03 local transfer-call lock | Constrained local fixtures/ordinary-transfer default documented and tested by release work; no new blocker found here. |
| AP-04 freshness | Parent browser work and state tests are the evidence; this review did not independently rerun full browser flows. |
| AP-05 built serving | Fresh install/build and actual production entry-point smoke are recorded in `../release-qa/REPRODUCIBILITY.md` (relative to the project root's parent). |
| AP-06 signed workflows | Real adapter, explicit signer/binding, owner CLI and two automatic worker processes satisfy the demonstrated functional slice. FG-01/02 are closed. Browser remains read-only for chain actions. |
| AP-07 asynchronous settlement/gas | Native permutations and real payout failure/retry now have evidence. Final full-capacity 50T callback measurement remains open. |
| AP-08/09 readiness/configuration | Core changes and parent UI checks cover the targeted prototype improvements; FG-01 now preserves readiness across source-offline restart. |
| AP-10 resource bounds | Bounded work/cache/request limits and a local maximum-file burst are documented. This is not a public-hosting/maximum simultaneous workload qualification. |
| AP-11 validation/parity | Shared malformed-input and provider/policy regression work is recorded; no new P0/P1 contract mismatch identified here. |
| AP-12 reproducibility/operations | Recorded frozen fresh installs, builds, stopped backup/restore and actual entry processes support local handoff. Signed journal restore covers accepted-but-unknown recovery only; FG-02 adds a missing boundary. |

Independently rerun here: **9 signed-worker tests passed, 0 failed, 0 skipped** using `node --test tests/server/testnet-worker.test.mjs`. The two offline reproductions also completed with the results above. The broader **66 JavaScript / 21 Rust** results, frozen installs, production entry points and stopped restore are parent-run evidence, not reruns by this review.

The inspected final worker evidence reports `passed` at `2026-11-05T16:50:51.648Z`, contract `archive.apw-mw3re9ta.testnet`, keyless code hash `8DVxZxb2nD3zST8tky1jPTbWvLJfs8vfLXzrB7AMgSNN`. Its 17 steps record actual handover, Bob's later scheduling, accepted-response-loss restart, two worker proofs/claims, stopped A/surviving B download and an unpaid missed period. The summary records 0.003 NEAR paid from 0.02 upkeep, 0.017 available and zero pending liability. These are retained transaction/process evidence, not an independent new live RPC verification by this reviewer. They do not exercise FG-01/02.

The contract's fixed claim recipients and authorization remain authoritative; browser actor strings cannot choose the signer. The finite command allowlist rejects arbitrary calls/recipient overrides. Keyless code/policy/manifest/provider checks are pinned to a final block, and signed bytes are persisted before dispatch. Final receipt failures are not silently treated as paid. These are meaningful safety properties worth retaining during the repairs.

## Final independent re-review

After the implementation agent reported stable source, this reviewer reran `node --test tests/server/testnet-worker.test.mjs tests/server/testnet-recovery.test.mjs`: **18 passed, 0 failed, 0 skipped**, exit zero. The run took approximately 6.2 seconds. It used temporary data, loopback processes and mocked chain RPC, with no real chain writes. An earlier in-progress run had 13 passes and two failures because two new tests had not yet opted into the newly explicit replay permission; those tests were corrected before this final run. Do not confuse that intermediate test wiring with a hidden passing result.

The shipping worker now independently hashes retained bytes against freshly bound authoritative terms before contacting the source. Initial/repair imports run in a separate bounded background task. Missing/corrupt/offline source conditions leave the fixed-credit/expiry polling loop active and cannot authorize new proof/acceptance from invalid bytes. The actual entry-point regression stops its original HTTP source, launches `keeper/testnet-main.ts`, verifies Ready and a byte-exact full HTTP download, and observes its automatic signed claim reach the mocked final chain state. This is genuine separate-process/startup verification, not a new live NEAR payment claim.

Reconciliation looks up the persisted hash first. Only an explicit `UNKNOWN_TRANSACTION` allows a paced retransmission of those exact signed bytes; transport errors and mismatched receipts do not. Durable exponential backoff is capped at ten minutes per attempt, with no permanent five-attempt lockout. A seven-attempt failure/recovery test with an intervening restart verifies eventual success without another signature. Read-only status uses lookup-only reconciliation; automatic replay is explicitly enabled for workers or `execute`. A Prepared attempt that was definitely never marked for dispatch can be retained as `Retired` after current eligibility fails, releasing unrelated work without pretending any chain transaction failed. Broadcasting/Unknown attempts are never retired on that basis.

Parent review also requested a final-result identity guard; the reviewed code now requires the exact persisted hash, expected signer, bound contract recipient and a valid terminal result shape before writing Final. Negative tests keep wrong hash/signer/receiver/malformed status Unknown and block replacement signatures. This prevents accidental result misassociation; it is not a cryptographic light-client guarantee against a malicious RPC provider.

Final independently inspected source hashes:

| File | SHA-256 |
|---|---|
| `keeper/testnet-adapter.ts` | `ba1cd28e3a31e18d561e51fc4a20a363779ae2ab655cbd52937d63f09aa2054c` |
| `keeper/testnet-main.ts` | `58de63218799d9f8b749eb38276227b7309f492b1847dc9baaddcb7977785b56` |
| `keeper/testnet-content.ts` | `63660b315e1fe9a0abe6d8fe8e587e87de26022c2be5017a2c3ecb7518a96d78` |
| `keeper/service.ts` | `4321e4ef84e47f907e48d8aee9a37d654d1aaea0ad84ef811485356bbbd30561` |
| `scripts/near-operator.mjs` | `d38458a3e3a736d554d281062b0723b068d4d592d33ab59f636e041823ac5b23` |
| `tests/server/testnet-worker.test.mjs` | `c6e43640260b280b9729edf33c87d0d21ccb6f5510a29338cbf6cb10e6e8aa87` |
| `tests/server/testnet-recovery.test.mjs` | `16cc2dc6603aa1dc1ee64dafca8fe52359f7608cc97a54fd078b72c7fe3a1916` |

Historical `RELEASE_WORKERS-source.json` remains the source identity for its actual live run. Recovery validation is a separate later result. The pre-fix reproduction script intentionally asserts historical failure behavior and is not part of the repaired regression suite.

The implementation agent's final `RELEASE_WORKERS-recovery-validation.json` matches all inspected source hashes and records strict TypeScript success plus **75 full-suite passes, 0 failures, 0 skips**. This reviewer inspected the retained `../release-qa/archivepass-recovery-final-tests.log` and confirmed those totals; the full suite was not rerun a second time by this reviewer. `RELEASE_WORKERS-recovery.md` accurately separates the mock recovery tests from historical live execution. The stale automatic-scheduling statement in `OPERATIONS.md` has also been corrected.

## Remaining release gates and claim boundaries

1. FG-01/02 closure is verified above. The repaired source has 75 full-suite passes and strict typecheck success in retained implementation-agent evidence; the previous 66-test run belongs to earlier source. Any final rebuilt package must include these repaired files. Full-package/frozen-install provenance remains parent-owned.
2. Keep the **final 50T / 256-record** testnet gas benchmark explicitly unverified under the user's scope decision. No additional transfer or capacity run is authorized by this review. `RELEASE_TESTNET_BENCHMARK.md` separates the old 25T capacity baseline from the final artifact's 16-record partial run and actual failed-refund cleanup. Neither proves final worst-state callback headroom. Limit release claims to the demonstrated state sizes and finite worker flows; do not claim full-capacity qualification.
3. Preserve accurate packaging: local UI simulation, read-only chain browser, dedicated testnet signer CLI, finite sampled-proof economics, no independent-infrastructure guarantee. The corrected operations text and separate recovery workflow documentation now describe the implemented scope.
4. Keep dependency audit scope accurate: zero production JavaScript advisories at the recorded check; full Rust lockfile audit still has host/tooling advisory/warning entries absent from the normal deployed WASM graph. This is not a universally clean audit.

No new protocol features, contract administrator reset, browser wallet integration, permanent-storage claim, production publication or mainnet work is requested by this review.
