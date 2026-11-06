# Release gate

Final checks before publishing, completed 6 November 2026. Scope: the local app and the valueless NEAR testnet deployment. This is not a mainnet approval or a formal security audit.

## Completed checks

| Check | Result |
|---|---|
| Review passes (see `docs/ASTRA_*.md`) | Initial and final review. Two P1 issues found in the final review, both about keeper worker restarts; fixed and checked again |
| Application test suite | 75 passed, 0 failed or skipped |
| Rust contract tests | 21 passed, including the receiver crate |
| Strict TypeScript and production build | Passed |
| Fresh frozen install and production start | Passed, including both keeper processes |
| Backup and restore with stopped services, hashes checked | Passed, including file downloads from both restored keepers and a newly generated operator token |
| Production JavaScript advisory audit | 0 advisories |
| Rust advisory scope | Two advisories remain in host, test and build tooling only, not in the deployed WASM; unmaintained allocator removed. See [DEPENDENCIES.md](DEPENDENCIES.md) |
| Contract deployment | Fresh keyless deployment with 50 Tgas callbacks; signed automatic keeper scenario |
| Long-lived redeploy (6 Nov) | Same WASM deployed keyless to `archive.apw-mw4fsdcz.testnet` with funding open until 1 Dec 2026; the signed keeper scenario passed again and the 75 app tests pass against the new binding |
| Keeper workers on testnet | Two real signed worker processes: restart reconciliation, NFT handover, automatic challenge answers and payments, an outage, and an unpaid miss |
| On-chain books | 0.02 NEAR funded = 0.003 paid + 0.017 available; nothing pending, conservation residual zero |
| Browser fault recovery | A lost response after a committed upkeep payment, then a reload, resumed the same request; stale data controls, keeper readiness 0 → 1 → 2, full-file hash from both keepers, transfer preview reset on change, new archive authoring |
| Narrow screens | Real 360px frame: no horizontal page overflow |

The two restart fixes are covered by 18 regression tests, which were rerun after the fixes. The process-level tests for those fixes use a mocked chain transport. The original live signed keeper run (5 Nov) used the code from before these fixes; the 6 Nov run on the long-lived redeploy used the current code, including them.

Source and artifact SHA-256 values for the checked release are in [FINAL_SOURCE_MANIFEST.json](FINAL_SOURCE_MANIFEST.json). It was recorded before the project was put under Git. Files changed since then: the README and documentation, the testnet binding files for the redeploy, and `scripts/qa-testnet-workers.mjs` (the testnet worker script, given an option for the funding expiry). The app, contract sources and WASMs are unchanged. Fresh-install and restore details are in [REPRODUCIBILITY.md](REPRODUCIBILITY.md); browser checks are in [BROWSER_RELEASE_QA.md](BROWSER_RELEASE_QA.md).

## Not covered

- **The 256-record capacity test was not repeated on the final contract build.** An earlier build (25 Tgas callbacks) reached 256 records and showed the callbacks needed more gas. A partial run on the final 50 Tgas build reached 16 records before public RPC rate limits stopped it, and its funds were fully refunded. The earlier build's result is not a pass for the final build. See `docs/RELEASE_TESTNET_BENCHMARK.md`.
- **Browser chain transactions** are out of scope; the owner CLI and the keeper workers make the on-chain changes.
- Both keeper processes run on one computer. A passed challenge does not prove continuous availability, independent copies or permanent storage.
- Testnet assets have a finite funding window (the current one closes on 1 December 2026), and the records are history, not something to replay.
