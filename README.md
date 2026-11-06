# ArchivePass

**Pass an archive on, with its upkeep money and its storage agreements attached.**

Small public archives, like a community's oral-history recordings, a school's open dataset or an open-source project's documentation, often stay online only because one volunteer pays for the hosting. When that person steps away, the archive tends to disappear. The money and the hosting arrangements sit in their personal accounts, and there's no clean way to hand them over.

ArchivePass makes the archive's stewardship an NFT that holds its own upkeep fund. Whoever holds the NFT can arrange future hosting, paid from a fund that can only be spent under fixed rules. Hosting providers ("keepers") are paid only after they answer a challenge with the right piece of the file. When the NFT moves to a new caretaker, the fund, the providers' existing agreements and the payments they've already earned all stay in place. The previous caretaker loses the authority to arrange service but cannot take the money with them.

Built for the **NFTs That Do Something** track of the NEAR Hackathon: the NFT is its own NEAR account, and it holds and spends money.

**Why not just use Arweave or Filecoin?** ArchivePass doesn't replace storage. It's the transferable part: who is responsible, what money is set aside, and which agreements the next caretaker inherits. Any storage provider could act as a keeper.

## How it works

1. **Create the asset.** A public file is split into chunks and hashed into a Merkle root. The asset contract fixes that content identity, a funding policy (eligible providers, maximum rates, an expiry date) and a refund address for unused money.
2. **Fund it.** Anyone can add upkeep money until the policy's expiry date. It can only be paid to eligible providers for service they've delivered, or returned to the fixed refund address.
3. **Schedule service.** The NFT holder proposes a service period for a provider. The provider accepts it on chain.
4. **Challenge and pay.** During a period, anyone can open a challenge, and the contract picks a random chunk of the file. The keeper answers with the bytes and a Merkle proof. If the contract accepts it in time, the keeper earns a fixed payment and can claim it. A missed answer earns nothing.
5. **Hand over.** Transferring the NFT moves the authority to a new caretaker. Commitments, earned payments and the refund address don't change.

The asset contract is in `contract/` (with a test receiver in `contract/receiver/`). Two separate keeper processes (`keeper/`) store their own copies of the file, answer challenges and claim payments automatically. The web app (`web/`) and API (`server/`) cover the caretaker, sponsor, keeper and public-reader views.

## See it on NEAR testnet

| Component | Account |
|---|---|
| Archive asset (NFT + fund) | [`archive.apw-mw3re9ta.testnet`](https://testnet.nearblocks.io/address/archive.apw-mw3re9ta.testnet) |
| Current caretaker (NFT owner) | [`bob.apw-mw3r4y86.testnet`](https://testnet.nearblocks.io/address/bob.apw-mw3r4y86.testnet) |
| Keepers | [`a.apw-mw3r4y86.testnet`](https://testnet.nearblocks.io/address/a.apw-mw3r4y86.testnet), [`b.apw-mw3r4y86.testnet`](https://testnet.nearblocks.io/address/b.apw-mw3r4y86.testnet) |
| Fixed refund address | [`refund.apw-mw3r4y86.testnet`](https://testnet.nearblocks.io/address/refund.apw-mw3r4y86.testnet) |

**The asset account has no access keys.** It was created, funded, deployed and initialized in [one transaction](https://testnet.nearblocks.io/txns/7n9gQbtrv6X7L3x8JNHcZuXQYU2mSqdVzVHdfkVnQoZA) with no AddKey action, so nobody can change its code or move its money outside the contract's rules. The contract has no upgrade, no generic execute and no owner withdrawal method.

Key transactions from the signed run on 5 November 2026:

| Step | Transaction |
|---|---|
| NFT handed over to Bob | [`75NznTSa…`](https://testnet.nearblocks.io/txns/75NznTSaKNrEXtjfNr5DEndamWEXUzQCx2sXBpWkGXhn) |
| Bob, the new caretaker, schedules a service period | [`ESwCfr8k…`](https://testnet.nearblocks.io/txns/ESwCfr8kCzJbdJcC9pwRgig393HBntF6KGBpkUinNa7N) |
| Keeper A opens a challenge on a period agreed before the handover | [`6vC7Zca3…`](https://testnet.nearblocks.io/txns/6vC7Zca3MpnabFWUNLj1YzpvwcwBm9pZUqdVzvcmhGpn) |
| Keeper A answers with the chunk and its Merkle proof | [`5gQNiJhk…`](https://testnet.nearblocks.io/txns/5gQNiJhkTbdk1ZtRCXatNmPbzt42vRLxXPFA27PrcuXo) |
| Keeper A claims its payment | [`EDX49jAa…`](https://testnet.nearblocks.io/txns/EDX49jAa74AhBCZwms2QiaMvbMVPi8XoA4C1j3qWDUq4) |
| Keeper B answers and claims | [`A7uVLmVm…`](https://testnet.nearblocks.io/txns/A7uVLmVmE6j2vu6uGsMA9QswJ41wJompG2LpEFgKCG3t), [`DizfWcMe…`](https://testnet.nearblocks.io/txns/DizfWcMePgQ7TURfV92zrZFiob74Wt1EEQbtafowbzUx) |

The full run is in [`docs/RELEASE_WORKERS-final-evidence.json`](docs/RELEASE_WORKERS-final-evidence.json). This asset's funding window closed on 6 November 2026 at 16:34 UTC; its state and history stay readable on chain.

### Check the contract yourself

Read-only calls against the public testnet RPC, with no wallet needed:

```sh
# Access keys on the asset account; expect "keys": []
curl -s https://rpc.testnet.near.org -H 'Content-Type: application/json' -d '{"jsonrpc":"2.0","id":1,"method":"query","params":{"request_type":"view_access_key_list","finality":"final","account_id":"archive.apw-mw3re9ta.testnet"}}'

# Who holds the NFT; expect owner_id bob.apw-mw3r4y86.testnet  (args: {"token_id":"archive"})
curl -s https://rpc.testnet.near.org -H 'Content-Type: application/json' -d '{"jsonrpc":"2.0","id":1,"method":"query","params":{"request_type":"call_function","finality":"final","account_id":"archive.apw-mw3re9ta.testnet","method_name":"nft_token","args_base64":"eyJ0b2tlbl9pZCI6ImFyY2hpdmUifQ=="}}'

# The fund's books; expect principal_in = principal_paid + available_upkeep and conservation_residual "0"
curl -s https://rpc.testnet.near.org -H 'Content-Type: application/json' -d '{"jsonrpc":"2.0","id":1,"method":"query","params":{"request_type":"call_function","finality":"final","account_id":"archive.apw-mw3re9ta.testnet","method_name":"get_ledger","args_base64":"e30="}}'
```

`result.result` in the last two responses is a byte array of JSON text. On 6 November 2026 the ledger showed 0.02 NEAR funded, 0.003 NEAR paid to keepers and 0.017 NEAR still available. The deployed code hash `8DVxZxb2nD3zST8tky1jPTbWvLJfs8vfLXzrB7AMgSNN` matches `contract/target/near/archivepass.wasm`. `node scripts/testnet-view.mjs` prints the same state in one go.

## Run it locally

Requires Node.js 24+ and pnpm 11.25.0.

```sh
pnpm install --frozen-lockfile
pnpm dev     # API on 8788, web app on 5174, keepers on 8791 and 8792
```

In a second terminal, load the sample archive:

```sh
pnpm seed
```

Open <http://127.0.0.1:5174>. The first start writes a local operator token to `data/app/operator-token`; paste it into **Operator access** in the app to enable changes. It is not a wallet key. The seed is safe to run more than once. It loads an original CC0 guide (three chunks) into both keepers and schedules two short 120-second service periods.

The browser app runs on a clearly labeled **local test ledger** with demo identities, and payments there are simulated. The real NEAR transactions are made by the owner CLI and the two signed keeper workers (see [docs/RELEASE_WORKERS.md](docs/RELEASE_WORKERS.md)). The app's **Testnet evidence** view reads the deployed asset; choosing a local role never signs a blockchain transaction.

`pnpm scenario`, with the app started with `ARCHIVEPASS_DEV_FAULTS=1`, runs a real-time outage and refund scenario in about 70 seconds. It pauses a keeper, lets its deadlines pass, and restores both keepers afterwards.

## Tests

```sh
pnpm test            # 75 application tests
pnpm typecheck       # strict TypeScript
pnpm build           # production frontend
pnpm test:contract   # 21 Rust tests; needs Rust
pnpm build:contract  # optimized WASM; needs Rust, the wasm32 target and cargo-near
```

The results of the last full release check are in [`release-qa/RELEASE_GATE.md`](release-qa/RELEASE_GATE.md). The full output of the final test run is in [`release-qa/archivepass-recovery-final-tests.log`](release-qa/archivepass-recovery-final-tests.log).

## Repository layout

| Path | Contents |
|---|---|
| `contract/` | Rust asset contract (`src/`) and test receiver (`receiver/`); committed release WASMs under `target/near/` |
| `keeper/` | Keeper service: local file store, challenge answers, and the signed testnet worker (`testnet-main.ts`) |
| `server/` | Node API with SQLite storage and the read-only testnet reader |
| `web/` | React app, including the Testnet evidence view |
| `shared/`, `fixtures/` | Shared protocol code, and the sample CC0 file and protocol fixture |
| `scripts/` | Dev, build, seed, scenario, backup/restore, the owner CLI and the testnet scripts |
| `tests/` | Contract-model, server, keeper, browser-logic and release tests |
| `docs/` | Design notes and on-chain evidence; start with the [evidence index](docs/EVIDENCE_INDEX.md) |
| `release-qa/` | Fresh-install, restore, dependency and browser checks |

The testnet scripts are for creating a **new, dedicated** testnet deployment. `testnet-deploy.mjs` refuses an existing account, and `testnet-scenario.mjs` refuses an asset that already holds funds. Their keys are written to the ignored `.secrets/` folder and never committed.

## Known limitations

- **Testnet only.** There is no mainnet deployment.
- **A passed challenge proves less than full storage.** It shows the keeper produced the requested chunk in time. It does not prove full-file availability, continuous uptime, an independent copy or permanent storage, and a keeper could fetch the bytes from somewhere else. Downloading the whole file and checking its hash in the browser is a separate check.
- **Both keepers run on the same computer** in this demo.
- **On-chain changes are made from the CLI and the keeper workers, not from the browser.** The browser's chain view is read-only.
- **The 256-record capacity test was not repeated on the final contract build.** An earlier build reached 256 records. A partial run on the final build reached 16 before public RPC rate limits stopped it, and all its funds were refunded. See [docs/RELEASE_TESTNET_BENCHMARK.md](docs/RELEASE_TESTNET_BENCHMARK.md).

## Built with

- **Contracts:** Rust, [near-sdk](https://github.com/near/near-sdk-rs) 5.30; the contract implements the NEP-171 NFT methods itself
- **App:** TypeScript, React 19, Vite, Node.js 24 (built-in SQLite), [near-api-js](https://github.com/near/near-api-js) 7.4
- **On chain:** NEAR testnet
- **AI tools:** OpenAI Codex was used as a coding assistant for implementation and for the review passes recorded in `docs/ASTRA_*.md`.

The exact versions are pinned in `package.json`, `pnpm-lock.yaml` and `contract/Cargo.lock`.

## Development history

The project was built locally during the hackathon and put under Git only when it was published, so the first commit contains the finished work. The testnet deployments give independent dated evidence: the asset, keeper and caretaker accounts were created on 5 November 2026 (see the explorer links above and [`docs/RELEASE_WORKERS-final-setup.json`](docs/RELEASE_WORKERS-final-setup.json)).

## License

[MIT](LICENSE)
