import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import type { ChainAsset } from '../shared/types.ts';
import { DomainError, account, nowNs, requireRule } from './errors.ts';

const RPC='https://test.rpc.fastnear.com';
export interface TestnetSnapshot {
  network:'testnet';rpc:string;contract_id:string;observed_at:string;code_hash:string;
  code_hash_matches:boolean;key_status:'verified_keyless'|'retained'|'unknown';access_key_count:number;
  asset:ChainAsset;source:'live-rpc';signing:'documented-cli';http_keepers:'localhost';evidence_path:'docs/testnet-scenario.json'|'docs/RELEASE_WORKERS-final-evidence.json';
}
interface ReaderOptions {config_path?:string;fetcher?:typeof fetch;clock?:()=>bigint;}
/** Fixed public testnet source only. No caller-supplied network, contract or RPC URL. */
export function createTestnetReader(options:ReaderOptions={}) {
  const configPath=options.config_path??fileURLToPath(new URL('../docs/testnet-config.json',import.meta.url));
  const fetcher=options.fetcher??fetch,clock=options.clock??nowNs;
  let cache:{binding:string;expires:bigint;value:TestnetSnapshot}|null=null;
  let inflight:{binding:string;promise:Promise<TestnetSnapshot>}|null=null;
  async function rpc(method:string,params:unknown):Promise<any>{
    const response=await fetcher(RPC,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:randomUUID(),method,params}),signal:AbortSignal.timeout(8000),redirect:'error'});
    requireRule(response.ok,'RPC_UNAVAILABLE','The fixed NEAR testnet RPC is unavailable.',503);
    const decoded=await response.json() as any;requireRule(decoded&&decoded.result!==undefined&&!decoded.error,'RPC_UNAVAILABLE','The fixed NEAR testnet RPC returned an error.',503);return decoded.result;
  }
  return async():Promise<TestnetSnapshot>=>{
    let config:any;try{config=JSON.parse(readFileSync(configPath,'utf8'));}catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')throw new DomainError('NOT_FOUND','No recorded ArchivePass testnet deployment is configured.',404);throw new DomainError('TESTNET_CONFIG_INVALID','The recorded testnet deployment cannot be read.',503);}
    requireRule(config.network==='testnet'&&config.rpc===RPC&&typeof config.code_hash==='string'&&config.code_hash.length>0,'TESTNET_CONFIG_INVALID','The deployment configuration does not match the fixed public testnet source.',503);
    try{account(config.asset_id);}catch{throw new DomainError('TESTNET_CONFIG_INVALID','The deployment account is invalid.',503);}
    const contract_id=config.asset_id as string,binding=`${contract_id}:${config.code_hash}`;
    if(cache?.binding===binding&&clock()<cache.expires)return cache.value;
    if(inflight?.binding===binding)return inflight.promise;
    const promise=(async()=>{
      try{
        const status=await rpc('status',[]);requireRule(status.chain_id==='testnet','NETWORK_MISMATCH','RPC did not identify itself as NEAR testnet.',503);
        const query=(request_type:string,extra:Record<string,unknown>={})=>rpc('query',{request_type,finality:'final',account_id:contract_id,...extra});
        const [state,keys,call]=await Promise.all([query('view_account'),query('view_access_key_list'),query('call_function',{method_name:'get_asset',args_base64:'e30='})]);
        requireRule(typeof state.code_hash==='string'&&Array.isArray(keys.keys)&&Array.isArray(call.result)&&call.result.length<=262144&&call.result.every((n:unknown)=>Number.isInteger(n)&&Number(n)>=0&&Number(n)<=255),'RPC_UNAVAILABLE','RPC returned malformed account, key or contract data.',503);
        let asset:ChainAsset;try{asset=JSON.parse(Buffer.from(call.result).toString('utf8'));}catch{throw new DomainError('RPC_UNAVAILABLE','The contract returned invalid asset JSON.',503);}
        requireRule(asset&&asset.contract_id===contract_id&&asset.network_domain==='near-testnet'&&asset.token_id==='archive'&&asset.protocol_version==='archivepass-v1','RPC_UNAVAILABLE','The live contract response does not match this ArchivePass binding.',503);
        const code_hash_matches=state.code_hash===config.code_hash,access_key_count=keys.keys.length;
        const value:TestnetSnapshot={network:'testnet',rpc:RPC,contract_id,observed_at:clock().toString(),code_hash:state.code_hash,code_hash_matches,key_status:access_key_count>0?'retained':code_hash_matches?'verified_keyless':'unknown',access_key_count,asset,source:'live-rpc',signing:'documented-cli',http_keepers:'localhost',evidence_path:config.evidence_path==='docs/RELEASE_WORKERS-final-evidence.json'?config.evidence_path:'docs/testnet-scenario.json'};
        cache={binding,expires:clock()+10_000_000_000n,value};return value;
      }catch(error){if(error instanceof DomainError)throw error;throw new DomainError('RPC_UNAVAILABLE','Live NEAR testnet state could not be retrieved. No local-ledger fallback was used.',503);}
    })();
    inflight={binding,promise};try{return await promise;}finally{if(inflight?.promise===promise)inflight=null;}
  };
}
