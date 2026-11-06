// Historical pre-fix reproductions against the hashes in ASTRA_FINAL_GATE.md.
// The assertions intentionally describe the old failure and should fail after repair.
// Do not run this as part of the current regression suite or overwrite its saved JSON.
// No private keys, chain calls, or existing application data are used.
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {TestnetAdapter,digest,TESTNET_RPC} from '../keeper/testnet-adapter.ts';
import {KeeperService} from '../keeper/service.ts';
const dir=mkdtempSync(join(tmpdir(),'archivepass-final-review-'));
const fixture=JSON.parse(readFileSync(new URL('../fixtures/protocol-v1.json',import.meta.url))).vectors[0];
const P='provider-a.testnet',Q='provider-b.testnet',id=randomUUID();
const policy={service_origin:'100',period_duration:'30',fund_expiry:'1000',max_provider_rate:'10',max_slot_spend:'20',refund_beneficiary:'refund.testnet',eligible_providers:[P,Q],max_nonterminal_commitments:16,max_total_commitments:256,max_pending_payouts:8};
const chain={contract_id:'asset.testnet',network_domain:'near-testnet',protocol_version:'archivepass-v1',token_id:'archive',manifest:fixture.manifest,policy,owner_id:'owner.testnet',owner_epoch:'0',providers:[{provider_id:P,enabled:true}],transfer_call_pending:null,reserve_expired:false,credits:[{kind:'provider',creditor:P,available:'10',pending:'0',paid:'0',pending_operation_id:null}],ledger:{available_upkeep:'10'}};
const binding={network:'testnet',rpc:TESTNET_RPC,contract_id:'asset.testnet',code_hash:'2'.repeat(44),manifest_sha256:fixture.manifest.manifest_sha256,policy_sha256:digest(policy),provider_ids:[P,Q],source_origin:'http://127.0.0.1:8788',source_asset_id:id};
let signs=0,sends=0,lookups=0;
const rpc=async(method,p)=>{
 if(method==='status')return{chain_id:'testnet'};
 if(method==='block')return{header:{hash:'block',timestamp_nanosec:'50'}};
 if(method==='query'){
  if(p.request_type==='view_account')return{code_hash:binding.code_hash};
  if(p.request_type==='view_access_key_list')return{keys:[]};
  return{result:[...Buffer.from(JSON.stringify(p.method_name==='get_asset'?chain:{items:[],next_cursor:null}))]};
 }
 if(method==='tx'){lookups++;throw new Error('UNKNOWN_TRANSACTION');}
 if(method==='send_tx'){sends++;throw new Error('Must not be called by current reconciliation');}
 throw new Error(method);
};
const opts={binding,state_dir:join(dir,'journal'),signer_id:P,rpc,prepareSigned:async()=>{signs++;return{tx_hash:'offline-review-hash',signed_base64:'c2lnbmVk',nonce:'1'};}};
let adapter=new TestnetAdapter(opts);
const request=randomUUID(),command={type:'claim_provider',provider_id:P};
// Exact durable state at the crash boundary after phase update and before send_tx.
adapter.db.prepare('INSERT INTO attempts(request_id,body_hash,command,phase,tx_hash,signed_base64,nonce) VALUES(?,?,?,?,?,?,?)').run(request,digest({contract:binding.contract_id,signer:P,command}),JSON.stringify(command),'Broadcasting','offline-review-hash','c2lnbmVk','1');
adapter.close();adapter=new TestnetAdapter(opts);
await adapter.reconcilePending();
await assert.rejects(()=>adapter.execute(request,command),{code:'TRANSACTION_UNKNOWN'});
await assert.rejects(()=>adapter.execute(randomUUID(),command),{code:'TRANSACTION_UNKNOWN'});
const journal={phase:adapter.publicAttempts()[0].phase,lookups,signs,sends};
adapter.close();
const config={provider_id:P,port:8981,host:'127.0.0.1',data_dir:join(dir,'keeper'),api_origin:binding.source_origin,mode:'testnet',operator_token:'offline-review-token',web_origins:[],poll_interval_ms:5000,dev_faults:false,approved_assets:[id]};
const asset={...chain,asset_id:id,mode:'testnet'};
const transport={api:async()=>asset};
const realFetch=globalThis.fetch;
let keeper=new KeeperService(config,{transport});
try{
 globalThis.fetch=async()=>new Response(Buffer.from(fixture.bytes_base64,'base64'));
 await keeper.importAsset(id);assert.equal((await keeper.assetStatus(id)).status,'Ready');
 await keeper.close();keeper=new KeeperService(config,{transport});
 const before=(await keeper.assetStatus(id)).status;
 globalThis.fetch=async()=>{throw new Error('Original content source offline');};
 await assert.rejects(()=>keeper.importAsset(id),/Original content source offline/);
 const after=(await keeper.assetStatus(id)).status;
 const bytesStillIntact=readFileSync(join(config.data_dir,'blobs',fixture.manifest.file_sha256)).equals(Buffer.from(fixture.bytes_base64,'base64'));
 assert.equal(after,'Failed');assert.equal(bytesStillIntact,true);
 const evidence={scope:'offline source-level crash/restart reproduction; no live execution',journal,sourceRestart:{before,after,bytesStillIntact},temporaryData:dir};
 writeFileSync(new URL('./ASTRA_FINAL_GATE-repro.json',import.meta.url),JSON.stringify(evidence,null,2)+'\n');
 console.log(JSON.stringify(evidence,null,2));
}finally{globalThis.fetch=realFetch;await keeper.close();}
