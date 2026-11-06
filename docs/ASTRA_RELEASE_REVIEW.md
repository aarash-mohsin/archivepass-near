# ArchivePass independent release review

Reviewed 5 November 2026. Scope: source and release evidence in this checkout; supervised hackathon prototype and possible public testnet release. This is a development review, not a formal security audit or a declaration of production readiness. No contract deployment, signing, wallet inspection, or existing application-data mutation was performed for this review.

## Release decision

ArchivePass has a credible core demonstration: actual files and separate keeper copies, deterministic content identity, a persistent local ledger, fixed obligations that survive ownership change, and separately recorded real keyless testnet execution. Its strongest distinction is **transferring funded stewardship without rewriting existing provider rights**. The existing evidence is substantially more useful than a deployed-contract screenshot.

Do a bounded repair pass before handing it to a new reviewer. Mandatory prototype fixes are AP-01 through AP-05, plus the evidence correction in AP-07. AP-06 is a gate for calling the application an independently usable testnet service, not a reason to withhold an honestly labeled local prototype. AP-08 through AP-12 are targeted hardening/polish work. No confirmed P0 principal-theft or authority-bypass defect was found in the inspected contract paths. That is not assurance that none exists.

The current browser cannot sign, the automatic keeper cannot settle onchain, and the successful testnet scenario is a completed finite asset whose original service windows cannot be replayed. A built frontend is not yet a runnable release server. These boundaries must remain prominent.

Priority meanings: **P0** confirmed catastrophic custody/authority defect; **P1** material release correctness, recoverability, or usability gate; **P2** bounded hardening or product quality improvement. Findings distinguish source-confirmed behavior, an executed reproduction, and unverified risks.

## Findings and concrete acceptance criteria

### AP-01 — P1: one bad archive stops unrelated keeper work

**Evidence:** `keeper/service.ts:40-61`. One outer catch encloses the entire imported-asset loop. Asset fetch, approved-term comparison, local file read, full hashing, and every command can throw out of that loop. `last_error` is a single process value with no asset identity. Imports are processed sequentially.

**Executed reproduction:** created a fresh temporary keeper database with two Ready imports, omitted only the first blob, supplied a valid second blob, and used an instrumented API transport. One poll returned `first_asset_error="Keeper local content is missing."`, `second_asset_queried=false`, and `http_calls=1`. Temporary files were removed after closing the database. No live data was touched. A real HTTP regression should supplement this component reproduction.

**Impact:** one damaged, removed, or temporarily unavailable archive can make every later funded archive miss acceptance/proof deadlines. This directly undermines the availability purpose.

**Implement now:** isolate each archive and each recoverable commitment action; persist asset-specific failures and retry timing; continue other work. Distinguish a partial poll from a complete successful poll. Preserve unknown-delivery safety and existing action idempotency. Add bounded per-asset retry/backoff so a persistent fault does not dominate the worker.

**Acceptance:** with archive A missing/corrupt/offline and archive B valid, B accepts, proves, claims, and survives restart; A records its own error and never proves. A transient command race on one commitment must not suppress later eligible work.

### AP-02 — P1: content failure also blocks already-earned claims and expiry

**Evidence:** `keeper/service.ts:44` reads and rebuilds the entire content before commitments are fetched; expiry is at `:48`, and claims at `:51-58`. `content()` at `:35` also requires HTTP serving enabled. These administrative transitions do not need proof bytes.

**Impact:** losing the file or disabling serving prevents this worker from claiming a provider's previously earned funds or releasing elapsed reservations. Manual callers can still perform those contract/domain actions, so this is worker liveness failure rather than principal loss in the contract.

**Implement now:** separate settlement/claim work from content-dependent acceptance/proof work. Check authoritative terms, settle elapsed periods and handle fixed credit independently; require verified local bytes before new acceptance and proof only. Never restore pending funds because a timer expired. Continue to expose actual content failure.

**Acceptance:** earn credit, remove the blob, then poll: fixed credit is claimed once and elapsed commitments become Missed; no new commitment is accepted and no proof is submitted. Repeat with serving disabled, failed delivery/retry, pending/unknown delivery, and restart. Expiry finalization may remain an explicit user action, but must show exactly what still blocks it.

### AP-03 — P1: ordinary local transfer-call recipients can permanently lock future controls

**Evidence:** `web/src/App.tsx:118-121` offers a generic standard transfer-call checkbox for any valid account. `server/domain.ts:204-213` resolves only receiver prefixes `keep`, `return`, `panic`, and `forward`; every other recipient remains unresolved indefinitely. `tests/server/domain.test.ts:50-51` deliberately covers that behavior. The backend documentation explains fixtures, but the transaction UI does not name them.

**Reproduction:** in local mode preview a transfer to Bob, choose transfer-call, confirm, and allow the recovery worker to run. Bob owns the NFT, but the transfer lock never clears. Ordinary forwarding cannot remove the lock. The receiver message does not select a local fixture's behavior.

**Implement now:** make local simulated receiver behavior explicit and constrained in the normal UI. Offer the known fixtures with their exact effect, default normal handover to ordinary transfer, and reject unsupported local transfer-call recipients before mutation in normal mode. If an unknown-receiver test is retained, put it behind development faults with an explicit permanent-pending warning. Do not add an administrative unlock to the actual contract.

**Acceptance:** normal Bob handover works; keep/return/panic/forward fixture outcomes match their labels; an unsupported recipient is blocked before owner/epoch/lock changes; recipient edits and epoch changes invalidate confirmation. Existing funded obligations and claims survive every supported outcome.

### AP-04 — P1: background failures leave stale owner and financial state looking current

**Evidence:** `web/src/App.tsx:44-51` fetches several resources with `Promise.all`, then polls every four seconds with `refresh().catch(()=>{})`. Fifteen-second requests can overlap. The generation check prevents writes after route changes, but does not prevent an older same-route response overwriting a newer response or a post-command refresh. `web/src/helpers.ts:29` checks owner/lock/finalized expiry, not actual expiry time.

**Impact:** after an API outage the screen keeps the old balances, owner and controls, without an explicit stale warning. Concurrent reads can regress displayed state. Server authorization still protects mutations, but the user sees misleading authority and confusing failures.

**Implement now:** track last successful snapshot, current refresh failure and stale status; serialize or sequence refreshes and discard old responses. Show reconnect/retry state. Disable financially consequential controls when authoritative state is stale, while leaving verified local downloads and evidence inspection accessible as appropriate. Apply actual expiry to scheduling eligibility and update a suggested slot when time advances. Do not present successful mutation as failed solely because its subsequent refresh failed; retain its receipt and reconcile.

**Acceptance:** disconnect API after a successful load, delay/reorder responses around a transfer, restore the connection, and verify visible stale state, no state regression, correct owner controls and a recoverable receipt. Exact deadline/expiry boundaries and skewed browser clock cannot create a false success.

### AP-05 — P1: build output has no supported serving path

**Evidence:** `package.json:1` maps `start` to `node server/main.ts`; `server/http.ts:26-56` serves API/health routes only; `scripts/build.mjs:2` emits Vite assets; `vite.config.ts:2` provides `/api` proxying only under the development server. The README documents development startup, not serving the built product. These observations are source-confirmed; this review did not start another server.

**Implement now:** provide a documented built-app command, preferably same-origin static serving from the API or a narrowly configured release supervisor/proxy. Resolve only known build files, support the SPA entry point, exclude source/data/secrets, set correct MIME/cache/nosniff behavior, and keep loopback defaults. Name API-only and full-app commands accurately. Test configured port behavior rather than hardcoding a second set of URLs.

**Acceptance:** clean install/build/start with Vite stopped serves `/`, hashed assets, hash routes, API and testnet evidence. Unknown API routes stay JSON 404; encoded traversal and requests for `.secrets`, data, source or arbitrary filesystem paths never expose files. Restart preserves content and ledger. Public exposure remains a separate deployment decision.

### AP-06 — P1 for a usable testnet service: signed user/provider workflows stop at the scenario harness

**Evidence:** `server/domain.ts:47` rejects signed mutations; `keeper/service.ts:41` rejects testnet worker execution; `web/src/TestnetEvidence.tsx:31-34` is read-only; `scripts/testnet-scenario.mjs:3-8` binds fixed generated actors, a local seed and a zero-principal fresh scenario. `docs/integration-status.json` correctly marks automatic signed scheduling false. Product specification section 13 explicitly permits a read-only view plus scripts for the development prototype.

**Decision:** do not conflate this gap with a broken local demo. A bounded hackathon release can keep it explicit. A new caretaker cannot use the current UI to operate a real asset, and the scenario is not a general operator interface.

**Smallest practical next slice:** a dedicated testnet operator/keeper adapter with an explicit allowlisted deployment binding, known manifest/code/network, provider signer selected outside browser-controlled actor strings, durable transaction attempt/hash tracking, final receipt reconciliation, and restart-safe scheduling. Add reusable preview/execute commands for individual owner/provider actions before adding a broad browser wallet/deployment factory. A browser integration, if chosen, must show actual account/network, exact method/deposit and pending/final receipts; rejection must never fall back to local success.

**Acceptance for the stronger claim:** two dedicated workers accept/prove/claim automatically on a fresh testnet asset, restart safely during an unknown submission, refuse wrong contract/network/provider, and continue after NFT handover without an operator driving the canned scenario. A new owner can arrange another eligible future slot. Do not mark this complete from successful CLI scenario receipts alone.

### AP-07 — P1 evidence gate: asynchronous settlement and worst-state receipt gas remain insufficiently demonstrated

**Evidence:** `contract/src/lib.rs:178-199` uses fixed 25 Tgas NFT callbacks; `:228-240` uses a 25 Tgas payout callback. State is one Borsh struct containing up to 256 commitment records, loaded/saved around public calls. `contract/src/tests.rs:148-155` directly constructs a large record set and measures serialized bytes, with duplicate artificial providers; it does not execute reachable full-state receipts or measure gas. The storage document discloses this distinction correctly.

`docs/EVIDENCE.md` says transfer during in-flight payment has native unit coverage. `contract/src/tests.rs:115-116` starts a transfer-call, then earns/claims, and stops with both pending. It does not dispatch payment, transfer ownership, then resolve success/failure, nor check both callback orders. The new-earnings/failure test at `:88-94` does not transfer ownership. Narrow that evidence statement or add the exact permutations.

**Implement/verify now:** native regression permutations for claim → ordinary transfer/transfer-call/forward → success/failure, and reverse callback order; assert fixed creditor, epochs, locks, pending/available/paid and conservation. Keep actual failed native payout, live interleaving, and worst-case gas as separate gates. For a stronger public testnet release, measure maximum-depth proof, near-capacity state mutation, payout callback and NFT resolver gas with conservative headroom. A dedicated unavailable fixed-refund destination is a possible failure fixture; it must be tested with new faucet accounts, not existing wallets. Failed transaction dispatch is not a failed outgoing native transfer.

**Acceptance:** attach method/receipt gas, state size, input depth, account balances and final outcomes. A fresh dedicated deployment is required for any contract changes because the recorded asset is keyless. Never replace its evidence with new source claims or imply that native VM contexts execute actual transfer receipts.

### AP-08 — P2, high product impact: keeper health is not archive readiness

**Evidence:** `keeper/service.ts:21` returns process-level health only; `server/http.ts:36` aggregates that health; `web/src/App.tsx:98-99` says “Two copies. Separate processes.” on every asset. New assets can have two reachable keepers and zero imported copies. The tag says HTTP reachable accurately, but the headline and lack of asset state obscure the distinction. `web/src/App.tsx:69` labels an unfunded new archive “Funded stewardship”.

**Implement now if feasible:** an asset-specific bounded status view with Not imported / Importing / Ready / Missing / Corrupt, immutable digest, checked-at, serving state, next obligation and per-asset error. Do not treat a prior Ready record or a live process as a recent full-file observation. Provide a short next-step sequence: upload → fund → import A/B → schedule → observe → hand over. Label funding and service coverage from actual amounts/commitments.

**Acceptance:** a new asset shows zero confirmed imports; importing only A shows one; corruption/outage distinguishes process health from bytes; a repaired import clears only its own error; no unperformed browser verification is implied.

### AP-09 — P2: normal configuration and seed recovery are less reusable than the documented knobs

**Evidence:** `server/config.ts:22-27` derives provider IDs from a five-element actor list while allowing arbitrary keeper-origin counts; three or more origins produce a refund account and then undefined IDs. `keeper/config.ts:9` silently treats unsupported mode strings as local, accepts unchecked numeric ports/poll intervals, and parses `approved_assets` without using it. `scripts/dev.mjs:3` hardcodes keeper API origin/ports/mode despite API environment options. `scripts/seed.mjs:5` returns immediately when the old asset exists, without repairing missing imports or explaining elapsed service windows.

**Implement:** either explicitly support exactly the two configured demo providers or introduce validated `{provider_id,origin}` bindings; fail startup for invalid modes, ports, intervals and duplicate bindings. Honor one config source in supervisor/seed. Remove or implement misleading settings. Keep seed preservation, but report existing status and provide explicit safe re-import/fresh-demo options without deleting prior assets.

**Acceptance:** default setup remains one command; nondefault API/data/keeper ports work; typos fail closed; expired seed is explained; repeat seeding never duplicates funding or discards existing user data.

### AP-10 — P2: scalability and public-serving resource bounds need explicit limits

**Evidence:** `keeper/service.ts:35-36,44,66-70` synchronously reads whole blobs and rebuilds full trees for each proof request and each imported archive on every poll. The unauthenticated proof endpoint has no keeper rate/concurrency limiter. `shared/protocol.ts:23` launches a complete tree's hashing work; the maximum file has 16,384 leaves. API rate limiting does not cover keeper listeners. Local draft/event/idempotency histories are unbounded despite per-asset commitment bounds.

**Impact:** many large archives or repeated public proof requests can consume CPU/memory and delay deadline work. This is a public-hosting gate, not a demonstrated exploit against the loopback release.

**Implement selectively:** bound concurrent expensive proof/import work, cache immutable verified trees with a stated corruption/reverification policy, avoid rehashing inactive expired archives every two seconds, set keeper request timeouts and resource limits, and document storage quotas/retention. Keep fresh byte checks where acceptance/proof trust requires them. Never cache a positive corruption check indefinitely.

**Acceptance:** benchmark maximum file and multiple assets; record memory, event-loop delay and worst poll latency. A burst of public proof requests must not prevent timely funded responses. Oversized/chunked bodies and slow clients terminate within documented bounds.

### AP-11 — P2: local/contract parity and error handling need several targeted regressions

**Evidence:** `server/domain.ts:109-110` accepts a provider configuration subset as long as it has two entries, while `contract/src/lib.rs:43` requires one configuration for every eligible provider. Local configuration can later add an eligible missing provider; the contract cannot start in that state. Local IDs begin at one; contract commitment IDs begin at zero, which is acceptable only if adapters treat them as opaque. Malformed object shapes are only partly validated before property access and can become generic 500s. Browser `maxLength` uses character counts while protocol text limits are UTF-8 bytes.

**Implement:** align intended shared validation, test missing/null/wrong-type/extra fields and provider sets, and return deliberate 4xx errors. Keep local versus chain IDs distinct and avoid arithmetic assumptions in adapters. Provide byte-aware field feedback for Unicode titles/notes. Do not claim all schemas match merely because TypeScript compiles.

**Acceptance:** a shared table of valid/invalid provider/policy/amount/time inputs has matching semantic outcomes; malformed inputs leave no partial state or blob publication; Unicode boundaries match Rust/TS canonical encoding.

### AP-12 — P2: release operations and test claims need a reproducible handoff

**Evidence:** `server/db.ts:9-20` creates tables and inserts migration version 1 but does not implement a future-version rejection/migration runner. Operations documentation offers a sound stopped-process backup recipe, but no executed restore verification. The browser test suite is six helper tests, not DOM/keyboard/end-to-end coverage. Golden vectors are generated by `scripts/fixtures.mjs` through the implementation under test; committed values plus independent Rust verification are useful, but a second small independent encoder/tree oracle would reduce shared-assumption risk. The TS fixture damage loop checks hash inequality rather than always passing the damaged proof through the verifier; other tests cover only some altered forms.

**Implement:** fail startup on unsupported schema versions, add a restore drill using new directories, preserve blob checksums and provider/network bindings, and publish exact clean-checkout commands. Add focused real browser coverage for the changed release paths. Use a small separately written reference vector or manually derived one-/three-leaf encoding, and negative proof mutations across all orientations/depths. Keep generated expectations out of assertion execution. Record source/artifact hashes and test dates per release.

**Acceptance:** restore a stopped consistent backup to new paths, compare complete exports and bytes, retry recovered pending work without duplicate payment, and reject a future schema safely. Validate mobile, keyboard and screen-reader labels in actual screens rather than treating helper tests or one 360px flow as full accessibility coverage.

**Parent QA finding added at handoff:** `scripts/contract.mjs` invokes Windows PowerShell to run the local Rust wrapper; the parent reproduced execution-policy rejection through that path while direct invocation from the current PowerShell environment works. Treat this as a mandatory clean-checkout/tooling fix, not a Rust test failure or a reason to bypass execution policy. Activate the workspace Rust environment in Node and spawn its cargo executable directly, then rerun the documented commands. This reproduction came from parent QA, not this review's own execution.

## Architectural value and remaining economic limits

The architecture improves handover continuity and exposes reserve restrictions independently of the outgoing caretaker. Fixed allowlists, rates, deadlines, refund destination, credits and transfer locks constrain concrete authority; actual keeper copies improve resilience to one local process or blob failure. Code separates a sampled response from browser retrieval and generally explains that distinction well.

It does not yet provide independent infrastructure, an incentive to serve for an entire period, or a recovery network. A keeper can open and answer at the start of a 30-day period, earn the whole fixed rate, then disappear; this follows `open_challenge`/`submit_response`, not a discovered bypass. The spec explicitly permits it. Sampling one chunk also permits on-demand retrieval, favorable challenge timing and collusion. All eligible providers disappearing leaves only eventual refund; the new caretaker cannot recruit a replacement account under the original terms. The 256 lifetime commitments mean a two-provider archive has at most 128 fully paired periods, irrespective of funding. Explain finite remaining capacity beside expiry/runway.

For the current release, prioritize accurate observations, recovery and handover over adding unsupported storage-proof claims. Full-download checks from a second observer can inform users without becoming a payment oracle. Multiple or end-of-period challenges, rolling retention incentives, provider replacement with sponsor-approved terms, and migration to a successor archive are later protocol versions requiring fresh deployment and independent incentive analysis.

## Ranked product and polish work

| Rank | Improvement | Impact / effort | Release decision |
|---|---|---|---|
| 1 | Isolate bad archives and keep settlement running | Very high / small-medium | Mandatory AP-01/02 |
| 2 | Per-archive readiness plus next required action | High / medium | Implement now if capacity permits |
| 3 | Freshness, retry and retained transaction outcome | High / medium | Mandatory AP-04 |
| 4 | Safe local handover fixtures and ordinary transfer default | High / small | Mandatory AP-03 |
| 5 | Built-app startup and a clean demo recipe | High / small-medium | Mandatory AP-05 |
| 6 | Service timeline: reserved/accepted/challenged/earned/missed, next deadline, remaining slots/capacity | High / medium | Good bounded polish |
| 7 | Handover packet: manifest, fixed terms, endpoints, outstanding obligations, latest dated retrieval, successor checklist | High / medium | Builds differentiation; export first |
| 8 | Automated keeper adapter plus reusable signed owner commands | Very high / large | Public testnet service gate; explicit separate scope |
| 9 | Full-download fallback with separate observations for each host | Medium / small-medium | Useful resilience polish; no fake combined success |
| 10 | Keyboard focus after route/step changes, skip link, clear selected section, field errors, copy fallback | Medium / small | Include in release QA/fixes |
| 11 | Backup/restore assistant and schema-version checks | High operational / medium | Schema guard now; restore drill mandatory |
| 12 | Multi-sample/retention-aware protocol, new providers, successor migration | Potentially high / very large | Stretch; not a last-minute contract change |

## Risk-based release QA matrix

Baseline counts in existing evidence are **31 app tests and 18 Rust tests**. They are recorded prior results, not a rerun by this review. Parent release QA must run the updated suites and actual flows, retaining exact pass/fail/not-run status. Every mutation test checks conservation and unchanged fixed payees/terms where relevant. Use fresh temporary local data and dedicated faucet-only fixtures; never mutate the recorded immutable deployment to manufacture new evidence.

| Area | Cases / failure injection | Required observation | Gate |
|---|---|---|---|
| Clean package | Frozen install, typecheck, tests, optimized WASM, frontend build | Exact versions, hashes, exit codes; no hidden global-only prerequisites | Prototype |
| Built server | Vite absent; `/`, assets, API, SPA navigation, restart | Full usable app and correct MIME/404/cache behavior | Prototype |
| Static boundary | Encoded traversal, dotfiles, `.secrets`, DB/blob/source paths | No arbitrary file exposure | Prototype |
| Config | Custom ports/data; bad mode/port/poll; duplicate/missing provider | Working overrides or explicit startup rejection | Prototype |
| Upload limits | 0, 1, 1024, 1025, 2500, 16MiB, 16MiB+1 | Exact permitted sizes; no partial publish | Prototype |
| Upload transport | Aborted body, absent/lying length, oversized headers, invalid JSON/base64 | Bounded failure; no publishable draft; clear 4xx | Prototype |
| Metadata | Nulls/wrong types, Unicode byte bounds, unpaired surrogate, HTML/path-like name | Canonical validation; opaque attachment; no execution/path selection | Prototype |
| Content identity | Browser/server/keeper disagreement; corrupt existing blob; filename-only change | Correct distinct manifest/file/root identity; rejection | Prototype |
| Merkle proof | Every boundary size, left/right path, padded last leaf, wrong bytes/index/version/provider/root | Valid only for exact fixed challenge | Prototype |
| Proof encoding | Noncanonical base64, upper/short hash, missing/extra sibling, oversize body | Bounded rejection; no earning | Prototype |
| Fixture independence | Independent small reference encoder/tree vs committed fixtures | No regenerated expected value during test | Hardening |
| API security | Missing/wrong token, disallowed Origin, preflight, route traversal, unknown IDs | 401/403/404/422 as intended; state unchanged | Prototype |
| Fetch boundary | Arbitrary URL import, redirect source, credentials/fragment, changed policy/root | No arbitrary fetch; approval binding retained | Prototype |
| New archive UX | Zero funding and zero imported copies | No funded/two-ready-copies claim; clear next steps | Prototype |
| Import | A only, A+B, interrupted import, repeated/concurrent import | Separate bytes, correct statuses, restart-safe result | Prototype |
| Worker isolation | A missing/corrupt/API timeout; B valid | B completes eligible work; A-specific error | Prototype |
| Settlement independence | Earn then lose bytes/disable serving | Claim and elapsed release continue; no new proof/accept | Prototype |
| Worker retry | Lost response after accept/open/prove/claim | Query/replay safely; no duplicate earning/payment | Prototype |
| Worker retry failure | Definitive payout failure, fresh retry, restart | New generation only after final failure | Prototype |
| Worker unknown | Unknown dispatch/receipt, timeout, restart | Remains pending; no timeout-based repayment | Prototype |
| Worker deadlines | Start-1/start/end-1/end, offline entire slot, later catch-up | Exact window rules; never retroactive earning | Prototype |
| Worker scale | Multiple maximum files, proof burst, slow client | Bounded memory/concurrency; deadline latency measured | Public hosting |
| Consent and caps | Wrong actor, disabled provider, duplicate slot, rate/slot caps | Fixed payee/terms; no reserve overcommit | Prototype |
| Capacity | 16 active, 256 lifetime, eight pending, pagination edge | Useful errors; no obligation eviction | Prototype |
| Freshness | API stops after load; slow/reordered poll; failed refresh after successful mutation | Stale warning, no old snapshot overwrite, retained receipt | Prototype |
| Client timing | Browser clock skew, expired unfinalized reserve, stale suggested slot | No false eligibility/success; authoritative rejection explained | Prototype |
| Normal transfer | Challenge and credits exist; transfer then old/new owner actions | Fixed obligations preserved; old authority gone | Prototype |
| Local receiver UI | Known keep/return/panic/forward; ordinary Bob; unsupported recipient | Accurate fixture labels; no accidental permanent lock | Prototype |
| Receiver contract | Keep/return/failure/malformed/oversize/forward/temporary-owner attack | Monotonic epoch, safe ownership and lock resolution | Testnet evidence |
| Pending transfer | Nested call and future configure/propose; provider proof/claim while locked | Lock limits future authority only | Prototype |
| Pending payout | Claim→transfer→callback success/failure; both callback orders; new earnings | Exact fixed creditor and conserved available/pending/paid | Native mandatory; live separate |
| Callback authenticity | Forged predecessor, duplicate/stale attempt, wrong promise count | No state movement | Prototype |
| Native payout failure | Actual transfer failure to dedicated unavailable fixed destination; retry after repair | Restored credit once, real balance/receipt proof | Stronger testnet gate |
| Gas/storage | Max proof depth and reachable near-capacity state; NFT/payment callbacks | Receipt gas/headroom measured, no permanently stuck callback | Stronger testnet gate |
| Expiry | Outstanding Proposed/Accepted/Challenged, earned and pending claims | Release all first, fixed unused refund, earned survives | Prototype |
| Idempotency | Same UUID/body concurrent; changed body; retry after state moves | Exact replay or conflict; no double mutation | Prototype |
| Local recovery | Crash before delivery; durable result before callback; reopen | Exactly once settlement; Unknown remains pending | Prototype |
| Backup restore | Stop/copy full DB+blobs; restore to new roots | Complete exports and hashes match; correct bindings | Prototype |
| Database versions | Future/unsupported schema, wrong mode/provider/API binding, lock contention | Safe startup/error; no silent rewrite | Prototype |
| Local download | Complete A/B, corrupt/truncated/oversize/no length, redirects/offline | Only verified bytes get Save; source/time/digests explicit | Prototype |
| Observations | Forged client verified flag or mismatch | Labeled browser-reported; never affects settlement | Prototype |
| Testnet view | Real fixed RPC; unavailable/wrong chain/code/keys; cache expiry | Actual dated observation; no local fallback | Prototype |
| Signed adapter | Wrong account/network/contract; user rejection; RPC timeout/restart | Genuine signing, durable finality, no impersonation | Usable testnet service |
| History/export | More than page size, failed/unknown attempts, new events during pagination | Complete export; no missing liabilities/history | Prototype |
| Desktop/mobile | 320/360/390/768/wide; all tabs/forms, long Unicode/account/amount | No blocked controls or page overflow; useful empty/errors | Prototype |
| Keyboard/a11y | Tab order, focus after steps/routes, labels/status/errors, zoom/reduced motion | Complete flow without pointer; announcements meaningful | Prototype |
| Browser lifecycle | Refresh/back/forward, two tabs, double click, interrupted upload | Clear recovery; no accidental duplicate funding | Prototype |
| Evidence/package | No credentials/runtime blobs; source/artifact/version mapping; expired demo | Exact claims, reproducible fresh instructions, gaps preserved | Prototype |

## Recommended bounded implementation sequence

1. Repair keeper isolation and content-independent settlement together, with regressions covering two archives and failure recovery.
2. Add a built serving path and configuration validation; smoke-test the packaged app with development servers absent.
3. Fix local receiver UX, stale-state sequencing, asset readiness and the most consequential misleading labels.
4. Add the exact payout/ownership interleavings, schema guard and backup restore drill; correct evidence language before rerunning release QA.
5. Perform actual browser/mobile/keyboard flows and all modified failure cases. Publish only the achieved scope. Keep signed automation and receipt-gas/native-failure work as explicit separately evaluated gates unless implemented and verified in this release.

Keep the current keyless deployment and public receipts intact. Any modified contract needs a fresh dedicated testnet asset, new artifact identity and new evidence. Neither publication nor mainnet use is implied by this review.
