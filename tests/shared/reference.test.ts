import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {createHash} from 'node:crypto';
import {verifyProof} from '../../shared/protocol.ts';
const vectors=JSON.parse(readFileSync(new URL('../../fixtures/protocol-v1.json',import.meta.url),'utf8')).vectors;
const sha=(value:Uint8Array)=>createHash('sha256').update(value).digest();
const int32=(value:number)=>{const b=Buffer.alloc(4);b.writeUInt32BE(value);return b;};
const text=(value:string)=>{const b=Buffer.from(value,'utf8');return Buffer.concat([int32(b.length),b]);};
test('independent recursive Node-crypto tree and canonical encoder reproduce committed small vectors',()=>{
  for(const v of vectors.filter((v:any)=>Number(v.size_bytes)<=2500)){
    const bytes=Buffer.from(v.bytes_base64,'base64'),count=Math.ceil(bytes.length/1024);let width=1;while(width<count)width*=2;
    function subtree(start:number,size:number):Buffer {if(size===1){if(start>=count)return sha(Buffer.concat([Buffer.from([2]),int32(start)]));const part=bytes.subarray(start*1024,Math.min(bytes.length,(start+1)*1024));return sha(Buffer.concat([Buffer.from([0]),int32(start),int32(part.length),part]));}return sha(Buffer.concat([Buffer.from([1]),subtree(start,size/2),subtree(start+size/2,size/2)]));}
    const root=subtree(0,width);assert.equal(root.toString('hex'),v.manifest.merkle_root);
    const m=v.manifest,size=Buffer.alloc(8);size.writeBigUInt64BE(BigInt(m.size_bytes));
    const canonical=Buffer.concat([Buffer.from('archivepass-manifest-v1\0'),...['version_id','title','filename','media_type','license_note'].map(k=>text(m[k])),size,int32(1024),int32(count),sha(bytes),root]);
    assert.equal(canonical.toString('hex'),v.canonical_manifest_hex);assert.equal(sha(canonical).toString('hex'),m.manifest_sha256);
  }
});
test('all committed proof orientations and maximum depth reject changed bytes, index and path',async()=>{
  for(const v of vectors)for(const proof of v.proofs){
    const changed=Buffer.from(proof.chunk_base64,'base64');changed[0]^=1;
    assert.equal(await verifyProof(v.manifest,{...proof,chunk_base64:changed.toString('base64')}),false);
    assert.equal(await verifyProof(v.manifest,{...proof,chunk_index:v.manifest.chunk_count}),false);
    if(proof.siblings.length){const siblings=[...proof.siblings];siblings[0]=(siblings[0][0]==='0'?'1':'0')+siblings[0].slice(1);assert.equal(await verifyProof(v.manifest,{...proof,siblings}),false);assert.equal(await verifyProof(v.manifest,{...proof,siblings:proof.siblings.slice(1)}),false);}
    assert.equal(await verifyProof(v.manifest,{...proof,siblings:[...proof.siblings,'0'.repeat(64)]}),false);
  }
});
