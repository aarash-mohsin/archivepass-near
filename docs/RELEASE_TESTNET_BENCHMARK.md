# ArchivePass actual large-state testnet benchmark

This report preserves isolated release-QA versions. They never change the earlier product deployment configuration or pretend earlier receipts cover revised code. **The user explicitly chose “Leave the final capacity test unverified.”** The final50Tgas artifact's actual256-record capacity gate is therefore **unverified, accepted as a scope exclusion by the user, and not passed**. No release-readiness claim for that capacity follows from this report. The original25Tgas baseline completed256records after an explicitly recorded harness continuation and exposed insufficient callback margin. The final50Tgas artifact completed16actualrecords and full native failed-refund recovery/settlement; that partial result does not establish final-artifact256-record behavior.

The separately user-approved 2 testnet NEAR transfer finalized (`39N7QB5sq4NN3X3WqUmvXwPdku93SPpEPSwhagB14xuE`, full evidence in `RELEASE_WORKERS-spare-gas-transfer.json`). Those dedicated-root funds remain unspent for the proposed retest; no refund is authorized or attempted. Automatic approval review rejected the additional six-wallet consolidation because that separate financial action lacked exact user authorization. The rejected command did not execute; no consolidation or new capacity deployment occurred. Following the user's scope decision, all proposed consolidation, funding and final-capacity chain mutations are stopped. The prepared helper is not authorization to execute them.

| Run | Artifact / actual result |
|---|---|
| `mw3qhtsg-35fb41` |25Tgas callbacks; all256records, depth14responses, receiver/NFT cases, actual failed refund/restoration/retry and same-parent pending handover ultimately passed. Original concurrent-summary JSON read failed in the companion, leaving0.001earned credit; the primary's all-paid assertion correctly failed. Recovery claimed that exact credit with real receipts. Raw failures remain unchanged; `...-recovery.json` passes and `...-result.json` consolidates the true result. Callback margin remains a release blocker.|
| `mw3rk8hv-89685b` |Fresh keyless child, revised50Tgas callbacks, claimmin120Tgas/NFTcallmin175Tgas; native21tests passed in the parent's final gate.16actualrecords were created before FastNEAR HTTP429 interrupted the run. A separate official-RPC cleanup expired them at the unchanged deadline, exercised actual failed native refund/restoration/retry and returned all0.3NEAR; `...-cleanup-maintenance.json` passes. This is not a256-record result.|
| `mw3rw8h2-a5de2a` |Official RPC verified testnet. Fresh owner key was saved before the faucet request, but the faucet returned HTTP429 and no account/asset was created. Bounded retry of the SAME request returned Retry-After30148seconds. `...-faucet-maintenance.json` records the precise cooldown; no alternate faucet/proxy/account cycling was attempted.|

The recorded faucet next-allowed time was **2026-11-06T01:12:36.321Z** from the actual response. The benchmark's own ignored cooldown record prevents premature requests; the user's stop decision also means no new request is authorized after that time. Prepared harness calls use only the independently verified official `https://rpc.testnet.near.org`, with bounded retries of identical JSON-RPC payloads (including identical already-signed transaction bytes), never a guessed new nonce or silent local fallback. Native and small-state live50Tgas results do not substitute for the excluded full-capacity50Tgas run.

## Baseline actual findings and harness correction

Baseline finalized256records and three actual full-size/depth14 provider responses. Its private callbacks used21.04–21.18Tgas out of25Tgas, leaving only about3.82Tgas/~15% at this state shape. The parent treated that as fix-required because larger challenge-bearing variants remain possible. Payment and NFT callbacks were raised to50Tgas; low-prepaid-gas claims and transfer-calls now reject before reserving credit or moving provisional ownership.

The baseline's JSON failure was in benchmark coordination, not contract execution. The companion read a large summary while another process rewrote it. Future harness publication now uses atomic same-filesystem rename. The complete original error and all receipts are retained. `qa-testnet-benchmark-recover.mjs` then continued only the still-available fixed0.001credit, with claim_provider followed by nft_transfer in one parent action receipt; the actual private callback paid the same provider before a separate ordinary transfer returned the NFT. It did not recreate credit, redirect a claim or reset a pending payment.

Final baseline principal:0.300NEAR accepted,0.003provider payments and0.297fixed-beneficiary refund; available/reserved/earned/refund/pending allzero. Account amount `6500000000000000000000261`yoctoNEAR is separate6.5operationalNEAR plus261security yocto. Owner returned to the dedicated root at epoch6, accesskeys empty. Final serialized application165,661bytes and actualstorage432,057bytes fit the260,000application/526,351total-byte budgets. This is a measured near-capacity shape, not proof of the largest possible serialized variant.

## Revised artifact under retest

The final parent's native gate passed21tests including119Tgas claim and174Tgas transfer-call rejection before any state change. Primary WASM266,288bytes SHA-256 `6b35856cc8d713b123a5431b525a6f3dc6393110d3f11a46e50f64cf9a07cad3`, codehash `8DVxZxb2nD3zST8tky1jPTbWvLJfs8vfLXzrB7AMgSNN`. Receiver is unchanged. Fresh v2 account: `asset-v2-mw3rk8hv-89685b.qab-mw3qhtsg-35fb41.testnet`. Only the benchmark's own remaining faucet accounts/keys/files were reused; the old keyless contract was never upgraded. Its16-record cleanup ends with accepted/paid0.3NEAR, pending/residual0 and no access keys.

## Source and artifacts actually checked

- Actual command `node scripts/contract.mjs test`:20 native tests passed, including the newly explicit payment/ownership callback permutations. Receiver workspace tests and doc tests also completed with no failures.
- Actual command `node scripts/contract.mjs build`: both artifacts built through the advertised direct Node/Cargo wrapper.
- Primary:266,251bytes, SHA-256 `c40e2cb68b8101c1df07422f80747d229b4cd85731a16474e89f6631c71f81ab`.
- Receiver:120,148bytes, SHA-256 `dd59e3139587368fe4bd800402530e9c9a8bfccacf08da52313a17ab88b2dd79`.

The optimized artifact includes the current allocator/default-feature changes. Native results do not stand in for testnet receipt gas. These are optimized non-reproducible-WASM builds, not a bit-identical-build guarantee.

## Isolated test arrangement

Only newly generated dedicated faucet accounts are used. Keys are saved before faucet requests under ignored `.secrets/qa-benchmark-mw3qhtsg-35fb41-*.json`; they are never written to public evidence. The fresh asset is `asset.qab-mw3qhtsg-35fb41.testnet`. Creation, operation funding, code deployment and initialization are one transaction batch with **no AddKey action**. The observed code hash must equal the actual built WASM digest encoded in base58, and the onchain access-key list must remain empty.

The public file is exactly16MiB, with byte[i]=i mod251,16,384chunks of1KiB and a depth14 Merkle proof. It matches the frozen largest protocol vector. Two separately spawned local fixture processes on8991/8992 read different copied files, independently rebuild/verify the complete manifest, serve real full downloads, and construct actual chunk proofs. Both full HTTP downloads were hashed. These are benchmark fixture processes, not evidence of independent operators, production automatic testnet scheduling, continuous uptime or a strong storage proof.

Eight eligible provider IDs are each64characters. Provider labels are80ASCII bytes; advisory endpoint metadata is256ASCII bytes. The advisory URLs stress persisted record lengths; the fixture's actual endpoints are `/archive/download` and `/archive/proof/:index`, not the long metadata paths.

The finite test grid uses actual30-second periods. A two-slot buffer permits at most16active commitments. Eight proposals are submitted per transaction with30Tgas per call; eight elapsed commitments are expired in a later transaction. Thirty-two slots target256actual lifetime records; no native state is injected and no clock is changed. Initial17th-active and eventual257th-lifetime attempts must fail with the specific CAPACITY_REACHED reason.

## Intended final cases and evidence rules

1. Early full-size/depth14 HTTP-backed response and actual native provider callback: already completed before the capacity run finished; its receipts are in the companion's pending-tx files.
2. At256actual records, a final provider response submits the selected1KiB chunk with14siblings. Actual recipient balance delta and fixed claim are checked.
3. Actual near-capacity transfer-call return and forwarding exercise receiver and private resolver receipts. Their gas is measured, not estimated from native mocks.
4. A second final provider earns separately. After fixed-refund retry, the primary publishes an explicit idle handoff. The current owner then executes claim_provider **then** nft_transfer to the root in one parent transaction. The transfer dispatch precedes ownership change within the same action receipt; the native transfer/private callback are child receipts. Exact recipient balance delta is measured with a different signer. This establishes that concrete live order only; it does not claim every possible interleaving.
5. At immutable expiry, a refund to a deliberately nonexistent named beneficiary must fail in an actual native-transfer receipt. The same parent action receipt transfers the NFT to the provider after refund dispatch. The private callback must restore the exact same fixed refund credit and clear pending once across that ownership change. The root then creates that original fixed account and the provider permissionlessly retries; no payee redirection or timeout reset exists.
6. Final principal, credits, pending liabilities, actual account balance, code hash, access keys, serialized state and storage allowance are recorded and checked. Every transaction has a complete finalized outcome in a distinct `qa-testnet-benchmark-...-tx-...json` file.

This is a near-capacity valid record shape with long identifiers/endpoints and a few actual challenged records. It is not the maximum serialized shape where all256records have a stored challenge or every creditor has a payment summary; the independent native worst-record fixture measures that separate bound. Actual largest-depth proof, callback gas, native failures and this concrete state shape are separate observations.

## Reproduce safely

From the ArchivePass folder, first build/test the final source, then run `node scripts/qa-testnet-benchmark.mjs`. The script creates a new run ID and isolated faucet roots, own data/files and own public evidence. It refuses to fabricate a pass if a deadline, authorization, gas budget, callback or count fails. The normal32-slot run needs about18minutes of real time after provisioning.

For the additional actual dispatched-payment ownership permutation, run `node scripts/qa-testnet-benchmark-pending.mjs <active-run-id>` early enough to create/accept its own eligible provider before the last period. Its root transaction is deliberately confined to an observed idle interval to avoid signer nonce races. Never launch the companion twice or replace a generated key after an ambiguous request.

Do not rerun a completed immutable asset, overwrite old evidence, use a user wallet or send mainnet funds. If a run fails, inspect saved final receipts and authoritative state; an unresolved pending callback is not permission to repay or clear credit. A different artifact needs a fresh deployment and fresh result.
