// Explicitly approved one-time generated faucet cash transfer. No wallet stores.
import {readFileSync,writeFileSync,existsSync} from 'node:fs';import assert from 'node:assert/strict';
import {KeyPairSigner,actions,baseEncode,baseDecode,createTransaction,encodeTransaction} from 'near-api-js';
const rpcUrl='https://test.rpc.fastnear.com',to='qab-mw3qhtsg-35fb41.testnet',amount=2n*10n**24n;
const receiptPath='docs/RELEASE_WORKERS-spare-gas-transfer.json',signedPath='.secrets/release-worker-spare-transfer-signed.json';
async function rpc(method,params){const r=await fetch(rpcUrl,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:'approved-spare-gas',method,params}),signal:AbortSignal.timeout(30000)});assert.equal(r.ok,true,'RPC HTTP '+r.status);const v=await r.json();if(v.error)throw Error(JSON.stringify(v.error));return v.result;}
const c=JSON.parse(readFileSync('.secrets/release-worker-final-root.json','utf8'));
assert.equal(c.accountId,'apw-mw3re9ta.testnet','Only the dedicated generated final QA root is permitted');
let record=existsSync(receiptPath)?JSON.parse(readFileSync(receiptPath,'utf8')):null;
if(record?.phase==='Final'){console.log(JSON.stringify({preserved:true,hash:record.tx_hash,status:record.outcome.status}));process.exit(0);}
assert.equal((await rpc('status',[])).chain_id,'testnet');
if(!record){
 assert.equal(existsSync(signedPath),false,'Orphan prepared transaction requires manual inspection');
 const before=await rpc('query',{request_type:'view_account',account_id:c.accountId,finality:'final'});assert.ok(BigInt(before.amount)>=amount+3n*10n**23n,'Preserve at least 0.3 NEAR root gas');
 await rpc('query',{request_type:'view_account',account_id:to,finality:'final'});
 const signer=KeyPairSigner.fromSecretKey(c.privateKey),publicKey=await signer.getPublicKey(),block=await rpc('block',{finality:'final'});
 const access=await rpc('query',{request_type:'view_access_key',account_id:c.accountId,public_key:publicKey.toString(),block_id:block.header.hash});assert.equal(access.permission,'FullAccess');
 const tx=createTransaction(c.accountId,publicKey,to,BigInt(access.nonce)+1n,[actions.transfer(amount)],baseDecode(block.header.hash));const signed=await signer.signTransaction(tx);
 const prepared={signed_base64:Buffer.from(encodeTransaction(signed.signedTransaction)).toString('base64'),tx_hash:baseEncode(signed.txHash)};writeFileSync(signedPath,JSON.stringify(prepared)+'\n',{flag:'wx',mode:0o600});
 record={purpose:'Explicit user-approved 2 valueless testnet NEAR from generated ArchivePass QA root for final benchmark',network:'testnet',rpc:rpcUrl,from:c.accountId,to,amount_yocto:String(amount),before,tx_hash:prepared.tx_hash,nonce:String(tx.nonce),prepared_at:new Date().toISOString(),phase:'Prepared'};writeFileSync(receiptPath,JSON.stringify(record,null,2)+'\n',{flag:'wx'});
 record.phase='Broadcasting';writeFileSync(receiptPath,JSON.stringify(record,null,2)+'\n');
 try{record.outcome=await rpc('send_tx',{signed_tx_base64:prepared.signed_base64,wait_until:'FINAL'});}catch(e){record.phase='Unknown';record.error=String(e);writeFileSync(receiptPath,JSON.stringify(record,null,2)+'\n');throw e;}
}else record.outcome=await rpc('tx',{tx_hash:record.tx_hash,sender_account_id:record.from,wait_until:'FINAL'});
assert.equal(record.outcome.final_execution_status,'FINAL');record.phase='Final';record.finalized_at=new Date().toISOString();record.after=await rpc('query',{request_type:'view_account',account_id:record.from,finality:'final'});writeFileSync(receiptPath,JSON.stringify(record,null,2)+'\n');
assert.ok('SuccessValue' in record.outcome.status,'Transfer failed');for(const r of record.outcome.receipts_outcome??[])assert.equal('Failure' in r.outcome.status,false);
console.log(JSON.stringify({from:record.from,to,amount_yocto:String(amount),hash:record.tx_hash,status:record.outcome.status,remaining_root_yocto:record.after.amount}));
