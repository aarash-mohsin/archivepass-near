import {mkdirSync,writeFileSync} from 'node:fs';
import {buildArchive,buildProof,encodeManifest,encodeChallenge,selectChallenge,hex,toBase64} from '../shared/protocol.ts';
const vectors=[];
for(const size of [1,1024,1025,2500,16777216]){
 const bytes=Uint8Array.from({length:size},(_,i)=>i%251);
 const metadata={title:`ArchivePass vector ${size}`,filename:`vector-${size}.bin`,media_type:'application/octet-stream',license_note:'CC0-1.0'};
 const {manifest,tree}=await buildArchive(bytes,metadata);
 const indices=manifest.chunk_count<=3?Array.from({length:manifest.chunk_count},(_,i)=>i):[0,Math.floor(manifest.chunk_count/2),manifest.chunk_count-1];
 const proofs=await Promise.all(indices.map(i=>buildProof(tree,bytes,i,'7')));
 const challenges=[];
 for(const network_domain of ['archivepass-local-v1','near-testnet']){
  const input={network_domain,contract_id:network_domain==='near-testnet'?'archive.example.testnet':'local:00000000-0000-4000-8000-000000000001',version_id:'v1',provider_id:'keeper-a.testnet',commitment_id:'7',slot:'3',merkle_root:manifest.merkle_root,chunk_count:manifest.chunk_count};
  const seed=Uint8Array.from({length:32},(_,i)=>i);
  challenges.push({input,seed_hex:hex(seed),canonical_hex:hex(encodeChallenge(input,seed)),...await selectChallenge(input,seed)});
 }
 vectors.push({size_bytes:String(size),generator:'byte[i] = i mod 251',bytes_base64:size<=2500?toBase64(bytes):null,manifest,canonical_manifest_hex:hex(encodeManifest(manifest)),proofs,challenges});
}
mkdirSync('fixtures',{recursive:true});
writeFileSync('fixtures/protocol-v1.json',JSON.stringify({schema:'archivepass-fixtures-v1',vectors},null,2)+'\n');
console.log('Wrote five protocol vectors including 16 MiB boundary.');
