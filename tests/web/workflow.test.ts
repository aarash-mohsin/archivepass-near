import test from 'node:test';
import assert from 'node:assert/strict';
import type {Asset,Commitment} from '../../shared/types.ts';
import {boundedBytes,encodeHeader,fileDigest,nextSlot,ownerCanSchedule,safeOrigin,serviceAction,verifyDownload} from '../../web/src/helpers.ts';

const asset={owner_id:'alice.archivepass.testnet',owner_epoch:'0',reserve_expired:false,transfer_call_pending:null,policy:{service_origin:'100',period_duration:'30',fund_expiry:'500'}} as Asset;
const commitment={commitment_id:'0',provider_id:'keeper-a.archivepass.testnet',state:'Proposed',start:'100',end:'130'} as Commitment;

test('handover removes old caretaker controls and provisional custody locks future scheduling',()=>{
  assert.equal(ownerCanSchedule(asset,'alice.archivepass.testnet','100'),true);
  const transferred={...asset,owner_id:'bob.archivepass.testnet',owner_epoch:'1'};
  assert.equal(ownerCanSchedule(transferred,'alice.archivepass.testnet','100'),false);
  assert.equal(ownerCanSchedule(transferred,'bob.archivepass.testnet','100'),true);
  assert.equal(ownerCanSchedule(transferred,'bob.archivepass.testnet','500'),false);
  assert.equal(ownerCanSchedule({...transferred,transfer_call_pending:{operation_id:'1',old_owner:asset.owner_id,receiver_id:transferred.owner_id,started_at:'100'}},transferred.owner_id,'100'),false);
});

test('service controls respect provider consent and the exact deadline boundary',()=>{
  assert.equal(serviceAction(commitment,commitment.provider_id,'99'),'accept');
  assert.equal(serviceAction(commitment,'alice.archivepass.testnet','99'),null);
  assert.equal(serviceAction(commitment,commitment.provider_id,'100'),null);
  assert.equal(serviceAction({...commitment,state:'Accepted'},'alice.archivepass.testnet','100'),'open');
  assert.equal(serviceAction({...commitment,state:'Challenged'},commitment.provider_id,'129'),'respond');
  assert.equal(serviceAction({...commitment,state:'Challenged'},commitment.provider_id,'130'),'expire');
  assert.equal(serviceAction({...commitment,state:'Earned'},commitment.provider_id,'140'),null);
  assert.equal(nextSlot(asset,'99'),'0');assert.equal(nextSlot(asset,'100'),'1');assert.equal(nextSlot(asset,'130'),'2');
});

test('actual full download verification rejects altered and truncated bytes',async()=>{
  const original=new TextEncoder().encode('A real public archive.');
  const digest=await fileDigest(original),expected={size_bytes:String(original.length),file_sha256:digest};
  assert.equal(verifyDownload(expected,original,await fileDigest(original)),true);
  const altered=original.slice();altered[2]^=1;
  assert.equal(verifyDownload(expected,altered,await fileDigest(altered)),false);
  assert.equal(verifyDownload(expected,original.slice(1),digest),false);
});

test('streamed keeper downloads are bounded even when content-length is absent',async()=>{
  let cancelled=false;
  const body=new ReadableStream<Uint8Array>({start(controller){controller.enqueue(new Uint8Array(3));controller.enqueue(new Uint8Array(3));},cancel(){cancelled=true;}});
  await assert.rejects(boundedBytes(new Response(body),5),/exceeds/);
  assert.equal(cancelled,true);
  const actual=await boundedBytes(new Response(new Uint8Array([1,2,3])),3);
  assert.deepEqual([...actual],[1,2,3]);
  await assert.rejects(boundedBytes(new Response(new Uint8Array([1]),{headers:{'content-length':'99'}}),3),/exceeds/);
  await assert.rejects(boundedBytes(new Response('not found',{status:404}),10),/HTTP 404/);
});

test('browser host choices are restricted to configured origins and exclude embedded credentials',()=>{
  const origins=['http://127.0.0.1:8791','http://127.0.0.1:8792'];
  assert.equal(safeOrigin(origins[1],origins),origins[1]);
  assert.throws(()=>safeOrigin('http://127.0.0.1:22',origins),/outside/);
  assert.throws(()=>safeOrigin('http://user:pass@127.0.0.1:8791',origins),/outside/);
  assert.throws(()=>safeOrigin('https://attacker.example',origins),/outside/);
});

test('upload metadata preserves Unicode titles in an ASCII-safe header',()=>{
  const source={title:'共同の記録 · Café',filename:'research.txt',public_distribution_attested:true};
  const header=encodeHeader(source);
  assert.match(header,/^[A-Za-z0-9+/]+=*$/);
  assert.deepEqual(JSON.parse(Buffer.from(header,'base64').toString('utf8')),source);
});
