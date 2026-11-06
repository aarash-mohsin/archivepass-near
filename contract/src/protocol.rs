use near_sdk::{env,require};
use base64::{Engine,engine::general_purpose::STANDARD};
use crate::model::*;

pub const CHUNK_SIZE:u32=1024;
pub const MAX_FILE:u64=16*1024*1024;
pub fn hex(bytes:&[u8])->String {bytes.iter().map(|v|format!("{v:02x}")).collect()}
pub fn unhex(s:&str)->Option<Vec<u8>> {
    if s.len()!=64 || !s.bytes().all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b)){return None}
    (0..32).map(|i|u8::from_str_radix(&s[i*2..i*2+2],16).ok()).collect()
}
fn string(out:&mut Vec<u8>,s:&str){out.extend_from_slice(&(s.len() as u32).to_be_bytes());out.extend_from_slice(s.as_bytes());}
fn nonblank(s:&str)->bool{s.chars().any(|c|!matches!(c,'\u{0009}'..='\u{000d}'|' '| '\u{00a0}'|'\u{1680}'|'\u{2000}'..='\u{200a}'|'\u{2028}'|'\u{2029}'|'\u{202f}'|'\u{205f}'|'\u{3000}'|'\u{feff}'))}
pub fn encode_manifest(m:&Manifest)->Vec<u8>{
    let mut out=b"archivepass-manifest-v1\0".to_vec();
    for s in [&m.version_id,&m.title,&m.filename,&m.media_type,&m.license_note]{string(&mut out,s);}
    out.extend_from_slice(&m.size_bytes.0.to_be_bytes());out.extend_from_slice(&m.chunk_size.to_be_bytes());out.extend_from_slice(&m.chunk_count.to_be_bytes());
    out.extend(unhex(&m.file_sha256).expect("INVALID_FILE_HASH"));out.extend(unhex(&m.merkle_root).expect("INVALID_ROOT"));out
}
pub fn validate_manifest(m:&Manifest){
    require!(m.schema=="archivepass-manifest-v1" && m.version_id=="v1","INVALID_MANIFEST_VERSION");
    require!(nonblank(&m.title) && m.title.len()<=160 && nonblank(&m.filename) && m.filename.len()<=180,"INVALID_MANIFEST_TEXT");
    require!(m.media_type.len()<=100 && m.media_type.is_ascii() && !m.media_type.bytes().any(|b|b.is_ascii_control()),"INVALID_MEDIA_TYPE");
    require!(m.license_note.len()<=240,"INVALID_LICENSE_NOTE");
    require!((1..=MAX_FILE).contains(&m.size_bytes.0) && m.chunk_size==CHUNK_SIZE,"INVALID_FILE_SIZE");
    require!(m.chunk_count==m.size_bytes.0.div_ceil(CHUNK_SIZE as u64) as u32,"INVALID_CHUNK_COUNT");
    require!(unhex(&m.file_sha256).is_some() && unhex(&m.merkle_root).is_some() && unhex(&m.manifest_sha256).is_some(),"INVALID_HASH");
    require!(hex(&env::sha256(&encode_manifest(m)))==m.manifest_sha256,"MANIFEST_HASH_MISMATCH");
}
pub fn verify_proof(m:&Manifest,index:u32,chunk_base64:&str,siblings:&[String])->bool {
    if index>=m.chunk_count || chunk_base64.len()>1368 || siblings.len()>14{return false}
    let Ok(chunk)=STANDARD.decode(chunk_base64) else{return false};
    if STANDARD.encode(&chunk)!=chunk_base64{return false}
    let expected=if index+1==m.chunk_count {m.size_bytes.0-(index as u64)*1024}else{1024};
    if chunk.len() as u64!=expected || siblings.len()!=m.chunk_count.next_power_of_two().trailing_zeros() as usize{return false}
    let mut leaf=vec![0];leaf.extend(index.to_be_bytes());leaf.extend((chunk.len() as u32).to_be_bytes());leaf.extend(chunk);
    let mut hash=env::sha256(&leaf);let mut cursor=index;
    for sibling in siblings {
        let Some(s)=unhex(sibling) else{return false};let mut bytes=vec![1];
        if cursor%2==0 {bytes.extend(&hash);bytes.extend(s);}else{bytes.extend(s);bytes.extend(&hash);}
        hash=env::sha256(&bytes);cursor>>=1;
    }
    hex(&hash)==m.merkle_root
}
pub fn encode_challenge(network:&str,asset:&str,provider:&str,id:u64,slot:u64,root:&str,seed:&[u8])->Vec<u8>{
    require!(seed.len()==32,"INVALID_RANDOM_SEED");
    let mut out=b"archivepass-challenge-v1\0".to_vec();
    for s in [network,asset,"v1",provider]{string(&mut out,s)}
    out.extend(id.to_be_bytes());out.extend(slot.to_be_bytes());out.extend(unhex(root).expect("INVALID_ROOT"));out.extend(seed);out
}
pub fn select_challenge(network:&str,asset:&str,provider:&str,id:u64,slot:u64,root:&str,seed:&[u8],count:u32)->(String,u32){
    let hash=env::sha256(&encode_challenge(network,asset,provider,id,slot,root,seed));
    let index=u64::from_be_bytes(hash[..8].try_into().unwrap())%(count as u64);(hex(&hash),index as u32)
}
pub fn validate_provider(p:&ProviderConfig){
    require!(nonblank(&p.label) && p.label.len()<=80,"INVALID_PROVIDER_LABEL");
    require!(p.endpoint.len()<=256 && p.endpoint.is_ascii() && !p.endpoint.bytes().any(|b|b.is_ascii_control() || b.is_ascii_whitespace() || b==b'\\'),"INVALID_PROVIDER_ENDPOINT");
    let rest=p.endpoint.strip_prefix("http://").or_else(||p.endpoint.strip_prefix("https://")).expect("INVALID_PROVIDER_ENDPOINT");
    let authority=rest.split(['/', '?', '#']).next().unwrap_or("");
    require!(!authority.is_empty() && !authority.contains('@') && !p.endpoint.contains('#'),"INVALID_PROVIDER_ENDPOINT");
}
