// Bounded same-account faucet retry or fixed-expiry cleanup of this benchmark only.
import {readFileSync,writeFileSync,existsSync,renameSync} from 'node:fs';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';
import {setTimeout as pause} from 'node:timers/promises';
import assert from 'node:assert/strict';
import {Account,JsonRpcProvider,KeyPair,KeyPairSigner,actions} from 'near-api-js';
const ROOT=fileURLToPath(new URL('../',import.meta.url)),RPC='https://rpc.testnet.near.org',TGAS=10n**12n,mode=process.argv[2],run=process.argv[3];
assert.ok(['faucet','cleanup'].includes(mode));assert.match(run??'',/^[a-z0-9-]{5,48}$/);
const prefix='qa-testnet-benchmark-'+run,file=join(ROOT,'docs',prefix+'-'+mode+'-maintenance.json'),credential=JSON.parse(readFileSync(join(ROOT,'.secrets','qa-benchmark-'+run+'-root.json'),'utf8'));assert.match(credential.purpose,/ArchivePass isolated QA benchmark/);
const report=existsSync(file)?JSON.parse(readFileSync(file,'utf8')):{run,mode,started_at:new Date().toISOString(),status:'running',steps:[]};
const save=()=>{const temp=file.replace(/\.json$/,'-writing.json');writeFileSync(temp,JSON.stringify(report,null,2)+'\n');renameSync(temp,file);};
async function rpc(method,params){const body=JSON.stringify({jsonrpc:'2.0',id:randomUUID(),method,params});for(let attempt=0;attempt<6;attempt++){try{const r=await fetch(RPC,{method:'POST',headers:{'Content-Type':'application/json'},body,signal:AbortSignal.timeout(12000)});if([429,500,502,503,504,408].includes(r.status))throw Object.assign(new Error('RPC HTTP '+r.status),{retryable:true});const j=await r.json();if(j.error?.code===-429)throw Object.assign(new Error('RPC rate limited'),{retryable:true});if(j.error)throw new Error(JSON.stringify(j.error));return j.result;}catch(error){if(!(error.retryable||error.name==='TimeoutError'||error instanceof TypeError)||attempt===5)throw error;await pause(Math.min(4000,500*2**attempt));}}}
const query=(id,type,extra={})=>rpc('query',{request_type:type,account_id:id,finality:'final',...extra});
async function view(id,method,args={}){const r=await query(id,'call_function',{method_name:method,args_base64:Buffer.from(JSON.stringify(args)).toString('base64')});return JSON.parse(Buffer.from(r.result).toString());}
async function wait(ms,label){const end=Date.now()+ms;while(Date.now()<end){console.log(label+'; remaining '+Math.ceil((end-Date.now())/1000)+'s');await pause(Math.min(30000,end-Date.now()));}}
function missing(error){return String(error.message).includes('UNKNOWN_ACCOUNT');}
try{
  assert.equal((await rpc('status',[])).chain_id,'testnet');
  if(mode==='faucet'){
    let current;try{current=await query(credential.accountId,'view_account');}catch(error){if(!missing(error))throw error;}
    const latestRate=report.steps.filter(s=>s.http_status===429&&/^\d+$/.test(s.retry_after??'')).at(-1);if(!current&&latestRate){const until=Date.parse(latestRate.at)+Number(latestRate.retry_after)*1000;if(Date.now()<until){const cooldown={not_before_ms:until,retry_after_seconds:Number(latestRate.retry_after),account_id:credential.accountId,source:'preserved actual faucet Retry-After; no request before cooldown'};writeFileSync(join(ROOT,'data','qa-benchmark-faucet-cooldown.json'),JSON.stringify(cooldown,null,2)+'\n');report.status='cooldown';report.next_allowed_at=new Date(until).toISOString();save();console.log('No faucet POST: honoring Retry-After until '+report.next_allowed_at);process.exit(2);}}
    if(!current){
      const attempts=report.steps.filter(s=>s.http_status!==undefined).length;
      for(let attempt=attempts;attempt<3;attempt++){
        if(attempt>attempts)await wait(attempt===1?60000:120000,'Respecting same-request faucet backoff');
        const response=await fetch('https://helper.nearprotocol.com/account',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({newAccountId:credential.accountId,newAccountPublicKey:credential.publicKey}),signal:AbortSignal.timeout(30000)});
        const text=await response.text(),retryAfter=response.headers.get('retry-after');report.steps.push({at:new Date().toISOString(),account_id:credential.accountId,http_status:response.status,retry_after:retryAfter,body:text.slice(0,16000),truncated:text.length>16000});save();console.log('Same saved faucet account HTTP '+response.status+(retryAfter?' retry-after '+retryAfter:''));
        if(response.ok){for(let n=0;n<20;n++){try{current=await query(credential.accountId,'view_account');break;}catch(error){if(!missing(error))throw error;await pause(1000);}}if(current)break;}
        if(retryAfter&&Number(retryAfter)>180){report.server_retry_after_seconds=Number(retryAfter);report.next_allowed_at=new Date(Date.now()+Number(retryAfter)*1000).toISOString();writeFileSync(join(ROOT,'data','qa-benchmark-faucet-cooldown.json'),JSON.stringify({not_before_ms:Date.now()+Number(retryAfter)*1000,retry_after_seconds:Number(retryAfter),account_id:credential.accountId,source:'actual faucet Retry-After'},null,2)+'\n');break;}
        if(response.status!==429&&!response.ok)break;
      }
    }
    if(!current){report.status='rate_limited_or_unfinalized';report.account_id=credential.accountId;report.note='Same saved key/account retained. No alternate faucet, proxy, account cycling or rate-limit bypass was attempted.';save();console.log('Faucet remains unavailable after bounded same-account retries.');process.exitCode=2;}
    else{report.status='passed';report.account={account_id:credential.accountId,amount:current.amount};report.finished_at=new Date().toISOString();save();console.log('Saved dedicated faucet root confirmed: '+credential.accountId);}
  }else{
    if(report.status==='passed'){console.log('Cleanup already recorded; no new transactions.');process.exit(0);}
    const source=JSON.parse(readFileSync(join(ROOT,'docs',prefix+'.json'),'utf8'));assert.equal(source.status,'failed');const id=source.binding.contract_id,expiry=BigInt(source.binding.policy.fund_expiry),remaining=Number((expiry-BigInt(Date.now())*1000000n)/1000000n)+1500;if(remaining>0)await wait(remaining,'Waiting immutable failed-run expiry');
    const provider=new JsonRpcProvider({url:RPC});provider.sendJsonRpc=rpc;const owner=new Account(credential.accountId,provider,KeyPairSigner.fromSecretKey(credential.privateKey));
    const action=(method,args={},gas=80n*TGAS)=>actions.functionCall(method,Buffer.from(JSON.stringify(args)),gas,0n);
    async function send(name,receiverId,list,expectFailure=false){const outcome=await owner.signAndSendTransaction({receiverId,actions:list,waitUntil:'FINAL',throwOnFailure:false});const failed=Boolean(outcome.status?.Failure)||(outcome.receipts_outcome??[]).some(r=>r.outcome?.status?.Failure);report.steps.push({name,at:new Date().toISOString(),outcome,expected_failure:expectFailure});save();assert.equal(failed,expectFailure);console.log(name);return outcome;}
    let a=await view(id,'get_asset');assert.equal(a.ledger.pending_payments,'0','Unknown/pending liabilities must not be reset');let cursor='0',cs=[];do{const page=await view(id,'get_commitments',{from_index:cursor,limit:50});cs.push(...page.items);cursor=page.next_cursor;}while(cursor);const pending=cs.filter(c=>!['Earned','Missed'].includes(c.state));for(let i=0;i<pending.length;i+=8)await send('Expire failed-run real commitments '+i,id,pending.slice(i,i+8).map(c=>action('expire_period',{commitment_id:c.commitment_id},30n*TGAS)));
    if(!a.reserve_expired)await send('Finalize failed-run fixed unused reserve',id,[action('finalize_expiry')]);a=await view(id,'get_asset');const credit=a.credits.find(c=>c.kind==='refund');
    if(BigInt(credit.available)>0n){let beneficiaryExists=true;try{await query(a.policy.refund_beneficiary,'view_account');}catch(error){if(!missing(error))throw error;beneficiaryExists=false;}
      await send('Attempt fixed failed-run refund',id,[action('claim_refund',{},120n*TGAS)],!beneficiaryExists);
      if(!beneficiaryExists){const restored=await view(id,'get_asset'),r=restored.credits.find(c=>c.kind==='refund');assert.equal(r.available,credit.available);assert.equal(r.pending,'0');const keyPath=join(ROOT,'.secrets','qa-benchmark-'+run+'-refund.json');let refund;
        if(existsSync(keyPath))refund=JSON.parse(readFileSync(keyPath,'utf8'));else{const key=KeyPair.fromRandom('ed25519');refund={purpose:'ArchivePass isolated QA benchmark fixed-refund account',accountId:a.policy.refund_beneficiary,publicKey:key.getPublicKey().toString(),privateKey:key.toString()};writeFileSync(keyPath,JSON.stringify(refund,null,2)+'\n',{flag:'wx',mode:0o600});}assert.equal(refund.accountId,a.policy.refund_beneficiary);
        await send('Create original fixed failed-run beneficiary',refund.accountId,[actions.createAccount(),actions.transfer(300000000000000000000000n),actions.addFullAccessKey(KeyPair.fromString(refund.privateKey).getPublicKey())]);await send('Retry same restored failed-run credit',id,[action('claim_refund',{},120n*TGAS)]);
      }
    }
    report.final_asset=await view(id,'get_asset');report.final_account=await query(id,'view_account');report.final_keys=(await query(id,'view_access_key_list')).keys;assert.equal(report.final_asset.ledger.principal_paid,report.final_asset.ledger.principal_in);assert.equal(report.final_asset.ledger.pending_payments,'0');assert.equal(report.final_asset.ledger.conservation_residual,'0');assert.equal(report.final_keys.length,0);report.status='passed';report.finished_at=new Date().toISOString();save();console.log('Abandoned-run principal fully returned under unchanged fixed rules.');
  }
}catch(error){report.status='failed';report.error={message:error.message,stack:error.stack};save();console.error(error.message);process.exitCode=1;}
