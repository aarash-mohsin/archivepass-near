interface StorageLike {getItem(key:string):string|null;setItem(key:string,value:string):void;}
export interface SavedOperation {key:string;actor:string;path:string;body:unknown;raw:boolean;fingerprint:string;created_at:string;}
function canonical(value:unknown):string {if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';if(value&&typeof value==='object')return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+canonical((value as Record<string,unknown>)[k])).join(',')+'}';return JSON.stringify(value);}
export class OperationJournal {
  private entries:SavedOperation[]=[];
  private storage:StorageLike;
  private name:string;
  error='';
  constructor(storage:StorageLike,name='archivepass.pending-operations.v1'){
    this.storage=storage;this.name=name;
    try{const raw=storage.getItem(name);if(raw){const parsed=JSON.parse(raw);if(!Array.isArray(parsed)||parsed.length>64)throw new Error();for(const e of parsed){if(!e||typeof e.actor!=='string'||typeof e.path!=='string'||typeof e.key!=='string'||! /^[0-9a-f-]{36}$/.test(e.key)||e.fingerprint!==canonical([e.actor,e.path,e.body,e.raw]))throw new Error();}this.entries=parsed;}}
    catch{this.error='Saved request identities cannot be read. Inspect authoritative activity before repairing browser storage; no new request will be sent.';}
  }
  pending(){return this.entries.map(e=>({...e}));}
  reserve(actor:string,path:string,body:unknown,raw=false):SavedOperation {
    if(this.error)throw new Error(this.error);
    const fingerprint=canonical([actor,path,body,raw]);const existing=this.entries.find(e=>e.fingerprint===fingerprint);if(existing)return existing;
    const scope=(e:{actor:string;path:string;body:unknown})=>canonical([e.actor,e.path,(e.body as {command?:{type?:string}})?.command?.type??'']);
    if(this.entries.some(e=>scope(e)===scope({actor,path,body})))throw new Error('An earlier request for this action has an uncertain outcome. Resume its saved request before changing the amount or terms.');
    if(this.entries.length>=64)throw new Error('Resolve earlier unconfirmed requests before starting another.');
    const entry={key:crypto.randomUUID(),actor,path,body,raw,fingerprint,created_at:new Date().toISOString()};const next=[...this.entries,entry];
    try{this.storage.setItem(this.name,JSON.stringify(next));}catch{throw new Error('The request identity could not be saved. No request was sent. Enable browser storage before changing funds.');}
    this.entries=next;return entry;
  }
  complete(entry:SavedOperation){const next=this.entries.filter(e=>e.key!==entry.key);try{this.storage.setItem(this.name,JSON.stringify(next));this.entries=next;}catch{this.error='The response was confirmed, but its browser recovery record could not be retired. Preserve its identity and inspect activity before another request.';}}
}
export async function postMutation<T>(journal:OperationJournal,input:{actor:string;path:string;body:unknown;token:string;headers?:Record<string,string>;raw?:Uint8Array},transport:typeof fetch=fetch):Promise<T>{
  const entry=journal.reserve(input.actor,input.path,input.body,!!input.raw);
  const response=await transport(input.path,{method:'POST',headers:{'Content-Type':input.raw?'application/octet-stream':'application/json',Authorization:'Bearer '+input.token,'X-Request-Id':entry.key,...input.headers},body:input.raw?input.raw.slice().buffer:JSON.stringify(input.body),signal:AbortSignal.timeout(90000)});
  const value=await response.json(); // A broken or lost response remains uncertain.
  if(!response.ok){if(response.status<500&&response.status!==408&&value?.error?.code!=='REQUEST_ID_CONFLICT')journal.complete(entry);throw new Error(value?.error?value.error.code+': '+value.error.message:'Request failed (HTTP '+response.status+').');}
  journal.complete(entry);return value as T;
}
