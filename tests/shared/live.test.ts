// Offline tests for the live verifier and the holder check. They run against the recorded snapshot
// (site/public/snapshot.json), then tamper with it to make sure each check can fail.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {ed25519} from '@noble/curves/ed25519.js';
import {base58,unbase58,codeHashOf,runChecks,EXPECTED_CODE_HASH} from '../../shared/live.ts';
import type {LiveState} from '../../shared/live.ts';
import {nep413Payload} from '../../site/src/nep413.ts';

const snapshot:LiveState=JSON.parse(readFileSync('site/public/snapshot.json','utf8'));
const file=new Uint8Array(readFileSync('fixtures/stewardship-guide.txt'));
const wasm=new Uint8Array(readFileSync('contract/target/near/archivepass.wasm'));
const NOW=Date.UTC(2026,10,10);
const clone=():LiveState=>structuredClone(snapshot);
const run=async(state:LiveState,f=file)=>Object.fromEntries((await runChecks(state,{file:f,wasm,wasm_source:'test',now_ms:NOW})).map(c=>[c.id,c.status]));

test('base58 round-trips and the committed WASM has the deployed code hash',async()=>{
  const bytes=Uint8Array.from([0,0,1,2,255,128]);
  assert.deepEqual(unbase58(base58(bytes)),bytes);
  assert.equal(await codeHashOf(wasm),EXPECTED_CODE_HASH);
});

test('every check passes on the recorded live state',async()=>{
  const result=await run(clone());
  assert.ok(Object.keys(result).length>=14);
  for(const [id,status] of Object.entries(result))assert.equal(status,'PASS',id);
});

test('a key on the asset account fails the keyless check',async()=>{
  const s=clone();s.access_keys=[{public_key:'ed25519:x',access_key:{permission:'FullAccess'}}];
  assert.equal((await run(s)).keyless,'FAIL');
});

test('a different deployed code hash fails the code check',async()=>{
  const s=clone();s.code_hash='11111111111111111111111111111111';
  assert.equal((await run(s)).code,'FAIL');
});

test('a changed file fails the content check',async()=>{
  const changed=file.slice();changed[10]^=1;
  assert.equal((await run(clone(),changed)).content,'FAIL');
});

test('a forged Merkle proof in a transaction fails the proof check',async()=>{
  const s=clone();const answer=s.events.find(e=>e.method==='submit_response')!;
  answer.args.siblings=[...answer.args.siblings];answer.args.siblings[0]='0'.repeat(64);
  assert.equal((await run(s)).proofs,'FAIL');
});

test('an unpaid pre-handover period fails the handover check',async()=>{
  const s=clone();s.events=s.events.filter(e=>!(e.event==='payment_resolved'&&e.data.creditor==='a.apw-mw4fsdcz.testnet'));
  const result=await run(s);
  assert.equal(result.handover,'FAIL');assert.equal(result.paid,'FAIL');
});

test('a booking by the former holder after the handover fails the old-owner check',async()=>{
  const s=clone();const transfer=s.events.find(e=>e.event==='nft_transfer')!;
  const booking=structuredClone(s.events.find(e=>e.event==='period_proposed')!);
  booking.signer=transfer.data.old_owner_id;booking.at=(BigInt(transfer.at)+1n).toString();booking.block=transfer.block+1;
  s.events.push(booking);
  assert.equal((await run(s))['old-owner'],'FAIL');
});

test('a changed refund address fails the refund check',async()=>{
  const s=clone();s.asset.policy.refund_beneficiary='someone-else.testnet';
  assert.equal((await run(s)).refund,'FAIL');
});

test('books that do not balance fail',async()=>{
  const s=clone();s.asset.ledger.available_upkeep=(BigInt(s.asset.ledger.available_upkeep)+1n).toString();
  assert.equal((await run(s)).books,'FAIL');
});

test('a keeper paid for a missed period fails the pay-for-proof check',async()=>{
  const s=clone();const credit=s.credits.find(c=>c.creditor==='a.apw-mw4fsdcz.testnet')!;
  credit.paid=(BigInt(credit.paid)+1_000_000_000_000_000_000_000n).toString();
  assert.equal((await run(s))['pay-for-proof'],'FAIL');
});

test('NEP-413 payload: a wallet signature verifies, and any change to the message breaks it',async()=>{
  const secret=ed25519.utils.randomSecretKey(),pub=ed25519.getPublicKey(secret);
  const nonce=new Uint8Array(32).fill(7);
  const digest=async(m:string)=>new Uint8Array(await crypto.subtle.digest('SHA-256',nep413Payload(m,nonce,'archivepass-holder-console')));
  const signature=ed25519.sign(await digest('hello'),secret);
  assert.ok(ed25519.verify(signature,await digest('hello'),pub));
  assert.ok(!ed25519.verify(signature,await digest('hellO'),pub));
  // The NEP-413 tag 2^31 + 413 is the first four bytes, little-endian.
  assert.deepEqual([...nep413Payload('x',nonce,'r').slice(0,4)],[0x9d,0x01,0x00,0x80]);
});
