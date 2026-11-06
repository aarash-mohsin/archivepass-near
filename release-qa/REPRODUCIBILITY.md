# Fresh install and restore check

Run on 5 November 2026 at 22:25 UTC, on Windows with Node 24.22.1 and pnpm 11.25.0. Passed. Machine records: [fresh-1793917516356/evidence.json](fresh-1793917516356/evidence.json). The harness script that ran this check is not included in this repository; the steps it took are listed below.

1. **Clean copy.** The source was copied without dependencies, build output, Rust targets, local tooling, data, environment files or credentials.
2. **Install, build, audit.** `pnpm install --frozen-lockfile`, then the build script (including strict TypeScript), then `pnpm audit --prod --json`. All exited zero, and the production audit reported no advisories at any severity ([archivepass-audit.json](fresh-1793917516356/archivepass-audit.json)). An audit result is only valid for the time it was run.
3. **Run, back up, restore.** The real API and both keepers were started on isolated ports against freshly seeded SQLite data. Their built HTML was checked, and then every server and database was stopped. The shipped backup and restore functions were run, and every restored database and file was checked against the backup manifest's SHA-256 values. The restored services were then started again. Funding, ownership, policy and commitments matched exactly. Downloads from both keepers matched the original 2,937-byte file's SHA-256. Only freshly generated observation timestamps were excluded from the comparison.
4. **Operator token.** The operator token is left out of backups, and a new one is generated when a restored copy starts; both keepers received the new token.
5. **Production entry points.** The shipped `server/main.ts` and two `keeper/main.ts` processes were started against the restored data, outside Vite and the test harness. All HTTP checks passed, and both keepers reported `Ready` with their automatic worker enabled ([production-entry-smoke.json](fresh-1793917516356/production-entry-smoke.json)).

The final JavaScript suite passed with **75 passed, 0 failed, 0 skipped**; the full output is in [archivepass-recovery-final-tests.log](archivepass-recovery-final-tests.log). The check was repeated after the last fixes (receipt timestamp and hash ownership, and keeper restart recovery) and passed again. It made no chain writes or RPC calls.

The read-only configuration points to the final deployment `archive.apw-mw3re9ta.testnet`, code hash `8DVxZxb2nD3zST8tky1jPTbWvLJfs8vfLXzrB7AMgSNN`. The original configuration and scenario are kept in `docs/releases/original-20261105/`.
