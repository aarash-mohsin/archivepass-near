// NEP-413 signed-message check: proves the connected wallet controls a full-access key of the account
// it names. The NFT owner is then read from the contract. Nothing here is trusted from the wallet alone.
import {ed25519} from '@noble/curves/ed25519.js';
import {rpc,unbase58,view,ASSET_ID} from '../../shared/live.ts';

const TAG=2147484061;// 2^31 + 413
const enc=new TextEncoder();
function u32le(n:number){const b=new Uint8Array(4);new DataView(b.buffer).setUint32(0,n,true);return b;}
function str(s:string){const bytes=enc.encode(s);return [u32le(bytes.length),bytes];}
function concat(parts:Uint8Array[]){const out=new Uint8Array(parts.reduce((n,p)=>n+p.length,0));let i=0;for(const p of parts){out.set(p,i);i+=p.length;}return out;}
export function nep413Payload(message:string,nonce:Uint8Array,recipient:string,callbackUrl?:string){
  return concat([u32le(TAG),...str(message),nonce,...str(recipient),...(callbackUrl?[new Uint8Array([1]),...str(callbackUrl)]:[new Uint8Array([0])])]);
}
function decodeSignature(value:string):Uint8Array{
  const raw=value.startsWith('ed25519:')?value.slice(8):value;
  try{const b=Uint8Array.from(atob(raw),c=>c.charCodeAt(0));if(b.length===64)return b;}catch{/* not base64 */}
  const b=unbase58(raw);if(b.length===64)return b;throw new Error('Unrecognised signature encoding');
}
export interface HolderProof {account:string;public_key:string;signature_valid:boolean;full_access:boolean;owner:string;owner_epoch:string;is_holder:boolean;message:string;}
export const RECIPIENT='archivepass-holder-console';
export function holderMessage(account:string,now=new Date()){return `ArchivePass holder console\nAsset: ${ASSET_ID}\nAccount: ${account}\nTime: ${now.toISOString()}`;}

export async function checkHolder(signed:{accountId:string;publicKey:string;signature:string},message:string,nonce:Uint8Array):Promise<HolderProof>{
  const payload=nep413Payload(message,nonce,RECIPIENT);
  const digest=new Uint8Array(await crypto.subtle.digest('SHA-256',payload));
  const pub=unbase58(signed.publicKey.replace(/^ed25519:/,''));
  let signature_valid=false;try{signature_valid=pub.length===32&&ed25519.verify(decodeSignature(signed.signature),digest,pub);}catch{signature_valid=false;}
  let full_access=false;
  try{const key=await rpc('query',{request_type:'view_access_key',finality:'final',account_id:signed.accountId,public_key:signed.publicKey});full_access=key.permission==='FullAccess';}catch{full_access=false;}
  const asset=await view<{owner_id:string;owner_epoch:string}>('get_asset');
  return {account:signed.accountId,public_key:signed.publicKey,signature_valid,full_access,owner:asset.owner_id,owner_epoch:asset.owner_epoch,is_holder:signature_valid&&full_access&&asset.owner_id===signed.accountId,message};
}
