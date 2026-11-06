// Thin wrapper around near-connect, loaded only when a visitor asks for a wallet.
import type {NearConnector,NearWalletBase} from '@hot-labs/near-connect';
import {RPC_URLS} from '../../shared/live.ts';

let connector:NearConnector|null=null;
async function instance(){
  if(connector)return connector;
  const {NearConnector}=await import('@hot-labs/near-connect');
  connector=new NearConnector({network:'testnet',autoConnect:true,features:{testnet:true},providers:{testnet:RPC_URLS}});
  return connector;
}
export async function connectedAccount():Promise<string>{
  try{const c=await instance();const {accounts}=await c.getConnectedWallet();return accounts[0]?.accountId??'';}catch{return '';}
}
export async function connect():Promise<string>{
  const c=await instance();await c.connect();const {accounts}=await c.getConnectedWallet();
  if(!accounts.length)throw new Error('The wallet did not return an account.');return accounts[0].accountId;
}
export async function disconnect(){const c=await instance();await c.disconnect();}
async function wallet():Promise<NearWalletBase>{const c=await instance();return c.wallet();}
export interface CallSpec {method:string;args:object;deposit:string;gas?:string;}
export async function call(receiverId:string,spec:CallSpec):Promise<string>{
  const w=await wallet();
  const outcome:any=await w.signAndSendTransaction({network:'testnet',receiverId,actions:[{type:'FunctionCall',params:{methodName:spec.method,args:spec.args,gas:spec.gas??'100000000000000',deposit:spec.deposit}}]});
  const failure=outcome?.status?.Failure??outcome?.receipts_outcome?.find((r:any)=>r.outcome?.status?.Failure)?.outcome.status.Failure;
  if(failure)throw new Error(`The transaction failed on chain: ${JSON.stringify(failure).slice(0,300)}`);
  return outcome?.transaction?.hash??outcome?.transaction_outcome?.id??'';
}
export async function signMessage(message:string,recipient:string,nonce:Uint8Array){
  const w=await wallet();return w.signMessage({message,recipient,nonce,network:'testnet'});
}
