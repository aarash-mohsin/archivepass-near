# Browser checks on the built app

Observed on 5–6 November 2026 in a browser against the isolated built application, not the Vite dev server. These are manual checks on top of the automated tests; they do not prove the app is free of defects.

## ArchivePass — localhost 9092, isolated asset 4e0137ce-d490-412b-8c77-ebca64c5dfd7

- Initial zero upkeep displayed Awaiting upkeep. Both keeper processes were HTTP reachable while readiness correctly remained 0 of 2, Not imported.
- Held the response after a real 0.1-NEAR local-ledger upkeep commit. Reload retained one unconfirmed request. Resume original request confirmed event 2 and cleared the journal; available upkeep remained exactly 0.1.
- Controlled API outage showed an explicit stale authoritative-view warning, retained last verified data, and disabled funding/import/poll changes. Background refresh recovered after restoring the API.
- Imported keeper A through the UI: readiness became 1 of 2, A Ready, B Not imported. Imported B: 2 of 2 Ready. This is local-file verification, not a claim of independent infrastructure or continuous availability.
- Browser whole-file download from A and then B independently matched 2,937 bytes and SHA-256 `613d3d09c8774dd2af511845c984555d9c6017cc470243ea181bce76818023f4`; each result named its actual source host and observation time.
- Ordinary transfer preview showed the 0.1 upkeep and fixed refund destination. Checking confirmation and then changing the recipient removed the old preview and confirmation controls. Re-previewed Bob, saved a real JSON handover download, and confirmed the ordinary local transfer: Bob became owner at epoch 1, Alice lost the preview action, and the refund destination stayed fixed. 
- Created a new archive through actual browser file selection, hashing/upload, rule validation, review and creation. Browser/server hashes agreed. Elapsed first-slot input was explicitly rejected; future inputs produced archive `ce5e585c-83ad-4968-961c-97f99f19f699` with the exact reviewed policy and Awaiting upkeep/0 of 2 readiness.

## Narrow screens and testnet view

- The built detail page rendered inside a real 360-pixel iframe. The inner document measured clientWidth 345 and scrollWidth 345 (15-pixel scrollbar), with a readable narrow layout and no horizontal page overflow.
- ArchivePass production testnet screen displayed final asset `archive.apw-mw3re9ta.testnet`, exact 50T code hash, zero access keys, Bob epoch 3, .003 paid/.017 available and zero conservation residual, with final-worker evidence and operator-runbook labels. Its skip link focused `main` while preserving the `#/testnet` route.
