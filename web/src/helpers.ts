import type { Asset, Commitment } from '../../shared/types.ts';

export const nsNow = () => (BigInt(Date.now()) * 1_000_000n).toString();
export function displayTime(ns:string|null|undefined):string {
  if (!ns) return 'Not recorded';
  const ms = BigInt(ns) / 1_000_000n;
  if (ms > BigInt(Number.MAX_SAFE_INTEGER)) return 'Outside browser date range';
  const date = new Date(Number(ms));
  return Number.isNaN(date.getTime()) ? 'Outside browser date range' : date.toLocaleString([], {dateStyle:'medium',timeStyle:'medium'});
}
export function utcTime(ns:string):string { try { return new Date(Number(BigInt(ns)/1_000_000n)).toISOString(); } catch { return ns+' ns'; } }
export function datetimeInput(ms:number):string { return new Date(ms - new Date(ms).getTimezoneOffset()*60000).toISOString().slice(0,19); }
export function inputNs(value:string):string {
  const ms = new Date(value).getTime();
  if (!Number.isSafeInteger(ms) || ms < 0) throw new Error('Choose a valid date and time.');
  return (BigInt(ms)*1_000_000n).toString();
}
export function nextSlot(asset:Asset, now:string):string {
  const start = BigInt(asset.policy.service_origin), period = BigInt(asset.policy.period_duration), time=BigInt(now);
  return time < start ? '0' : ((time-start)/period+1n).toString();
}
export function serviceAction(c:Commitment, actor:string, now:string):'accept'|'open'|'respond'|'expire'|null {
  if (c.state==='Earned'||c.state==='Missed') return null;
  const n=BigInt(now);
  if(n>=BigInt(c.end)) return 'expire';
  if(c.state==='Proposed'&&n<BigInt(c.start)&&actor===c.provider_id) return 'accept';
  if(c.state==='Accepted'&&n>=BigInt(c.start)) return 'open';
  if(c.state==='Challenged'&&actor===c.provider_id) return 'respond';
  return null;
}
export function ownerCanSchedule(asset:Asset,actor:string,now:string):boolean { return asset.owner_id===actor&&!asset.transfer_call_pending&&!asset.reserve_expired&&BigInt(now)<BigInt(asset.policy.fund_expiry); }
export function encodeHeader(value:unknown):string {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  let binary=''; for(const byte of bytes) binary+=String.fromCharCode(byte);
  return btoa(binary);
}
export async function boundedBytes(response:Response,maxBytes:number):Promise<Uint8Array> {
  if(!response.ok) throw new Error(`Download failed (HTTP ${response.status}).`);
  const advertised=response.headers.get('content-length');
  if(advertised&&(!/^\d+$/.test(advertised)||BigInt(advertised)>BigInt(maxBytes))) throw new Error('Download exceeds the archive size limit.');
  if(!response.body) throw new Error('The host returned no file body.');
  const reader=response.body.getReader(), chunks:Uint8Array[]=[]; let total=0;
  try { while(true){ const {done,value}=await reader.read(); if(done)break;total+=value.byteLength;if(total>maxBytes)throw new Error('Download exceeds the archive size limit.');chunks.push(value); } }
  catch(error){await reader.cancel().catch(()=>{});throw error;}
  const bytes=new Uint8Array(total);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}return bytes;
}
export async function fileDigest(bytes:Uint8Array):Promise<string> {
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes.slice().buffer))).map(x=>x.toString(16).padStart(2,'0')).join('');
}
export function verifyDownload(expected:{size_bytes:string;file_sha256:string},bytes:Uint8Array,actual:string):boolean { return BigInt(bytes.byteLength)===BigInt(expected.size_bytes)&&actual===expected.file_sha256; }
export function safeOrigin(endpoint:string,origins:string[]):string {
  const url=new URL(endpoint);
  if(!origins.includes(url.origin)||url.username||url.password)throw new Error('This host is outside the configured keeper origins.');
  return url.origin;
}
