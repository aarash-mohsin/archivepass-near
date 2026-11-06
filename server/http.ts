import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { Domain, type DomainOptions, type UploadMetadata } from './domain.ts';
import { DomainError, requireRule, uuid } from './errors.ts';
import type { AppConfig } from './config.ts';
import { createTestnetReader } from './testnet.ts';
import {serveStatic} from './static.ts';
import type {KeeperAssetStatus} from '../shared/types.ts';
import {resolve} from 'node:path';
export async function readBody(req: IncomingMessage, max: number): Promise<Buffer> {
  const length=req.headers['content-length']; if(length!==undefined) requireRule(/^(0|[1-9][0-9]*)$/.test(length)&&BigInt(length)<=BigInt(max),'BODY_TOO_LARGE',`Body exceeds ${max} bytes.`,413);
  const chunks: Buffer[]=[]; let size=0;
  for await(const chunk of req) { size+=chunk.length; requireRule(size<=max,'BODY_TOO_LARGE',`Body exceeds ${max} bytes.`,413); chunks.push(Buffer.from(chunk)); }
  return Buffer.concat(chunks);
}
export async function readJson(req: IncomingMessage, max=8192): Promise<any> { requireRule(req.headers['content-type']?.split(';')[0]==='application/json','INVALID_INPUT','Content-Type must be application/json.',400); const bytes=await readBody(req,max); try {const body=JSON.parse(bytes.toString('utf8')); requireRule(body&&typeof body==='object'&&!Array.isArray(body),'INVALID_INPUT','A JSON object is required.',400); return body;} catch(e) {if(e instanceof DomainError)throw e; throw new DomainError('INVALID_INPUT','Malformed JSON.',400);} }
export function sendJson(res: ServerResponse, status: number, value: unknown) {res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(value));}
export function authenticated(req: IncomingMessage, token: string) {const supplied=Buffer.from(req.headers.authorization ?? ''); const expected=Buffer.from(`Bearer ${token}`); requireRule(supplied.length===expected.length&&timingSafeEqual(supplied,expected),'UNAUTHORIZED','A valid local operator token is required.',401);}
export function cors(req: IncomingMessage,res:ServerResponse,origins:string[]) {const origin=req.headers.origin;if(origin){requireRule(origins.includes(origin),'ORIGIN_FORBIDDEN','This browser origin is not allowed.',403);res.setHeader('Access-Control-Allow-Origin',origin);res.setHeader('Vary','Origin');}res.setHeader('Access-Control-Allow-Methods','GET,HEAD,POST,OPTIONS');res.setHeader('Access-Control-Allow-Headers','Authorization,Content-Type,X-Request-Id,X-Archive-Metadata');}
export function sendBytes(res:ServerResponse,bytes:Uint8Array,filename:string) {const safe=filename.replace(/[^a-zA-Z0-9._ -]/g,'_').slice(0,180)||'archive.bin';res.writeHead(200,{'Content-Type':'application/octet-stream','Content-Length':String(bytes.length),'Content-Disposition':`attachment; filename="${safe}"`,'X-Content-Type-Options':'nosniff','Cache-Control':'no-store'});res.end(bytes);}
export function createApplication(config:AppConfig,options:DomainOptions={}) {
  const domain=new Domain(config,options); const rate=new Map<string,{at:number;n:number}>(); const readTestnet=createTestnetReader();
  const server=createServer(async(req,res)=>{
    let requestId:string|null=null;
    try {
      cors(req,res,config.web_origins);if(req.method==='OPTIONS'){res.writeHead(204);res.end();return;}
      const key=req.socket.remoteAddress??'local', now=Date.now(); let count=rate.get(key);if(!count||now-count.at>60_000){count={at:now,n:0};rate.set(key,count);}requireRule(++count.n<=1800,'RATE_LIMITED','Request limit reached. Retry after a minute.',429);
      const url=new URL(req.url??'/',`http://${config.host}:${config.port}`),path=url.pathname;let result:unknown,status=200;
      if(req.method==='POST') {authenticated(req,config.operator_token);requestId=typeof req.headers['x-request-id']==='string'?req.headers['x-request-id']:null;requireRule(uuid(requestId),'INVALID_INPUT','X-Request-Id must be a UUID.',400);}
      const page=(items:unknown[])=>domain.page(items,url.searchParams.get('cursor'),Number(url.searchParams.get('limit')??20));
      if(req.method==='GET'&&path==='/health')result={status:'ok',mode:config.mode,version:'archivepass-v1',now:domain.now()};
      else if(req.method==='GET'&&path==='/api/v1/environment')result=domain.environment();
      else if(req.method==='GET'&&path==='/api/v1/testnet')result=await readTestnet();
      else if(req.method==='POST'&&path==='/api/v1/drafts') {
        requireRule(req.headers['content-type']?.split(';')[0]==='application/octet-stream','INVALID_INPUT','Upload raw application/octet-stream bytes.',400);const header=req.headers['x-archive-metadata'];requireRule(typeof header==='string'&&header.length<=8192&&/^[A-Za-z0-9+/]*={0,2}$/.test(header),'INVALID_INPUT','A bounded base64 metadata header is required.',400);
        let metadata:UploadMetadata;try{metadata=JSON.parse(Buffer.from(header,'base64').toString('utf8'));}catch{throw new DomainError('INVALID_INPUT','Malformed archive metadata.',400);}result=await domain.upload(await readBody(req,16_777_216),metadata,requestId!);status=201;
      } else if(req.method==='POST'&&path==='/api/v1/assets'){result=domain.create(await readJson(req,65_536),requestId!);status=201;}
      else if(req.method==='GET'&&path==='/api/v1/assets')result=domain.list(url.searchParams.get('cursor'),Number(url.searchParams.get('limit')??20));
      else if(req.method==='GET'&&path==='/api/v1/workers')result=await Promise.all(config.keeper_bindings.map(async binding=>{try{const response=await fetch(`${binding.origin}/health`,{signal:AbortSignal.timeout(1500),redirect:'error'});requireRule(response.ok,'KEEPER_UNAVAILABLE','Keeper health failed.',503);return {...binding,last_observed_at:domain.now(),reachable:true,health:await response.json(),error:null};}catch(e){return{...binding,last_observed_at:domain.now(),reachable:false,health:null,error:e instanceof Error?e.message:'Keeper unavailable'};}}));
      else if(path.startsWith('/api/v1/drafts/')&&req.method==='GET') {const match=path.match(/^\/api\/v1\/drafts\/([a-f0-9-]+)$/);requireRule(match,'NOT_FOUND','Route not found.',404);result=domain.draft(match[1]!);}
      else if(path.startsWith('/api/v1/assets/')) {
        const match=path.match(/^\/api\/v1\/assets\/([a-f0-9-]+)(?:\/([a-z-]+))?$/);requireRule(match,'NOT_FOUND','Route not found.',404);const id=match[1]!,action=match[2];
        if(req.method==='GET') {
          if(!action)result=domain.asset(id);
          else if(action==='manifest')result=domain.asset(id).manifest;
          else if(action==='keepers'){domain.asset(id);result=await Promise.all(config.keeper_bindings.map(async binding=>{try{const response=await fetch(`${binding.origin}/archives/${id}/status`,{signal:AbortSignal.timeout(5000),redirect:'error'});requireRule(response.ok,'KEEPER_UNAVAILABLE','Keeper archive status unavailable.',503);const status=await response.json() as KeeperAssetStatus;requireRule(status.asset_id===id&&status.provider_id===binding.provider_id,'KEEPER_UNAVAILABLE','Keeper archive status binding mismatch.',503);return{...status,origin:binding.origin,reachable:true};}catch(error){return{asset_id:id,provider_id:binding.provider_id,origin:binding.origin,reachable:false,status:'Unavailable',manifest_sha256:null,checked_at:null,imported_at:null,serving_enabled:false,worker_enabled:false,next_obligation:null,last_error:error instanceof Error?error.message:'Keeper unavailable'} satisfies KeeperAssetStatus;}}));}
          else if(action==='download'){const file=domain.content(id);sendBytes(res,file.bytes,file.manifest.filename);return;}
          else if(action==='commitments'){let items=domain.commitments(id);const provider=url.searchParams.get('provider_id');if(provider)items=items.filter(c=>c.provider_id===provider);result=page(items);}
          else if(action==='payments')result=page(domain.payments(id).reverse());
          else if(action==='history')result=page(domain.history(id).reverse());
          else if(action==='export')result=domain.export(id);
          else if(action==='transfer-preview')result=domain.preview(id,url.searchParams.get('receiver_id')??'');
          else throw new DomainError('NOT_FOUND','Route not found.',404);
        }else if(req.method==='POST'&&action==='commands')result=await domain.command(id,await readJson(req),requestId!);
        else if(req.method==='POST'&&action==='observations'){result=domain.observe(id,await readJson(req),requestId!);status=201;}
        else throw new DomainError('NOT_FOUND','Route not found.',404);
      } else if(req.method==='POST'&&path==='/api/v1/dev/payments/next-outcome'){domain.setNextOutcome((await readJson(req)).outcome);result={configured:true};}
      else if(req.method==='POST'&&/^\/api\/v1\/dev\/payments\/[0-9]+\/reconcile$/.test(path)){requireRule(config.dev_faults&&config.mode==='local','NOT_FOUND','Development controls are disabled.',404);await readJson(req);result=domain.reconcilePayment(path.split('/')[5]!);}
      else if(serveStatic(req,res,config.static_dir??resolve('dist/web')))return;
      else throw new DomainError('NOT_FOUND','Route not found.',404);
      sendJson(res,status,result);
    }catch(error){const e=error instanceof DomainError?error:new DomainError('INTERNAL_ERROR','The operation could not be completed. Consult the local operator log.',500);if(!(error instanceof DomainError))console.error('ArchivePass request failed:',error);if(!res.headersSent)sendJson(res,e.status,{error:{code:e.code,message:e.message,...(e.details?{details:e.details}:{})},request_id:requestId});else res.end();}
  });
  server.headersTimeout=15_000;server.requestTimeout=30_000;
  let timer:ReturnType<typeof setInterval>|null=null;
  if(config.mode==='local')timer=setInterval(()=>{try{domain.processPayments();domain.processTransferCalls();}catch(error){console.error('ArchivePass recovery worker:',error);}},config.payment_interval_ms);
  timer?.unref();
  return {server,domain,close:async()=>{if(timer)clearInterval(timer);if(server.listening)await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()));domain.close();}};
}
