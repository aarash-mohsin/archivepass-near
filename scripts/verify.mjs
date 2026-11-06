// npm run verify: read-only checks of the live testnet asset. No keys, no wallet, no writes.
// Prints one PASS/FAIL line per check and exits non-zero if any check fails.
import {readFileSync} from 'node:fs';
import {readLive,runChecks,explorerTx,ASSET_ID} from '../shared/live.ts';

const json=process.argv.includes('--json');
const file=new Uint8Array(readFileSync('fixtures/stewardship-guide.txt'));
const wasm=new Uint8Array(readFileSync('contract/target/near/archivepass.wasm'));
let state;
try{state=await readLive();}catch(error){console.error(`FAIL  could not read NEAR testnet: ${error instanceof Error?error.message:error}`);process.exit(1);}
const checks=await runChecks(state,{file,wasm,wasm_source:'contract/target/near/archivepass.wasm'});
if(json){console.log(JSON.stringify({asset:ASSET_ID,observed_at:state.observed_at,history_source:state.history_source,checks},null,2));}
else{
  console.log(`ArchivePass live verification · ${ASSET_ID} · NEAR testnet · ${state.observed_at}`);
  if(state.history_error)console.log(`note  transaction history unavailable (${state.history_error}); history-based checks skipped`);
  console.log('');
  for(const c of checks){
    console.log(`${c.status.padEnd(4)}  ${c.title}`);
    console.log(`      ${c.detail}`);
    for(const tx of [...new Set(c.txs)].slice(0,4))console.log(`      ${explorerTx(tx)}`);
  }
}
const failed=checks.filter(c=>c.status==='FAIL').length,passed=checks.filter(c=>c.status==='PASS').length;
if(!json)console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed?1:0);
