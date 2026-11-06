// This module loads only freshly generated ArchivePass testnet credentials.
import {existsSync,mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {Account,JsonRpcProvider,KeyPair,KeyPairSigner,actions} from 'near-api-js';
export {KeyPair,actions};
export const RPC='https://test.rpc.fastnear.com';
export const provider=new JsonRpcProvider({url:RPC});
export function record(name,value){mkdirSync('docs',{recursive:true});writeFileSync(`docs/${name}.json`,JSON.stringify(value,null,2)+'\n');}
export async function rpc(method,params){const response=await fetch(RPC,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:'archivepass',method,params}),signal:AbortSignal.timeout(25000)});if(!response.ok)throw new Error(`RPC HTTP ${response.status}`);const result=await response.json();if(result.error)throw new Error(JSON.stringify(result.error));return result.result;}
export async function testnetOnly(){if((await rpc('status',[])).chain_id!=='testnet')throw new Error('Refusing any network except testnet');}
export async function state(account_id){return rpc('query',{request_type:'view_account',account_id,finality:'final'});}
export async function keys(account_id){return rpc('query',{request_type:'view_access_key_list',account_id,finality:'final'});}
export async function view(account_id,method_name,args={}){const value=await rpc('query',{request_type:'call_function',account_id,method_name,args_base64:Buffer.from(JSON.stringify(args)).toString('base64'),finality:'final'});return JSON.parse(Buffer.from(value.result).toString());}
export function credentials(slot){if(!/^[a-z][a-z0-9-]*$/.test(slot))throw new Error('Invalid dedicated credential slot');return JSON.parse(readFileSync(`.secrets/${slot}.json`,'utf8'));}
export function signer(slot){const c=credentials(slot);return new Account(c.accountId,provider,KeyPairSigner.fromSecretKey(c.privateKey));}
export function generated(slot,accountId){mkdirSync('.secrets',{recursive:true});const path=`.secrets/${slot}.json`;if(existsSync(path)){const current=credentials(slot);if(current.accountId!==accountId)throw new Error('Dedicated key/account mismatch');return current;}const key=KeyPair.fromRandom('ed25519');const c={purpose:'ArchivePass dedicated valueless NEAR testnet only',accountId,publicKey:key.getPublicKey().toString(),privateKey:key.toString()};writeFileSync(path,JSON.stringify(c,null,2)+'\n',{flag:'wx',mode:0o600});return c;}
export async function call(account,contractId,methodName,args={},deposit=0n,gas=100_000_000_000_000n){return account.signAndSendTransaction({receiverId:contractId,actions:[actions.functionCall(methodName,Buffer.from(JSON.stringify(args)),gas,deposit)],waitUntil:'FINAL',throwOnFailure:false});}
export function failed(outcome){return !!outcome.status?.Failure||(outcome.receipts_outcome??[]).some(o=>o.outcome?.status?.Failure);}
export function receipt(outcome){return {transaction_hash:outcome.transaction?.hash??null,receipt_ids:(outcome.receipts_outcome??[]).map(o=>o.id),status:outcome.status,outcome};}
export async function createChild(root,slot,amount){const id=`${slot}.${root.accountId}`;const c=generated(slot,id);try{await state(id);}catch(error){if(!String(error.message).includes('UNKNOWN_ACCOUNT'))throw error;const outcome=await root.signAndSendTransaction({receiverId:id,actions:[actions.createAccount(),actions.transfer(amount),actions.addFullAccessKey(KeyPair.fromString(c.privateKey).getPublicKey())],waitUntil:'FINAL'});record(`testnet-create-${slot}`,{accountId:id,...receipt(outcome)});if(failed(outcome))throw new Error(`Dedicated ${slot} creation failed`);}return signer(slot);}
