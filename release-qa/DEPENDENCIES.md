# Dependency review

Checked 6 November 2026. Machine reports are in [`audits/`](audits/).

The final Rust lockfile still produces a nonzero cargo-audit result: `crypto-bigint` 0.5.5 has RUSTSEC-2026-0387 and `unsafe-libyaml` has an unmaintained warning. The official advisory describes timing leakage in affected secret-integer arithmetic; the patched major version is not a drop-in override for this SDK dependency graph. [RustSec advisory](https://rustsec.org/advisories/RUSTSEC-2026-0387.html).

For the contract workspace, `cargo tree --locked --offline --workspace --target wasm32-unknown-unknown --edges normal --invert <package>` shows neither crypto-bigint nor unsafe-libyaml in the normal deployed WASM dependency graph. These retained lockfile dependencies belong to host/test/build tooling. This scopes the exposure; it does not make the full dependency audit clean or prove those tools have no vulnerabilities. Do not use these test harnesses as general-purpose secret-key cryptographic services.

The unmaintained `wee_alloc` allocator was removed by disabling default SDK features in the contract workspace, including development and member dependencies. It no longer appears in the lockfile. All affected WASMs were rebuilt and freshly deployed for release testnet evidence; earlier deployed contracts retain their earlier code and evidence.

Production JavaScript audit results from the final frozen-install drill are recorded separately in `REPRODUCIBILITY.md` and its JSON evidence. A clean advisory database result is a point-in-time check, not an independent security audit.
