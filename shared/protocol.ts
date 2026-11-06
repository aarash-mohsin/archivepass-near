import type {ArchiveMetadata,Manifest,MerkleTree,Proof,ChallengeInput} from './types.ts';
import {parseU64} from './amounts.ts';
export {parseU64,parseU128,parseNear,formatNear} from './amounts.ts';
export const CHUNK_SIZE=1024;
export const MAX_FILE_BYTES=16*1024*1024;
const encoder=new TextEncoder();
export function utf8(value:string):Uint8Array {if(typeof value!=='string'||/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(value))throw new Error('Invalid Unicode string');return encoder.encode(value);}
export function concat(...parts:Uint8Array[]):Uint8Array {const out=new Uint8Array(parts.reduce((n,p)=>n+p.length,0));let cursor=0;for(const p of parts){out.set(p,cursor);cursor+=p.length;}return out;}
export function hex(bytes:Uint8Array):string {return Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');}
export function unhex(value:string):Uint8Array {if(!/^[0-9a-f]{64}$/.test(value))throw new Error('Expected lowercase 32-byte hash');return Uint8Array.from(value.match(/../g)!,b=>parseInt(b,16));}
export function u32(value:number):Uint8Array {if(!Number.isSafeInteger(value)||value<0||value>0xffffffff)throw new Error('u32 overflow');const out=new Uint8Array(4);new DataView(out.buffer).setUint32(0,value,false);return out;}
export function u64(value:string):Uint8Array {const out=new Uint8Array(8);new DataView(out.buffer).setBigUint64(0,parseU64(value),false);return out;}
function lp(value:string):Uint8Array {const bytes=utf8(value);return concat(u32(bytes.length),bytes);}
export async function sha256(bytes:Uint8Array):Promise<string> {return hex(new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256',new Uint8Array(bytes).buffer)));}
export function toBase64(bytes:Uint8Array):string {let raw='';for(let offset=0;offset<bytes.length;offset+=8192)raw+=String.fromCharCode(...bytes.subarray(offset,offset+8192));return btoa(raw);}
export function fromBase64(value:string):Uint8Array {if(typeof value!=='string'||value.length>1400||! /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value))throw new Error('Invalid canonical base64');const raw=atob(value);const out=Uint8Array.from(raw,c=>c.charCodeAt(0));if(toBase64(out)!==value)throw new Error('Invalid canonical base64');return out;}
function validateMetadata(m:ArchiveMetadata):void {for(const [name,max] of [['title',160],['filename',180],['media_type',100],['license_note',240]] as const){const value=m[name];const bytes=utf8(value);if(bytes.length>max||((name==='title'||name==='filename')&&!value.trim()))throw new Error(`Invalid ${name}`);}if(!/^[\x20-\x7e]*$/.test(m.media_type))throw new Error('Invalid media_type');}
export function validateManifest(m:Manifest):void {if(!m||m.schema!=='archivepass-manifest-v1'||m.version_id!=='v1'||m.chunk_size!==1024)throw new Error('Unsupported manifest');validateMetadata(m);const size=parseU64(m.size_bytes);if(size<1n||size>BigInt(MAX_FILE_BYTES)||!Number.isSafeInteger(m.chunk_count)||m.chunk_count!==Math.ceil(Number(size)/CHUNK_SIZE))throw new Error('Invalid manifest size/chunks');unhex(m.file_sha256);unhex(m.merkle_root);unhex(m.manifest_sha256);}
export function encodeManifest(m:Manifest):Uint8Array {validateManifest(m);return concat(utf8('archivepass-manifest-v1\0'),lp(m.version_id),lp(m.title),lp(m.filename),lp(m.media_type),lp(m.license_note),u64(m.size_bytes),u32(m.chunk_size),u32(m.chunk_count),unhex(m.file_sha256),unhex(m.merkle_root));}
export async function hashManifest(m:Manifest):Promise<string>{return sha256(encodeManifest(m));}
async function leaf(index:number,bytes:Uint8Array):Promise<string>{return sha256(concat(new Uint8Array([0]),u32(index),u32(bytes.length),bytes));}
async function parent(left:string,right:string):Promise<string>{return sha256(concat(new Uint8Array([1]),unhex(left),unhex(right)));}
async function boundedHashes(count:number,create:(index:number)=>Promise<string>):Promise<string[]>{
  const values:string[]=[];
  // Bound transient digest inputs and WebCrypto work queues on both runtimes.
  // Complete each batch before admitting another, rather than queuing 16,384
  // independent leaf buffers in one turn at the maximum archive size.
  for(let start=0;start<count;start+=128){
    const end=Math.min(start+128,count);
    values.push(...await Promise.all(Array.from({length:end-start},(_,offset)=>create(start+offset))));
  }
  return values;
}
export async function buildArchive(bytes:Uint8Array,metadata:ArchiveMetadata):Promise<{manifest:Manifest;tree:MerkleTree}>{
  if(!(bytes instanceof Uint8Array)||bytes.length<1||bytes.length>MAX_FILE_BYTES)throw new Error('File must contain 1 byte through 16 MiB');
  validateMetadata(metadata);const count=Math.ceil(bytes.length/CHUNK_SIZE);let padded=1;while(padded<count)padded*=2;
  const leaves=await boundedHashes(padded,i=>i<count?leaf(i,bytes.subarray(i*CHUNK_SIZE,Math.min((i+1)*CHUNK_SIZE,bytes.length))):sha256(concat(new Uint8Array([2]),u32(i))));
  const levels=[leaves];
  while(levels.at(-1)!.length>1){const prior=levels.at(-1)!;levels.push(await boundedHashes(prior.length/2,i=>parent(prior[i*2],prior[i*2+1])));}
  const manifest:Manifest={...metadata,schema:'archivepass-manifest-v1',version_id:'v1',size_bytes:bytes.length.toString(),chunk_size:1024,chunk_count:count,file_sha256:await sha256(bytes),merkle_root:levels.at(-1)![0],manifest_sha256:'0'.repeat(64)};
  manifest.manifest_sha256=await hashManifest(manifest);return {manifest,tree:{levels,chunk_count:count,size_bytes:bytes.length.toString()}};
}
export async function buildProof(tree:MerkleTree,bytes:Uint8Array,index:number,commitment_id:string):Promise<Proof>{parseU64(commitment_id);if(!Number.isSafeInteger(index)||index<0||index>=tree.chunk_count||tree.size_bytes!==bytes.length.toString())throw new Error('Invalid proof index or bytes');const siblings:string[]=[];let cursor=index;for(let level=0;level<tree.levels.length-1;level++){siblings.push(tree.levels[level][cursor^1]);cursor>>=1;}return {commitment_id,version_id:'v1',chunk_index:index,chunk_base64:toBase64(bytes.subarray(index*CHUNK_SIZE,Math.min((index+1)*CHUNK_SIZE,bytes.length))),siblings};}
export async function verifyProof(manifest:Manifest,proof:Proof):Promise<boolean>{try{validateManifest(manifest);parseU64(proof.commitment_id);const index=proof.chunk_index;if(proof.version_id!=='v1'||!Number.isSafeInteger(index)||index<0||index>=manifest.chunk_count||!Array.isArray(proof.siblings))return false;let padded=1,depth=0;while(padded<manifest.chunk_count){padded*=2;depth++;}if(proof.siblings.length!==depth||depth>14)return false;const bytes=fromBase64(proof.chunk_base64);const expected=index===manifest.chunk_count-1?Number(manifest.size_bytes)-index*CHUNK_SIZE:CHUNK_SIZE;if(bytes.length!==expected)return false;let value=await leaf(index,bytes),cursor=index;for(const sibling of proof.siblings){unhex(sibling);value=(cursor&1)?await parent(sibling,value):await parent(value,sibling);cursor>>=1;}return value===manifest.merkle_root;}catch{return false;}}
export function encodeChallenge(input:ChallengeInput,seed:Uint8Array):Uint8Array{if(seed.length!==32||input.version_id!=='v1'||!Number.isSafeInteger(input.chunk_count)||input.chunk_count<1||input.chunk_count>16384)throw new Error('Invalid challenge');if(!['near-testnet','archivepass-local-v1'].includes(input.network_domain))throw new Error('Invalid network domain');return concat(utf8('archivepass-challenge-v1\0'),lp(input.network_domain),lp(input.contract_id),lp(input.version_id),lp(input.provider_id),u64(input.commitment_id),u64(input.slot),unhex(input.merkle_root),seed);}
export async function selectChallenge(input:ChallengeInput,seed:Uint8Array):Promise<{selection_digest:string;chunk_index:number}>{const selection_digest=await sha256(encodeChallenge(input,seed));const first=new DataView(unhex(selection_digest).buffer).getBigUint64(0,false);return {selection_digest,chunk_index:Number(first%BigInt(input.chunk_count))};}
