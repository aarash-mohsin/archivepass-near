// Read-only checks against the live ArchivePass asset on NEAR testnet.
// Shared by the hosted page (site/) and `npm run verify` (scripts/verify.mjs).
// Nothing here signs a transaction or needs a key.
import type {ChainAsset,Commitment,Credit,Manifest,PaymentAttempt,Page} from './types.ts';
import {buildArchive,hashManifest,sha256,verifyProof} from './protocol.ts';
import {formatNear} from './amounts.ts';

export const ASSET_ID='archive.apw-mw4fsdcz.testnet';
export const EXPECTED_CODE_HASH='8DVxZxb2nD3zST8tky1jPTbWvLJfs8vfLXzrB7AMgSNN';
export const RPC_URLS=['https://test.rpc.fastnear.com','https://rpc.testnet.near.org'];
export const TX_API='https://tx.test.fastnear.com/v0';
export const explorerTx=(hash:string)=>`https://testnet.near.rocks/tx/${hash}`;
export const nearblocksTx=(hash:string)=>`https://testnet.nearblocks.io/txns/${hash}`;

const B58='123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
export function base58(bytes:Uint8Array):string{
  let n=0n;for(const b of bytes)n=n*256n+BigInt(b);
  let out='';while(n>0n){out=B58[Number(n%58n)]+out;n/=58n;}
  for(const b of bytes){if(b!==0)break;out='1'+out;}return out;
}
export function unbase58(value:string):Uint8Array{
  let n=0n;for(const c of value){const i=B58.indexOf(c);if(i<0)throw new Error('Invalid base58');n=n*58n+BigInt(i);}
  const out:number[]=[];while(n>0n){out.unshift(Number(n%256n));n/=256n;}
  for(const c of value){if(c!=='1')break;out.unshift(0);}return Uint8Array.from(out);
}
export async function codeHashOf(wasm:Uint8Array):Promise<string>{
  return base58(new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256',new Uint8Array(wasm).buffer)));
}

type Fetch=typeof fetch;
async function postJson(fetcher:Fetch,url:string,body:unknown,timeout=15000):Promise<any>{
  const response=await fetcher(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(timeout)});
  if(!response.ok)throw new Error(`${url} answered HTTP ${response.status}`);
  return response.json();
}
export async function rpc(method:string,params:unknown,fetcher:Fetch=fetch):Promise<any>{
  let last:unknown;
  for(const url of RPC_URLS){
    try{
      const value=await postJson(fetcher,url,{jsonrpc:'2.0',id:'archivepass',method,params});
      if(value.error)throw new Error(value.error.data??value.error.message??JSON.stringify(value.error));
      if(value.result?.error)throw new Error(String(value.result.error));
      return value.result;
    }catch(error){last=error;}
  }
  throw last instanceof Error?last:new Error(String(last));
}
const b64json=(value:unknown)=>btoa(JSON.stringify(value));
export async function view<T>(method:string,args:unknown={},account=ASSET_ID,fetcher:Fetch=fetch):Promise<T>{
  const result=await rpc('query',{request_type:'call_function',finality:'final',account_id:account,method_name:method,args_base64:b64json(args)},fetcher);
  return JSON.parse(new TextDecoder().decode(Uint8Array.from(result.result as number[])));
}

export interface ChainEvent {
  tx:string;at:string;block:number;signer:string;method:string;
  standard:string;event:string;data:any;args:any;
}
export interface LiveState {
  observed_at:string;chain_id:string;code_hash:string;access_keys:unknown[];
  asset:ChainAsset;commitments:Commitment[];payments:PaymentAttempt[];credits:Credit[];
  events:ChainEvent[];history_source:'fastnear-tx-api'|'unavailable';history_error:string|null;
  old_owner_supply:Record<string,string>;
}

/** Every transaction that touched the asset, with its NEP-171 and ArchivePass event logs. */
export async function readHistory(fetcher:Fetch=fetch):Promise<ChainEvent[]>{
  const listing=await postJson(fetcher,`${TX_API}/account`,{account_id:ASSET_ID},20000);
  const hashes:string[]=[...new Set<string>((listing.account_txs??[]).map((t:any)=>t.transaction_hash))];
  const details:any[]=[];
  for(let i=0;i<hashes.length;i+=5){
    const page=await postJson(fetcher,`${TX_API}/transactions`,{tx_hashes:hashes.slice(i,i+5)},20000);
    if(!Array.isArray(page.transactions))throw new Error('The transaction API returned no transactions.');
    details.push(...page.transactions);
  }
  const events:ChainEvent[]=[];
  for(const item of details){
    const tx=item.transaction;if(tx.receiver_id!==ASSET_ID)continue;
    const call=(tx.actions as any[]).map(a=>typeof a==='object'&&a.FunctionCall?a.FunctionCall:null).find(Boolean);
    let args:any=null;try{args=call?JSON.parse(atob(call.args)):null;}catch{args=null;}
    const base={tx:tx.hash as string,signer:tx.signer_id as string,method:call?.method_name??'(transfer)',args};
    let found=false;
    for(const receipt of item.receipts as any[]){
      if(receipt.execution_outcome.outcome.executor_id!==ASSET_ID)continue;
      for(const log of receipt.execution_outcome.outcome.logs as string[]){
        if(!log.startsWith('EVENT_JSON:'))continue;
        let parsed:any;try{parsed=JSON.parse(log.slice(11));}catch{continue;}
        for(const data of parsed.data??[]){
          found=true;
          events.push({...base,at:String(receipt.execution_outcome.block_timestamp),block:receipt.execution_outcome.block_height,standard:parsed.standard,event:parsed.event,data});
        }
      }
    }
    if(!found)events.push({...base,at:String(item.execution_outcome.block_timestamp),block:item.execution_outcome.block_height,standard:'none',event:'no_event',data:null});
  }
  return events.sort((a,b)=>a.block-b.block||(BigInt(a.at)<BigInt(b.at)?-1:BigInt(a.at)>BigInt(b.at)?1:0));
}

async function allPages<T>(method:string,fetcher:Fetch):Promise<T[]>{
  const items:T[]=[];let from='0';
  for(let guard=0;guard<10;guard++){const page=await view<Page<T>>(method,{from_index:from,limit:50},ASSET_ID,fetcher);items.push(...page.items);if(!page.next_cursor)break;from=page.next_cursor;}
  return items;
}

export async function readLive(fetcher:Fetch=fetch):Promise<LiveState>{
  const [status,account,keys,asset,commitments,payments,credits]=await Promise.all([
    rpc('status',[],fetcher),
    rpc('query',{request_type:'view_account',finality:'final',account_id:ASSET_ID},fetcher),
    rpc('query',{request_type:'view_access_key_list',finality:'final',account_id:ASSET_ID},fetcher),
    view<ChainAsset>('get_asset',{},ASSET_ID,fetcher),
    allPages<Commitment>('get_commitments',fetcher),
    allPages<PaymentAttempt>('get_payments',fetcher),
    view<Credit[]>('get_credits',{},ASSET_ID,fetcher),
  ]);
  let events:ChainEvent[]=[],history_error:string|null=null;
  try{events=await readHistory(fetcher);}catch(error){history_error=error instanceof Error?error.message:String(error);}
  const old_owner_supply:Record<string,string>={};
  for(const t of events.filter(e=>e.event==='nft_transfer'))old_owner_supply[t.data.old_owner_id]=await view<string>('nft_supply_for_owner',{account_id:t.data.old_owner_id},ASSET_ID,fetcher);
  return {observed_at:new Date().toISOString(),chain_id:status.chain_id,code_hash:account.code_hash,access_keys:keys.keys,asset,commitments,payments,credits,events,history_source:history_error?'unavailable':'fastnear-tx-api',history_error,old_owner_supply};
}

export type CheckStatus='PASS'|'FAIL'|'INFO';
export interface Check {id:string;title:string;status:CheckStatus;detail:string;txs:string[];}
export interface CheckInputs {file:Uint8Array;wasm:Uint8Array|null;wasm_source:string;now_ms?:number;}

const sum=(values:bigint[])=>values.reduce((a,b)=>a+b,0n);
const near=(value:bigint|string)=>`${formatNear(value.toString())} NEAR`;
const short=(value:string)=>value;
export const timeOf=(ns:string)=>new Date(Number(BigInt(ns)/1_000_000n));
const utc=(ns:string)=>timeOf(ns).toISOString().replace('T',' ').slice(0,19)+' UTC';

export async function runChecks(state:LiveState,input:CheckInputs):Promise<Check[]>{
  const checks:Check[]=[];
  const add=(id:string,title:string,ok:boolean|'info',detail:string,txs:string[]=[])=>checks.push({id,title,status:ok==='info'?'INFO':ok?'PASS':'FAIL',detail,txs});
  const {asset,events}=state,ledger=asset.ledger,haveHistory=state.history_source!=='unavailable';
  const find=(name:string)=>events.filter(e=>e.event===name);
  const creation=events.find(e=>e.method==='new'||e.event==='asset_created');
  const transfers=find('nft_transfer');

  add('network','The RPC is NEAR testnet',state.chain_id==='testnet',`chain_id = "${state.chain_id}"`);
  add('keyless','The asset account has no access keys',state.access_keys.length===0,
    `view_access_key_list(${ASSET_ID}) returned ${state.access_keys.length} keys. With no keys, nobody can redeploy the code or sign for the account.`,
    creation?[creation.tx]:[]);

  if(input.wasm){
    const local=await codeHashOf(input.wasm);
    add('code','Deployed code = the committed release WASM',local===state.code_hash&&local===EXPECTED_CODE_HASH,
      `sha256(${input.wasm_source}) = ${local}; on-chain code_hash = ${state.code_hash}.`);
  }else add('code','Deployed code = the recorded release hash',state.code_hash===EXPECTED_CODE_HASH,`on-chain code_hash = ${state.code_hash}; recorded release hash = ${EXPECTED_CODE_HASH}. (The WASM file itself could not be fetched here.)`);

  const parts=[ledger.available_upkeep,ledger.reserved_upkeep,ledger.earned_credit,ledger.refund_credit,ledger.pending_payments,ledger.principal_paid].map(BigInt);
  add('books','Every unit of upkeep is accounted for',BigInt(ledger.principal_in)===sum(parts)&&ledger.conservation_residual==='0',
    `principal_in ${near(ledger.principal_in)} = available ${near(ledger.available_upkeep)} + reserved ${near(ledger.reserved_upkeep)} + earned ${near(ledger.earned_credit)} + refund ${near(ledger.refund_credit)} + pending ${near(ledger.pending_payments)} + paid ${near(ledger.principal_paid)}; residual ${ledger.conservation_residual}.`);

  const fundedEvents=find('upkeep_funded');
  if(haveHistory)add('funded','Money in matches the funding events',sum(fundedEvents.map(e=>BigInt(e.data.amount)))===BigInt(ledger.principal_in),
    `${fundedEvents.length} upkeep_funded events add up to ${near(sum(fundedEvents.map(e=>BigInt(e.data.amount))))}; ledger principal_in is ${near(ledger.principal_in)}.`,fundedEvents.map(e=>e.tx));

  const resolved=find('payment_resolved').filter(e=>e.data.success===true);
  const creditPaid=sum(state.credits.map(c=>BigInt(c.paid)));
  add('paid','Payouts on the books = payouts on chain',BigInt(ledger.principal_paid)===creditPaid&&(!haveHistory||sum(resolved.map(e=>BigInt(e.data.amount)))===creditPaid),
    `principal_paid ${near(ledger.principal_paid)}; credits paid ${near(creditPaid)}${haveHistory?`; ${resolved.length} successful payment_resolved events total ${near(sum(resolved.map(e=>BigInt(e.data.amount))))}`:''}.`,resolved.map(e=>e.tx));

  const lastOwner=transfers.at(-1)?.data.new_owner_id??events.find(e=>e.event==='nft_mint')?.data.owner_id;
  add('owner','The NFT holder matches its on-chain transfer history',!haveHistory?asset.owner_id.length>0:asset.owner_id===lastOwner&&BigInt(asset.owner_epoch)===BigInt(transfers.length),
    `nft_token owner = ${asset.owner_id}, owner epoch ${asset.owner_epoch}${haveHistory?`; ${transfers.length} nft_transfer event(s), the last one to ${lastOwner}`:''}.`,transfers.map(t=>t.tx));

  // The asset's identity: the file, its Merkle root and the manifest hash.
  const m=asset.manifest;
  try{
    const {manifest}=await buildArchive(input.file,{title:m.title,filename:m.filename,media_type:m.media_type,license_note:m.license_note});
    const manifestHash=await hashManifest({...m});
    add('content','The archived file matches the on-chain fingerprint',manifest.file_sha256===m.file_sha256&&manifest.merkle_root===m.merkle_root&&manifestHash===m.manifest_sha256&&manifest.manifest_sha256===m.manifest_sha256,
      `${m.filename} (${input.file.length} bytes): SHA-256 ${manifest.file_sha256.slice(0,16)}…, Merkle root ${manifest.merkle_root.slice(0,16)}…, both equal to the values stored in the contract.`);
  }catch(error){add('content','The archived file matches the on-chain fingerprint',false,String(error));}

  if(haveHistory){
    const answers=events.filter(e=>e.method==='submit_response'&&e.event==='sampled_response_accepted');
    const results=await Promise.all(answers.map(e=>verifyProof(m as Manifest,{commitment_id:String(e.args.commitment_id),version_id:'v1',chunk_index:e.args.chunk_index,chunk_base64:e.args.chunk_base64,siblings:e.args.siblings})));
    add('proofs','Every paid answer carries a valid Merkle proof',answers.length>0&&results.every(Boolean),
      `${answers.length} accepted answers re-verified here from their transaction arguments: ${answers.map((e,i)=>`chunk ${e.args.chunk_index} from ${short(e.signer)} ${results[i]?'valid':'INVALID'}`).join(', ')}.`,answers.map(e=>e.tx));
  }

  // The core claim: a handover in the middle of service changes nothing a third party was promised.
  if(haveHistory&&transfers.length){
    const transfer=transfers[0],epochAt=0n;
    const before=state.commitments.filter(c=>BigInt(c.proposed_owner_epoch)===epochAt);
    const earnedAfter=before.filter(c=>c.state==='Earned'&&c.settled_at&&BigInt(c.settled_at)>BigInt(transfer.at));
    const paidTo=(account:string)=>resolved.filter(e=>e.data.creditor===account&&BigInt(e.at)>BigInt(transfer.at));
    const ok=earnedAfter.length>0&&earnedAfter.every(c=>paidTo(c.payee).length>0);
    const proofTxs=earnedAfter.map(c=>events.find(e=>e.event==='sampled_response_accepted'&&String(e.data.commitment_id)===c.commitment_id)?.tx).filter(Boolean) as string[];
    add('handover','Service booked before the handover is still paid after it',ok,
      `${before.length} periods were booked by ${transfer.data.old_owner_id} at epoch 0. The NFT moved to ${transfer.data.new_owner_id} at ${utc(transfer.at)}. ${earnedAfter.length} of them were then answered and paid to their original keepers (${earnedAfter.map(c=>`${short(c.payee)} ${near(c.rate)}`).join(', ')}).`,
      [transfer.tx,...proofTxs,...earnedAfter.flatMap(c=>paidTo(c.payee).slice(0,1).map(e=>e.tx))]);
    const oldOwners=transfers.map(t=>t.data.old_owner_id as string);
    const lateBookings=events.filter(e=>e.event==='period_proposed'&&BigInt(e.at)>BigInt(transfer.at)&&oldOwners.includes(e.signer));
    add('old-owner','The previous holder kept no control',oldOwners.every(o=>state.old_owner_supply[o]==='0')&&lateBookings.length===0,
      `${oldOwners.join(', ')} now holds ${oldOwners.map(o=>state.old_owner_supply[o]).join('/')} tokens; ${lateBookings.length} bookings were made by a former holder after the transfer. Owner methods check predecessor = owner_id and the current owner epoch, and there is no withdrawal method.`);
  }

  const created=creation?.args?.policy?.refund_beneficiary;
  add('refund','Unused money can only go to the fixed refund address',!haveHistory?true:created===asset.policy.refund_beneficiary,
    `Refund address now: ${asset.policy.refund_beneficiary}${haveHistory?`; set at creation: ${created}`:''}. No method changes it, and the caretaker has no withdrawal method.`,creation?[creation.tx]:[]);

  const perKeeper=asset.policy.eligible_providers.map(p=>{
    const earned=sum(state.commitments.filter(c=>c.payee===p&&c.state==='Earned').map(c=>BigInt(c.rate)));
    const credit=state.credits.find(c=>c.kind==='provider'&&c.creditor===p);
    const owed=credit?BigInt(credit.paid)+BigInt(credit.available)+BigInt(credit.pending):0n;
    return {p,earned,owed,missed:state.commitments.filter(c=>c.payee===p&&c.state==='Missed').length,total:state.commitments.filter(c=>c.payee===p).length};
  });
  add('pay-for-proof','Keepers were paid exactly for the periods they proved',perKeeper.every(k=>k.earned===k.owed)&&resolved.every(e=>asset.policy.eligible_providers.includes(e.data.creditor)||e.data.creditor===asset.policy.refund_beneficiary),
    perKeeper.map(k=>`${short(k.p)}: ${k.total-k.missed} of ${k.total} periods proved, owed ${near(k.owed)}${k.missed?`, ${k.missed} missed and unpaid`:''}`).join('; ')+'.');

  const now=BigInt(input.now_ms??Date.now())*1_000_000n,expiry=BigInt(asset.policy.fund_expiry);
  add('funding-open','Anyone can still add upkeep',now<expiry&&!asset.reserve_expired?true:'info',
    now<expiry?`fund_upkeep is open to any account until ${utc(asset.policy.fund_expiry)}.`:`Funding closed at ${utc(asset.policy.fund_expiry)}; the remainder goes to ${asset.policy.refund_beneficiary}.`);
  return checks;
}

export const sha256Hex=sha256;
