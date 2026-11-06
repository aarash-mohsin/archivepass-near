// One real upkeep contribution from a new, separate sponsor account (anyone may fund until fund_expiry).
// Usage: node scripts/testnet-sponsor-fund.mjs <amount NEAR>. Writes docs/testnet-sponsor-fund.json.
import {testnetOnly,signer,createChild,call,failed,receipt,record,view} from './testnet-common.mjs';
import {parseNear} from '../shared/amounts.ts';
await testnetOnly();
const amount=BigInt(parseNear(process.argv[2]??'0.01'));
const asset='archive.apw-mw4fsdcz.testnet';
const root=signer('release-worker-final-root');
const sponsor=await createChild(root,'sponsor',300_000_000_000_000_000_000_000n);
const before=await view(asset,'get_ledger');
const outcome=await call(sponsor,asset,'fund_upkeep',{version_id:'v1'},amount,30_000_000_000_000n);
const after=await view(asset,'get_ledger');
record('testnet-sponsor-fund',{sponsor:sponsor.accountId,amount:amount.toString(),before,after,...receipt(outcome)});
if(failed(outcome))throw new Error('fund_upkeep failed');
console.log(JSON.stringify({sponsor:sponsor.accountId,tx:outcome.transaction.hash,principal_in_before:before.principal_in,principal_in_after:after.principal_in}));
