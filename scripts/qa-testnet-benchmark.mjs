// Isolated, valueless testnet QA. Never loads the application's existing credentials.
import {mkdirSync,writeFileSync,readFileSync,existsSync,copyFileSync,renameSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash,randomUUID} from 'node:crypto';
import {createServer} from 'node:http';
import {spawn} from 'node:child_process';
import {setTimeout as pause} from 'node:timers/promises';
import assert from 'node:assert/strict';
import {Account,JsonRpcProvider,KeyPair,KeyPairSigner,actions} from 'near-api-js';
import {buildArchive,buildProof,verifyProof} from '../shared/protocol.ts';
import {parseNear,formatNear} from '../shared/amounts.ts';

const ROOT=fileURLToPath(new URL('../',import.meta.url)),RPC='https://rpc.testnet.near.org',NEAR=10n**24n,TGAS=10n**12n;
const arg=(name)=>{const i=process.argv.indexOf(name);return i<0?null:process.argv[i+1];};
const digest=(bytes)=>createHash('sha256').update(bytes).digest('hex');
function publicFile(path,value){const temporary=path.replace(/\.json$/,'-writing.json');writeFileSync(temporary,JSON.stringify(value,null,2)+'\n');renameSync(temporary,path);}
function runPath(run){if(!/^[a-z0-9-]{5,48}$/.test(run))throw new Error('Invalid isolated benchmark run ID');return join(ROOT,'data','qa-benchmark-'+run);}
const verifiedEndpoints=new Set();
async function rpc(method,params){const body=JSON.stringify({jsonrpc:'2.0',id:randomUUID(),method,params});for(let attempt=0;attempt<6;attempt++){const endpoint=RPC;try{if(!verifiedEndpoints.has(endpoint)&&method!=='status'){const check=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:'qa-network',method:'status',params:[]}),signal:AbortSignal.timeout(8000)});if(!check.ok)throw Object.assign(new Error('RPC health HTTP '+check.status),{retryable:true});const status=await check.json();if(status.result?.chain_id!=='testnet')throw new Error('RPC did not identify testnet');verifiedEndpoints.add(endpoint);}const r=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body,signal:AbortSignal.timeout(12000)});if([429,500,502,503,504,408].includes(r.status))throw Object.assign(new Error('RPC HTTP '+r.status),{retryable:true});if(!r.ok)throw new Error('RPC HTTP '+r.status);const j=await r.json();if(j.error?.code===-429)throw Object.assign(new Error('RPC rate limited'),{retryable:true});if(j.error)throw new Error(JSON.stringify(j.error));if(method==='status'){if(j.result?.chain_id!=='testnet')throw new Error('RPC did not identify testnet');verifiedEndpoints.add(endpoint);}return j.result;}catch(error){if(!(error.retryable||error.name==='TimeoutError'||error.name==='AbortError'||error instanceof TypeError)||attempt===5)throw error;console.log('Retrying identical RPC payload after '+error.message);await pause(Math.min(4000,500*2**attempt));}}}
const query=(account_id,request_type,extra={})=>rpc('query',{request_type,account_id,finality:'final',...extra});
const state=(id)=>query(id,'view_account');
const keys=(id)=>query(id,'view_access_key_list');
async function view(id,method,args={}){const j=await query(id,'call_function',{method_name:method,args_base64:Buffer.from(JSON.stringify(args)).toString('base64')});return JSON.parse(Buffer.from(j.result).toString());}
const failures=(outcome)=>Boolean(outcome.status?.Failure)||(outcome.receipts_outcome??[]).some(r=>r.outcome?.status?.Failure);
function base58(bytes){const alphabet='123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';let n=BigInt('0x'+Buffer.from(bytes).toString('hex')),s='';while(n){s=alphabet[Number(n%58n)]+s;n/=58n;}for(const b of bytes){if(b!==0)break;s='1'+s;}return s;}
function functionAction(method,args={},gas=80n*TGAS,deposit=0n){return actions.functionCall(method,Buffer.from(JSON.stringify(args)),gas,deposit);}

async function keeperFixture(run,id){
  const directory=runPath(run),config=JSON.parse(readFileSync(join(directory,'fixture.json'),'utf8'));
  const local=join(directory,'keeper-'+id,'archive.bin'),bytes=readFileSync(local);
  const built=await buildArchive(bytes,config.metadata);assert.deepEqual(built.manifest,config.manifest);
  const port=id==='a'?8991:8992;
  const server=createServer(async(req,res)=>{try{const url=new URL(req.url??'/', 'http://127.0.0.1:'+port);if(req.method!=='GET')throw new Error('Read-only fixture');if(url.pathname==='/health'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify({run,id,bytes:bytes.length,file_sha256:built.manifest.file_sha256,source:'independently verified separate local file'}));return;}const fresh=readFileSync(local);assert.equal(digest(fresh),built.manifest.file_sha256);if(url.pathname==='/archive/download'){res.writeHead(200,{'Content-Type':'application/octet-stream','Content-Length':String(fresh.length),'Content-Disposition':'attachment; filename="benchmark.bin"','X-Content-Type-Options':'nosniff'});res.end(fresh);return;}const match=url.pathname.match(/^\/archive\/proof\/(0|[1-9][0-9]*)$/);if(!match)throw new Error('Unknown fixture route');const proof=await buildProof(built.tree,fresh,Number(match[1]),url.searchParams.get('commitment_id')??'0');res.setHeader('Content-Type','application/json');res.end(JSON.stringify(proof));}catch(error){res.writeHead(400,{'Content-Type':'application/json'});res.end(JSON.stringify({error:error.message}));}});
  server.listen(port,'127.0.0.1',()=>console.log('QA keeper '+id+' verified '+bytes.length+' actual bytes on '+port));
  for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>server.close(()=>process.exit(0)));
}

async function benchmark(){
  const started=Date.now(),run=Date.now().toString(36)+'-'+randomUUID().slice(0,6),directory=runPath(run),freshOwner=Boolean(arg('--fresh-owner-run')),reuseRun=arg('--reuse-run')??arg('--fresh-owner-run'),ownerFile=arg('--owner-file');if(reuseRun)runPath(reuseRun);if(ownerFile&&!/^\.secrets\/qa-benchmark-[a-z0-9-]+-root\.json$/.test(ownerFile.replaceAll('\\','/')))throw new Error('Owner file must be this benchmark own generated root credential');const suppliedOwner=ownerFile?JSON.parse(readFileSync(join(ROOT,ownerFile),'utf8')):null;if(suppliedOwner)assert.match(suppliedOwner.purpose,/ArchivePass isolated QA benchmark/);
  const operations=BigInt(parseNear(arg('--operations-near')??'6.5')),principal=BigInt(parseNear(arg('--principal-near')??'0.3')),refundEndowment=BigInt(parseNear(arg('--refund-account-near')??'0.3')),noGasBank=process.argv.includes('--no-gas-bank');assert.ok(operations>=5300000000000000000000000n,'Operations must exceed the final artifact fixed storage quote');assert.ok(principal>=20000000000000000000000n,'Principal must cover active reservations and already-earned credits');assert.ok(refundEndowment>=100000000000000000000000n,'Refund fixture account requires its own endowment');
  mkdirSync(directory,{recursive:true});mkdirSync(join(ROOT,'.secrets'),{recursive:true});mkdirSync(join(ROOT,'docs'),{recursive:true});
  const prefix='qa-testnet-benchmark-'+run,summaryFile=join(ROOT,'docs',prefix+'.json');
  const summary={run,reused_dedicated_run:reuseRun,started_at:new Date().toISOString(),network:'testnet',rpc:RPC,status:'initializing',scope:'fresh keyless account; largest Merkle proof; actual bounded state; receipt gas; native failure restoration and retry',steps:[],limits:{max_file_bytes:16777216,merkle_depth:14,target_lifetime_commitments:256,max_nonterminal:16,period_seconds:30,callback_allocated_gas:'50000000000000'},native_workspace:{tests_passed:Number(process.env.QA_BENCHMARK_NATIVE_TESTS)||null,command:'node scripts/contract.mjs test',count_source:'Parent supplied actual final native-run result'},keepers:{ports:[8991,8992],separate_processes:true,independent_infrastructure:false,description:'Isolated HTTP fixture processes with separately copied/recomputed actual files, not automatic product testnet schedulers'}};
  writeFileSync(summaryFile,JSON.stringify(summary,null,2)+'\n',{flag:'wx'});
  summary.funding={operations_yocto:operations.toString(),principal_yocto:principal.toString(),refund_account_endowment_yocto:refundEndowment.toString(),gas_bank_disabled:noGasBank};
  console.log('Isolated benchmark run '+run);
  const save=()=>publicFile(summaryFile,summary);
  let txIndex=0;const children=[];
  const provider=new JsonRpcProvider({url:RPC});provider.sendJsonRpc=rpc;
  function previous(label){if(!reuseRun)return null;const value=JSON.parse(readFileSync(join(ROOT,'.secrets','qa-benchmark-'+reuseRun+'-'+label+'.json'),'utf8'));assert.match(value.purpose,/ArchivePass isolated QA benchmark/);return value;}
  function credentials(label,id){const old=label==='root'&&suppliedOwner?suppliedOwner:reuseRun&&['root','gas','provider','receiver'].includes(label)&&(!freshOwner||label!=='root')?previous(label):null;const key=old?null:KeyPair.fromRandom('ed25519');const value=old?{...old,reused_from_run:reuseRun}:{purpose:'ArchivePass isolated QA benchmark faucet funds only',accountId:id,publicKey:key.getPublicKey().toString(),privateKey:key.toString()};assert.equal(value.accountId,id);writeFileSync(join(ROOT,'.secrets','qa-benchmark-'+run+'-'+label+'.json'),JSON.stringify(value,null,2)+'\n',{flag:'wx',mode:0o600});return value;}
  const account=(credential)=>new Account(credential.accountId,provider,KeyPairSigner.fromSecretKey(credential.privateKey));
  function receiptMetrics(outcome){const rows=(outcome.receipts_outcome??[]).map(r=>({receipt_id:r.id,executor_id:r.outcome?.executor_id,gas_burnt:r.outcome?.gas_burnt??'0',status:r.outcome?.status,callback:(r.outcome?.logs??[]).some(s=>s.includes('"event":"payment_resolved"'))?'payment50Tgas':(r.outcome?.logs??[]).some(s=>s.includes('"event":"transfer_call_resolved"'))?'NFT50Tgas':null}));return{total_receipt_gas_burnt:rows.reduce((n,r)=>n+BigInt(r.gas_burnt),0n).toString(),receipts:rows};}
  async function send(name,signer,receiverId,actionList,{expectedFailure=false,requiredFailureText=null}={}){
    const outcome=await signer.signAndSendTransaction({receiverId,actions:actionList,waitUntil:'FINAL',throwOnFailure:false});
    const file=prefix+'-tx-'+String(++txIndex).padStart(3,'0')+'.json',metrics=receiptMetrics(outcome);
    publicFile(join(ROOT,'docs',file),{name,network:'testnet',at:new Date().toISOString(),expected_failure:expectedFailure,outcome,...metrics});
    summary.steps.push({name,at:new Date().toISOString(),transaction_hash:outcome.transaction?.hash??null,evidence_file:file,expected_failure:expectedFailure,actual_failure:failures(outcome),...metrics});save();console.log(name+' [tx '+txIndex+']');
    assert.equal(failures(outcome),expectedFailure,'Unexpected finalized receipt failure: '+name);
    if(requiredFailureText)assert.ok(JSON.stringify(outcome).includes(requiredFailureText),'Expected failure reason '+requiredFailureText);
    return outcome;
  }
  async function faucet(label,id){
    const usesExisting=label==='root'&&suppliedOwner||reuseRun&&(!freshOwner||label!=='root');const cooldownPath=join(ROOT,'data','qa-benchmark-faucet-cooldown.json');if(!usesExisting&&existsSync(cooldownPath)){const cooldown=JSON.parse(readFileSync(cooldownPath,'utf8'));if(Date.now()<Number(cooldown.not_before_ms))throw new Error('Respect recorded faucet Retry-After until '+new Date(Number(cooldown.not_before_ms)).toISOString()+'; no new faucet identity/request attempted');}
    const c=credentials(label,id);let current;if(usesExisting){await state(id);return account(c);}
    try{const response=await fetch('https://helper.nearprotocol.com/account',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({newAccountId:id,newAccountPublicKey:c.publicKey}),signal:AbortSignal.timeout(30000)});const text=await response.text(),retryAfter=response.headers.get('retry-after');let result;try{result=JSON.parse(text);}catch{result={plain_text:text};}publicFile(join(ROOT,'docs',prefix+'-faucet-'+label+'.json'),{account_id:id,http_status:response.status,retry_after:retryAfter,result});if(response.status===429){const seconds=retryAfter&&/^\d+$/.test(retryAfter)?Number(retryAfter):3600;publicFile(cooldownPath,{not_before_ms:Date.now()+seconds*1000,retry_after_seconds:seconds,account_id:id,source:'actual faucet HTTP429; no alternate faucet/account cycling'});throw Object.assign(new Error('Faucet rate limited; saved account/key retained and Retry-After recorded'),{faucetRateLimited:true});}}catch(error){if(error.faucetRateLimited)throw error;summary.steps.push({name:'Faucet request inconclusive; checking same saved account',account_id:id,error:error.message});save();}
    for(let i=0;i<20;i++){try{current=await state(id);break;}catch(error){if(!String(error.message).includes('UNKNOWN_ACCOUNT'))throw error;await pause(1000);}}
    if(!current)throw new Error('Faucet did not finalize '+id+'; credential preserved and never regenerated');return account(c);
  }
  async function waitUntil(ns,label){let last=0;while(BigInt(Date.now())*1000000n<BigInt(ns)+1000000000n){if(Date.now()-last>30000){console.log('Waiting real chain window: '+label+'; elapsed '+Math.round((Date.now()-started)/1000)+'s');last=Date.now();}await pause(500);}}
  let root,gasRoot,id,policy,providerAccount,receiverAccount,eligible;
  async function snapshot(label){const [asset,storage,chainState]=await Promise.all([view(id,'get_asset'),view(id,'get_storage_quote'),state(id)]);const result={label,at:new Date().toISOString(),asset,storage,account:chainState};summary.snapshots??=[];summary.snapshots.push(result);save();return result;}
  try{
    assert.equal((await rpc('status',[])).chain_id,'testnet');
    const wasm=readFileSync(join(ROOT,'contract','target','near','archivepass.wasm')),receiverWasm=readFileSync(join(ROOT,'contract','target','near','archivepass_receiver','archivepass_receiver.wasm'));
    if(process.env.QA_BENCHMARK_EXPECTED_WASM)assert.equal(digest(wasm),process.env.QA_BENCHMARK_EXPECTED_WASM,'Refusing a different artifact than the final native/build gate');
    summary.artifacts={primary:{bytes:wasm.length,sha256:digest(wasm)},receiver:{bytes:receiverWasm.length,sha256:digest(receiverWasm)}};save();
    const bytes=Uint8Array.from({length:16777216},(_,i)=>i%251),fixture=JSON.parse(readFileSync(join(ROOT,'fixtures','protocol-v1.json'),'utf8')).vectors.find(v=>v.size_bytes==='16777216');
    const metadata={title:fixture.manifest.title,filename:fixture.manifest.filename,media_type:fixture.manifest.media_type,license_note:fixture.manifest.license_note};const built=await buildArchive(bytes,metadata);assert.deepEqual(built.manifest,fixture.manifest);assert.equal(built.tree.levels.length-1,14);
    publicFile(join(directory,'fixture.json'),{metadata,manifest:built.manifest});
    mkdirSync(join(directory,'keeper-a'),{recursive:true});mkdirSync(join(directory,'keeper-b'),{recursive:true});writeFileSync(join(directory,'keeper-a','archive.bin'),bytes);copyFileSync(join(directory,'keeper-a','archive.bin'),join(directory,'keeper-b','archive.bin'));
    for(const keeper of ['a','b']){const child=spawn(process.execPath,[fileURLToPath(import.meta.url),'--keeper',keeper,'--run',run],{cwd:ROOT,stdio:['ignore','inherit','inherit']});children.push(child);child.on('error',error=>console.error('Fixture child error: '+error.message));}
    for(const port of [8991,8992]){let ready=false;for(let attempt=0;attempt<30;attempt++){try{const response=await fetch('http://127.0.0.1:'+port+'/health',{signal:AbortSignal.timeout(1500)});const health=await response.json();assert.equal(health.run,run);assert.equal(health.file_sha256,built.manifest.file_sha256);ready=true;break;}catch(error){if(attempt===29)throw error;await pause(300);}}assert.ok(ready);const response=await fetch('http://127.0.0.1:'+port+'/archive/download');assert.equal(digest(Buffer.from(await response.arrayBuffer())),built.manifest.file_sha256);}
    summary.manifest=built.manifest;summary.status='provisioning';save();
    root=await faucet('root',suppliedOwner?.accountId??(reuseRun&&!freshOwner?previous('root').accountId:'qab-'+run+'.testnet'));gasRoot=await faucet('gas',reuseRun?previous('gas').accountId:'qag-'+run+'.testnet');
    if(!freshOwner&&!noGasBank)await send('Dedicated gas faucet provisioning',gasRoot,root.accountId,[actions.transfer((reuseRun?2n:7n)*NEAR)]);
    const longId=(prefix)=>prefix+'x'.repeat(64-root.accountId.length-1-prefix.length)+'.'+root.accountId;
    eligible=reuseRun?JSON.parse(readFileSync(join(ROOT,'docs','qa-testnet-benchmark-'+reuseRun+'.json'),'utf8')).binding.policy.eligible_providers:Array.from({length:8},(_,i)=>longId('p'+i));
    const pc=credentials('provider',eligible[0]),rc=credentials('receiver',reuseRun?previous('receiver').accountId:longId('receiver'));
    providerAccount=account(pc);receiverAccount=account(rc);
    if(!reuseRun){await send('Create dedicated real provider',root,pc.accountId,[actions.createAccount(),actions.transfer(600000000000000000000000n),actions.addFullAccessKey(KeyPair.fromString(pc.privateKey).getPublicKey())]);await send('Create and deploy dedicated receiver fixture',root,rc.accountId,[actions.createAccount(),actions.transfer(1600000000000000000000000n),actions.addFullAccessKey(KeyPair.fromString(rc.privateKey).getPublicKey()),actions.deployContract(receiverWasm)]);}else{await state(pc.accountId);await send('Redeploy current dedicated receiver artifact with its own retained fixture key',receiverAccount,rc.accountId,[actions.deployContract(receiverWasm)]);}
    id=(freshOwner?'asset-v3-'+run:reuseRun?'asset-v2-'+run:'asset')+'.'+root.accountId;const refundId=longId(reuseRun?'refund'+run.slice(-6):'refund');
    const block=await rpc('block',{finality:'final'}),origin=BigInt(block.header.timestamp_nanosec??block.header.timestamp)+90000000000n;
    policy={service_origin:origin.toString(),period_duration:'30000000000',max_provider_rate:'1000000000000000000000',max_slot_spend:'8000000000000000000000',fund_expiry:(origin+990000000000n).toString(),refund_beneficiary:refundId,eligible_providers:eligible,max_nonterminal_commitments:16,max_total_commitments:256,max_pending_payouts:8};
    const providers=eligible.map((provider_id,i)=>{const prefix='http://127.0.0.1:'+String(i%2?8992:8991)+'/benchmark-advisory/';return{provider_id,label:('Benchmark provider '+i+' ').padEnd(80,'x'),endpoint:prefix+'x'.repeat(256-prefix.length),enabled:true};});
    summary.binding={contract_id:id,owner_id:root.accountId,provider_id:pc.accountId,receiver_id:rc.accountId,refund_id:refundId,policy,endpoint_note:'256-byte advisory stress strings; actual fixture HTTP routes are /archive/*, not these metadata paths'};save();
    await send('Atomic keyless asset create, operations, deploy and initialize',root,id,[actions.createAccount(),actions.transfer(operations),actions.deployContract(wasm),functionAction('new',{owner_id:root.accountId,manifest:built.manifest,policy,providers,network_domain:'near-testnet',protocol_version:'archivepass-v1'},150n*TGAS)]);
    assert.equal((await keys(id)).keys.length,0);assert.equal((await state(id)).code_hash,base58(createHash('sha256').update(wasm).digest()));
    await send('Fund actual restricted benchmark upkeep '+formatNear(principal.toString())+' NEAR',root,id,[functionAction('fund_upkeep',{version_id:'v1'},60n*TGAS,principal)]);
    summary.status='building-real-lifetime-state';save();
    const propose=async(slot)=>{await send('Propose eight immutable commitments slot '+slot,root,id,eligible.map(provider_id=>functionAction('propose_period',{provider_id,slot:String(slot),rate:policy.max_provider_rate,expected_owner_epoch:'0'},30n*TGAS,1n)));summary.actual_lifetime_commitments=(slot+1)*8;save();};
    const expire=async(slot,signer=root)=>send('Expire eight real elapsed commitments slot '+slot,signer,id,eligible.map((_,i)=>functionAction('expire_period',{commitment_id:String(slot*8+i)},30n*TGAS)));
    await propose(0);await propose(1);
    await send('Seventeenth active commitment rejected',root,id,[functionAction('propose_period',{provider_id:eligible[0],slot:'2',rate:policy.max_provider_rate,expected_owner_epoch:'0'},50n*TGAS,1n)],{expectedFailure:true,requiredFailureText:'CAPACITY_REACHED'});
    await snapshot('16-active initial state');
    for(let slot=2;slot<32;slot++){
      await waitUntil(origin+BigInt(slot-1)*30000000000n,'oldest slot expires before scheduling slot '+slot);await expire(slot-2);
      if(!noGasBank&&BigInt((await state(root.accountId)).amount)<800000000000000000000000n)await send('Dedicated extra gas buffer',gasRoot,root.accountId,[actions.transfer(reuseRun?NEAR/2n:NEAR)]);
      await propose(slot);
      if(slot%8===7)await snapshot('Reached '+((slot+1)*8)+' lifetime records');
      if(slot===31)await send('Fixed provider accepts final near-capacity commitment',providerAccount,id,[functionAction('accept_period',{commitment_id:'248'},60n*TGAS)]);
    }
    summary.status='near-capacity-proof-and-callbacks';save();await waitUntil(origin+930000000000n,'last slot max-depth response');
    const opened=await send('Open actual random challenge at 256 lifetime records',root,id,[functionAction('open_challenge',{commitment_id:'248'},80n*TGAS)]);
    const encoded=opened.status?.SuccessValue;assert.ok(typeof encoded==='string');const challenged=JSON.parse(Buffer.from(encoded,'base64').toString());
    const proof=await(await fetch('http://127.0.0.1:8991/archive/proof/'+challenged.challenge.chunk_index+'?commitment_id=248')).json();assert.equal(proof.siblings.length,14);assert.equal(await verifyProof(built.manifest,proof),true);
    summary.max_depth_proof={commitment_id:'248',chunk_index:proof.chunk_index,siblings:proof.siblings.length,bytes:Buffer.from(proof.chunk_base64,'base64').length,source:'actual independent HTTP fixture file'};save();
    await send('Actual depth14 1KiB response at 256-record state',providerAccount,id,[functionAction('submit_response',proof,80n*TGAS)]);
    const beforeLowGas=await view(id,'get_asset');await send('Low-gas claim rejected before reserving fixed credit',root,id,[functionAction('claim_provider',{provider_id:pc.accountId},119n*TGAS)],{expectedFailure:true,requiredFailureText:'INSUFFICIENT_GAS'});assert.deepEqual((await view(id,'get_asset')).ledger,beforeLowGas.ledger);
    const providerBefore=BigInt((await state(pc.accountId)).amount);await send('Actual fixed native provider payout at near-capacity state',root,id,[functionAction('claim_provider',{provider_id:pc.accountId},120n*TGAS)]);assert.equal(BigInt((await state(pc.accountId)).amount)-providerBefore,BigInt(policy.max_provider_rate));
    const transfer={receiver_id:rc.accountId,token_id:'archive',approval_id:null,memo:'Actual near-capacity QA'};
    const beforeLowNft=await view(id,'get_asset');await send('Low-gas transfer-call rejected before provisional ownership',root,id,[functionAction('nft_transfer_call',{...transfer,msg:'return'},174n*TGAS,1n)],{expectedFailure:true,requiredFailureText:'INSUFFICIENT_GAS'});const afterLowNft=await view(id,'get_asset');assert.equal(afterLowNft.owner_epoch,beforeLowNft.owner_epoch);assert.equal(afterLowNft.transfer_call_pending,null);
    await send('Actual near-capacity transfer-call return and private resolver',root,id,[functionAction('nft_transfer_call',{...transfer,msg:'return'},200n*TGAS,1n)]);let current=await view(id,'get_asset');assert.equal(current.owner_id,root.accountId);assert.equal(current.transfer_call_pending,null);
    await send('Actual near-capacity transfer-call forwarding and private resolver',root,id,[functionAction('nft_transfer_call',{...transfer,msg:'forward:'+root.accountId},200n*TGAS,1n)]);current=await view(id,'get_asset');assert.equal(current.owner_id,root.accountId);assert.equal(current.transfer_call_pending,null);
    await send('257th lifetime commitment rejected on actual contract',root,id,[functionAction('propose_period',{provider_id:eligible[0],slot:'32',rate:policy.max_provider_rate,expected_owner_epoch:current.owner_epoch},50n*TGAS,1n)],{expectedFailure:true,requiredFailureText:'CAPACITY_REACHED'});
    await snapshot('Actual256-record proof, native payout and NFT resolvers completed');
    await expire(30,providerAccount);await waitUntil(origin+960000000000n,'final last-slot releases');await expire(31,providerAccount);
    await waitUntil(BigInt(policy.fund_expiry),'immutable reserve expiry');
    await send('Finalize unused reserve to fixed nonexistent beneficiary',root,id,[functionAction('finalize_expiry',{},100n*TGAS)]);
    const beforeFailure=await view(id,'get_asset');const refundCredit=beforeFailure.credits.find(c=>c.kind==='refund');assert.ok(BigInt(refundCredit.available)>0n);
    const failedRefund=await send('Actual native payout fails to nonexistent named beneficiary',root,id,[functionAction('claim_refund',{},120n*TGAS),functionAction('nft_transfer',{receiver_id:pc.accountId,token_id:'archive',approval_id:null,memo:'Actual failed fixed-refund callback across ownership change'},80n*TGAS,1n)],{expectedFailure:true,requiredFailureText:'AccountDoesNotExist'});
    const restored=await view(id,'get_asset'),restoredCredit=restored.credits.find(c=>c.kind==='refund');assert.equal(restoredCredit.available,refundCredit.available);assert.equal(restoredCredit.pending,'0');assert.equal(restored.ledger.pending_payments,'0');assert.equal(restored.owner_id,pc.accountId);const failedParent=failedRefund.receipts_outcome.find(r=>(r.outcome.logs??[]).some(s=>s.includes('"event":"payment_started"'))&&(r.outcome.logs??[]).some(s=>s.includes('"event":"nft_transfer"'))),failedCallback=failedRefund.receipts_outcome.find(r=>(r.outcome.logs??[]).some(s=>s.includes('"event":"payment_resolved"')));assert.ok(failedParent&&failedCallback);summary.failed_refund_handover={parent_receipt_id:failedParent.id,callback_receipt_id:failedCallback.id,owner_during_callback:pc.accountId,fixed_creditor:refundId,exact_restored_credit:refundCredit.available};save();
    summary.companion_owner_handoff=pc.accountId;save();
    const refund=credentials('refund',refundId);await send('Create original fixed refund account without redirecting claim',root,refundId,[actions.createAccount(),actions.transfer(refundEndowment),actions.addFullAccessKey(KeyPair.fromString(refund.privateKey).getPublicKey())]);
    const refundBefore=BigInt((await state(refundId)).amount);await send('Retry original fixed refund after actual failed receipt',providerAccount,id,[functionAction('claim_refund',{},120n*TGAS)]);assert.equal(BigInt((await state(refundId)).amount)-refundBefore,BigInt(refundCredit.available));
    summary.root_idle_for_companion=true;summary.status='awaiting-companion-final-claim';save();let observed=await view(id,'get_asset');const companionFile=join(ROOT,'docs',prefix+'-pending.json');const companionDeadline=Date.now()+120000;while(existsSync(companionFile)&&Date.now()<companionDeadline){const companion=JSON.parse(readFileSync(companionFile,'utf8'));if(companion.status==='failed')throw new Error('Companion failed; preserve actual earned credit and inspect '+prefix+'-pending.json');if(companion.status==='passed'&&observed.owner_id===root.accountId&&observed.ledger.earned_credit==='0'&&observed.ledger.pending_payments==='0')break;console.log('Root is idle; waiting for exact companion claim/NFT callback evidence');await pause(2000);observed=await view(id,'get_asset');}
    const final=await snapshot('Final actual balance and principal reconciliation');assert.equal(final.asset.owner_id,root.accountId);assert.equal(final.asset.ledger.principal_in,principal.toString());assert.equal(final.asset.ledger.principal_paid,final.asset.ledger.principal_in);assert.equal(final.asset.ledger.pending_payments,'0');assert.equal(final.asset.ledger.conservation_residual,'0');assert.equal((await keys(id)).keys.length,0);
    summary.actual_lifetime_commitments=(await view(id,'get_commitments',{from_index:'250',limit:50})).items.length+250;assert.equal(summary.actual_lifetime_commitments,256);
    summary.callback_gas=summary.steps.flatMap(s=>s.receipts.filter(r=>r.callback).map(r=>({step:s.name,...r,allocated_gas:'50000000000000',headroom_gas:(50000000000000n-BigInt(r.gas_burnt)).toString()})));
    summary.status='passed';summary.finished_at=new Date().toISOString();summary.duration_seconds=Math.round((Date.now()-started)/1000);save();console.log('PASS actual256-record / depth14 / native failure+retry benchmark: '+summaryFile);
  }catch(error){summary.status='failed';summary.error={message:error.message,stack:error.stack};summary.failed_at=new Date().toISOString();if(id)try{summary.failure_snapshot=await view(id,'get_asset');summary.failure_storage=await view(id,'get_storage_quote');}catch{}save();console.error('Benchmark failed honestly: '+error.message);process.exitCode=1;}
  finally{for(const child of children)child.kill('SIGINT');}
}

if(arg('--keeper'))await keeperFixture(arg('--run'),arg('--keeper'));else await benchmark();
