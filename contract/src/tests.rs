use super::*;
use near_sdk::{testing_env,test_utils::VMContextBuilder,PromiseResult};
use near_sdk::serde_json::Value;
use base64::{Engine,engine::general_purpose::STANDARD};
use std::panic::{catch_unwind,AssertUnwindSafe};

fn account(s:&str)->AccountId{s.parse().unwrap()}
fn context(actor:&str,time:u64,deposit:u128){
    testing_env!(VMContextBuilder::new().current_account_id(account("asset.archivepass.testnet")).predecessor_account_id(account(actor)).signer_account_id(account(actor)).block_timestamp(time*NS_SECOND).random_seed([9;32]).attached_deposit(NearToken::from_yoctonear(deposit)).account_balance(NearToken::from_near(100)).prepaid_gas(Gas::from_tgas(300)).build());
}
fn callback(result:PromiseResult,time:u64){
    let ctx=VMContextBuilder::new().current_account_id(account("asset.archivepass.testnet")).predecessor_account_id(account("asset.archivepass.testnet")).block_timestamp(time*NS_SECOND).account_balance(NearToken::from_near(100)).prepaid_gas(Gas::from_tgas(300)).build();
    testing_env!(ctx,near_sdk::test_vm_config(),near_sdk::RuntimeFeesConfig::test(),std::collections::HashMap::default(),vec![result]);
}
fn fail(f:impl FnOnce()){assert!(catch_unwind(AssertUnwindSafe(f)).is_err());}
fn fixture()->Value{near_sdk::serde_json::from_str(include_str!("../../fixtures/protocol-v1.json")).unwrap()}
fn manifest()->Manifest{near_sdk::serde_json::from_value(fixture()["vectors"][3]["manifest"].clone()).unwrap()}
fn setup()->ArchivePass{
    context("alice.testnet",100,0);
    ArchivePass::new(account("alice.testnet"),manifest(),Policy{service_origin:D64(110*NS_SECOND),period_duration:D64(30*NS_SECOND),max_provider_rate:D128(500),max_slot_spend:D128(1000),fund_expiry:D64(500*NS_SECOND),refund_beneficiary:account("refund.testnet"),eligible_providers:vec![account("keeper-a.testnet"),account("keeper-b.testnet")],max_nonterminal_commitments:16,max_total_commitments:256,max_pending_payouts:8},vec![ProviderConfig{provider_id:account("keeper-a.testnet"),label:"A".into(),endpoint:"http://127.0.0.1:8791".into(),enabled:true},ProviderConfig{provider_id:account("keeper-b.testnet"),label:"B".into(),endpoint:"http://127.0.0.1:8792".into(),enabled:true}],"near-testnet".into(),"archivepass-v1".into())
}
fn fund(c:&mut ArchivePass,amount:u128){context("sponsor.testnet",100,amount);c.fund_upkeep("v1".into());}
fn propose(c:&mut ArchivePass,provider:&str,slot:u64,rate:u128)->Commitment{context("alice.testnet",100,1);c.propose_period(account(provider),D64(slot),D128(rate),D64(0))}
fn accept(c:&mut ArchivePass,id:u64,provider:&str){context(provider,100,0);c.accept_period(D64(id));}
fn answer(c:&mut ArchivePass,id:u64,time:u64)->Commitment{
    let entry=c.commitment(D64(id)).clone();let proof=fixture()["vectors"][3]["proofs"].as_array().unwrap().iter().find(|p|p["chunk_index"].as_u64().unwrap()==entry.challenge.as_ref().unwrap().chunk_index as u64).unwrap().clone();
    context(entry.provider_id.as_str(),time,0);c.submit_response(D64(id),"v1".into(),proof["chunk_index"].as_u64().unwrap() as u32,proof["chunk_base64"].as_str().unwrap().into(),near_sdk::serde_json::from_value(proof["siblings"].clone()).unwrap())
}

#[test]
fn cross_language_manifest_merkle_and_challenge_vectors(){
    let data=fixture();
    for vector in data["vectors"].as_array().unwrap(){
        context("reader.testnet",100,0);let m:Manifest=near_sdk::serde_json::from_value(vector["manifest"].clone()).unwrap();protocol::validate_manifest(&m);
        assert_eq!(protocol::hex(&protocol::encode_manifest(&m)),vector["canonical_manifest_hex"].as_str().unwrap());
        for proof in vector["proofs"].as_array().unwrap(){context("reader.testnet",100,0);let siblings:Vec<String>=near_sdk::serde_json::from_value(proof["siblings"].clone()).unwrap();assert!(protocol::verify_proof(&m,proof["chunk_index"].as_u64().unwrap() as u32,proof["chunk_base64"].as_str().unwrap(),&siblings));}
        for challenge in vector["challenges"].as_array().unwrap(){
            context("reader.testnet",100,0);let i=&challenge["input"];let seed=protocol::unhex(challenge["seed_hex"].as_str().unwrap()).unwrap();let id=i["commitment_id"].as_str().unwrap().parse().unwrap();let slot=i["slot"].as_str().unwrap().parse().unwrap();
            let args=(i["network_domain"].as_str().unwrap(),i["contract_id"].as_str().unwrap(),i["provider_id"].as_str().unwrap(),id,slot,i["merkle_root"].as_str().unwrap());
            assert_eq!(protocol::hex(&protocol::encode_challenge(args.0,args.1,args.2,args.3,args.4,args.5,&seed)),challenge["canonical_hex"].as_str().unwrap());
            let (hash,index)=protocol::select_challenge(args.0,args.1,args.2,args.3,args.4,args.5,&seed,m.chunk_count);assert_eq!(hash,challenge["selection_digest"].as_str().unwrap());assert_eq!(index,challenge["chunk_index"].as_u64().unwrap() as u32);
        }
    }
}
#[test]
fn canonical_decimals_reject_numbers_leading_zeros_overflow(){
    for s in ["0","1","18446744073709551615"]{assert!(near_sdk::serde_json::from_str::<D64>(&format!("\"{s}\"")).is_ok());}
    for raw in ["0","\"01\"","\"-1\"","\"1e2\"","\"18446744073709551616\""]{assert!(near_sdk::serde_json::from_str::<D64>(raw).is_err());}
    assert!(near_sdk::serde_json::from_str::<D128>("\"340282366920938463463374607431768211456\"").is_err());
}
#[test]
fn proof_shape_bytes_padding_and_base64_are_strict(){
    context("reader.testnet",100,0);let m=manifest();let p=fixture()["vectors"][3]["proofs"][2].clone();let index=p["chunk_index"].as_u64().unwrap() as u32;let encoded=p["chunk_base64"].as_str().unwrap();let siblings:Vec<String>=near_sdk::serde_json::from_value(p["siblings"].clone()).unwrap();
    assert!(protocol::verify_proof(&m,index,encoded,&siblings));let mut bad=STANDARD.decode(encoded).unwrap();bad[0]^=1;
    assert!(!protocol::verify_proof(&m,index,&STANDARD.encode(&bad),&siblings));assert!(!protocol::verify_proof(&m,3,encoded,&siblings));assert!(!protocol::verify_proof(&m,index,&format!("{encoded}\n"),&siblings));assert!(!protocol::verify_proof(&m,index,encoded,&siblings[..1]));let mut extra=siblings.clone();extra.push("00".repeat(32));assert!(!protocol::verify_proof(&m,index,encoded,&extra));
}
#[test]
fn handover_preserves_challenge_claim_and_old_owner_loses_authority(){
    let mut c=setup();fund(&mut c,1000);propose(&mut c,"keeper-a.testnet",0,100);accept(&mut c,0,"keeper-a.testnet");context("reader.testnet",110,0);let open=c.open_challenge(D64(0));
    context("alice.testnet",111,1);c.nft_transfer(account("bob.testnet"),TOKEN.into(),None,None);assert_eq!(c.owner_epoch,1);
    context("alice.testnet",111,1);fail(||{c.propose_period(account("keeper-b.testnet"),D64(1),D128(100),D64(0));});
    answer(&mut c,0,112);assert_eq!(c.get_ledger().earned_credit.0,100);assert_eq!(c.commitment(D64(0)).challenge.as_ref().unwrap().selection_digest,open.challenge.unwrap().selection_digest);
    context("bob.testnet",112,1);c.propose_period(account("keeper-b.testnet"),D64(1),D128(100),D64(1));
    context("reader.testnet",113,0);drop(c.claim_provider(account("keeper-a.testnet")));let operation=c.credits[0].pending_operation_id.unwrap();callback(PromiseResult::Successful(vec![]),114);assert!(c.on_payment_result(operation));assert_eq!(c.credits[0].paid.0,100);assert_eq!(c.owner_id,account("bob.testnet"));c.assert_books();
}
#[test]
fn immutable_payees_rates_slots_and_endpoint_snapshots(){
    let mut c=setup();fund(&mut c,1000);let first=propose(&mut c,"keeper-a.testnet",0,100);
    context("alice.testnet",100,1);let mut p=c.providers[0].clone();p.endpoint="https://example.com/new".into();p.enabled=false;c.configure_provider(p,D64(0));assert_eq!(c.commitment(D64(0)).endpoint,first.endpoint);
    context("alice.testnet",100,1);fail(||{c.propose_period(account("keeper-a.testnet"),D64(0),D128(100),D64(0));});
    context("alice.testnet",100,1);fail(||{c.propose_period(account("keeper-b.testnet"),D64(0),D128(501),D64(0));});
    context("alice.testnet",100,1);let mut p=c.providers[1].clone();p.provider_id=account("evil.testnet");fail(||{c.configure_provider(p,D64(0));});
    assert_eq!(c.commitment(D64(0)).payee,account("keeper-a.testnet"));
}
#[test]
fn exact_boundary_no_proof_no_payment_and_expiry_refunds_fixed_beneficiary(){
    let mut c=setup();fund(&mut c,1000);propose(&mut c,"keeper-a.testnet",0,100);accept(&mut c,0,"keeper-a.testnet");context("reader.testnet",110,0);c.open_challenge(D64(0));
    fail(||{answer(&mut c,0,140);});context("reader.testnet",140,0);c.expire_period(D64(0));c.expire_period(D64(0));assert_eq!(c.available,1000);assert_eq!(c.get_ledger().earned_credit.0,0);
    context("reader.testnet",500,0);c.finalize_expiry();c.finalize_expiry();assert_eq!(c.get_ledger().refund_credit.0,1000);assert!(c.reserve_expired);
    drop(c.claim_refund());let attempt=c.payments.last().unwrap().clone();assert_eq!(attempt.creditor,account("refund.testnet"));callback(PromiseResult::Successful(vec![]),501);c.on_payment_result(attempt.operation_id);assert_eq!(c.paid,1000);c.assert_books();
}
#[test]
fn repeated_open_is_stable_and_wrong_provider_or_replay_cannot_earn(){
    let mut c=setup();fund(&mut c,1000);propose(&mut c,"keeper-a.testnet",0,100);accept(&mut c,0,"keeper-a.testnet");context("reader.testnet",110,0);let a=c.open_challenge(D64(0));let b=c.open_challenge(D64(0));assert_eq!(a.challenge.unwrap().selection_digest,b.challenge.unwrap().selection_digest);
    context("evil.testnet",111,0);fail(||{c.submit_response(D64(0),"v1".into(),0,"AA==".into(),vec![]);});answer(&mut c,0,112);fail(||{answer(&mut c,0,113);});assert_eq!(c.get_ledger().earned_credit.0,100);c.assert_books();
}
#[test]
fn payment_failure_restores_exact_credit_new_earnings_survive_pending(){
    let mut c=setup();fund(&mut c,1000);for slot in 0..2{propose(&mut c,"keeper-a.testnet",slot,100);accept(&mut c,slot,"keeper-a.testnet");}
    context("reader.testnet",110,0);c.open_challenge(D64(0));answer(&mut c,0,111);context("reader.testnet",112,0);drop(c.claim_provider(account("keeper-a.testnet")));let op=c.payments.last().unwrap().operation_id;
    context("reader.testnet",140,0);c.open_challenge(D64(1));answer(&mut c,1,141);assert_eq!(c.credits[0].available.0,100);assert_eq!(c.credits[0].pending.0,100);
    context("reader.testnet",142,0);fail(||{drop(c.claim_provider(account("keeper-a.testnet")));});callback(PromiseResult::Failed,143);assert!(!c.on_payment_result(op));assert_eq!(c.credits[0].available.0,200);assert!(!c.on_payment_result(op));assert_eq!(c.credits[0].available.0,200);
    context("reader.testnet",144,0);drop(c.claim_provider(account("keeper-a.testnet")));let next=c.payments.last().unwrap().operation_id;assert!(next.0>op.0);callback(PromiseResult::Successful(vec![]),145);c.on_payment_result(next);assert_eq!(c.paid,200);c.assert_books();
}
#[test]
fn pending_is_not_reset_by_elapsed_time_and_forged_callback_rejected(){
    let mut c=setup();fund(&mut c,1000);propose(&mut c,"keeper-a.testnet",0,100);accept(&mut c,0,"keeper-a.testnet");context("reader.testnet",110,0);c.open_challenge(D64(0));answer(&mut c,0,111);context("reader.testnet",112,0);drop(c.claim_provider(account("keeper-a.testnet")));let op=c.payments.last().unwrap().operation_id;
    context("evil.testnet",1000,0);fail(||{c.on_payment_result(op);});fail(||{drop(c.claim_provider(account("keeper-a.testnet")));});assert_eq!(c.credits[0].pending.0,100);assert_eq!(c.credits[0].available.0,0);
}
fn start_transfer(c:&mut ArchivePass){context("alice.testnet",101,1);drop(c.nft_transfer_call(account("receiver.testnet"),TOKEN.into(),None,None,"keep".into()));}
#[test]
fn transfer_call_keep_return_failure_and_malformed_results(){
    for (result,returns) in [(PromiseResult::Successful(b"false".to_vec()),false),(PromiseResult::Successful(b"true".to_vec()),true),(PromiseResult::Failed,true),(PromiseResult::Successful(b"nonsense".to_vec()),true),(PromiseResult::Successful(vec![0;100]),true)]{
        let mut c=setup();fund(&mut c,1000);start_transfer(&mut c);let lock=c.transfer_call_pending.clone().unwrap();assert_eq!(c.owner_epoch,1);callback(result,102);assert_eq!(c.on_nft_transfer_result(lock.operation_id),!returns);assert_eq!(c.owner_id,account(if returns{"alice.testnet"}else{"receiver.testnet"}));assert_eq!(c.owner_epoch,if returns{2}else{1});assert!(c.transfer_call_pending.is_none());assert!(c.on_nft_transfer_result(lock.operation_id));c.assert_books();
    }
}
#[test]
fn provisional_owner_cannot_spend_and_forwarding_does_not_escape_lock(){
    let mut c=setup();fund(&mut c,1000);start_transfer(&mut c);let lock=c.transfer_call_pending.clone().unwrap();context("receiver.testnet",102,1);
    fail(||{c.propose_period(account("keeper-a.testnet"),D64(0),D128(100),D64(1));});fail(||{drop(c.nft_transfer_call(account("bob.testnet"),TOKEN.into(),None,None,"keep".into()));});
    context("receiver.testnet",102,1);c.nft_transfer(account("bob.testnet"),TOKEN.into(),None,None);context("bob.testnet",103,1);fail(||{c.propose_period(account("keeper-a.testnet"),D64(0),D128(100),D64(2));});
    callback(PromiseResult::Successful(b"true".to_vec()),104);assert!(c.on_nft_transfer_result(lock.operation_id));assert_eq!(c.owner_id,account("bob.testnet"));assert_eq!(c.owner_epoch,2);context("bob.testnet",105,1);c.propose_period(account("keeper-a.testnet"),D64(0),D128(100),D64(2));
}
#[test]
fn transfer_call_lock_does_not_block_existing_provider_or_fixed_claim(){
    let mut c=setup();fund(&mut c,1000);propose(&mut c,"keeper-a.testnet",0,100);accept(&mut c,0,"keeper-a.testnet");start_transfer(&mut c);context("reader.testnet",110,0);c.open_challenge(D64(0));answer(&mut c,0,111);context("reader.testnet",112,0);drop(c.claim_provider(account("keeper-a.testnet")));assert_eq!(c.credits[0].pending.0,100);assert!(c.transfer_call_pending.is_some());
}

#[test]
fn dispatched_provider_payment_survives_ownership_and_both_callback_orders(){
    // These permutations start with an already dispatched payment, rather than
    // only asserting that a claim can be started during provisional ownership.
    for mode in ["ordinary","keep","return","forward"] {
        for paid in [false,true] {
            for payment_first in [false,true] {
                let mut c=setup();fund(&mut c,1000);
                for slot in 0..2 {propose(&mut c,"keeper-a.testnet",slot,100);accept(&mut c,slot,"keeper-a.testnet");}
                context("reader.testnet",110,0);c.open_challenge(D64(0));answer(&mut c,0,111);
                context("reader.testnet",112,0);drop(c.claim_provider(account("keeper-a.testnet")));
                let payment=c.credits[0].pending_operation_id.unwrap();
                let fixed_policy=near_sdk::serde_json::to_value(&c.policy).unwrap();
                let fixed_manifest=c.manifest.manifest_sha256.clone();
                context("alice.testnet",113,1);
                let transfer=if mode=="ordinary" {
                    c.nft_transfer(account("bob.testnet"),TOKEN.into(),None,None);None
                } else {
                    drop(c.nft_transfer_call(account("receiver.testnet"),TOKEN.into(),None,None,mode.into()));
                    Some(c.transfer_call_pending.as_ref().unwrap().operation_id)
                };
                if mode=="forward" {context("receiver.testnet",114,1);c.nft_transfer(account("bob.testnet"),TOKEN.into(),None,None);}
                // Existing obligations may earn more while the first payment
                // and, for transfer-call cases, the ownership result are pending.
                context("reader.testnet",140,0);c.open_challenge(D64(1));answer(&mut c,1,141);
                assert_eq!(c.credits[0].available.0,100);assert_eq!(c.credits[0].pending.0,100);
                let settle_payment=|c:&mut ArchivePass|{
                    callback(if paid{PromiseResult::Successful(vec![])}else{PromiseResult::Failed},142);
                    assert_eq!(c.on_payment_result(payment),paid);
                };
                let settle_transfer=|c:&mut ArchivePass|{
                    if let Some(op)=transfer {
                        callback(PromiseResult::Successful(if mode=="keep"{b"false".to_vec()}else{b"true".to_vec()}),143);
                        c.on_nft_transfer_result(op);
                    }
                };
                if payment_first {settle_payment(&mut c);settle_transfer(&mut c);}else{settle_transfer(&mut c);settle_payment(&mut c);}
                assert_eq!(c.owner_id,account(match mode{"keep"=>"receiver.testnet","return"=>"alice.testnet",_=>"bob.testnet"}));
                assert_eq!(c.owner_epoch,if mode=="return"||mode=="forward"{2}else{1});
                assert!(c.transfer_call_pending.is_none());
                assert_eq!(c.credits[0].creditor,account("keeper-a.testnet"));
                assert_eq!(c.credits[0].available.0,if paid{100}else{200});
                assert_eq!(c.credits[0].pending.0,0);assert_eq!(c.credits[0].paid.0,if paid{100}else{0});
                assert_eq!(c.available,800);assert_eq!(c.manifest.manifest_sha256,fixed_manifest);
                assert_eq!(near_sdk::serde_json::to_value(&c.policy).unwrap(),fixed_policy);
                callback(PromiseResult::Successful(vec![]),144);assert!(!c.on_payment_result(payment));
                if let Some(op)=transfer {assert!(c.on_nft_transfer_result(op));}
                c.assert_books();
            }
        }
    }
}

#[test]
fn provider_and_expiry_refund_pending_payments_keep_payees_across_handover(){
    for provider_success in [false,true] {for refund_success in [false,true] {for refund_first in [false,true] {
        let mut c=setup();fund(&mut c,1000);propose(&mut c,"keeper-a.testnet",0,100);accept(&mut c,0,"keeper-a.testnet");
        context("reader.testnet",110,0);c.open_challenge(D64(0));answer(&mut c,0,111);
        context("reader.testnet",112,0);drop(c.claim_provider(account("keeper-a.testnet")));let provider_op=c.credits[0].pending_operation_id.unwrap();
        context("reader.testnet",500,0);c.finalize_expiry();drop(c.claim_refund());
        let refund_op=c.credits.iter().find(|x|x.kind==CreditKind::Refund).unwrap().pending_operation_id.unwrap();
        context("alice.testnet",501,1);c.nft_transfer(account("bob.testnet"),TOKEN.into(),None,None);
        let order=if refund_first{[(refund_op,refund_success),(provider_op,provider_success)]}else{[(provider_op,provider_success),(refund_op,refund_success)]};
        for (op,success) in order {callback(if success{PromiseResult::Successful(vec![])}else{PromiseResult::Failed},502);assert_eq!(c.on_payment_result(op),success);}
        let provider=&c.credits[0];let refund=c.credits.iter().find(|x|x.kind==CreditKind::Refund).unwrap();
        assert_eq!(provider.creditor,account("keeper-a.testnet"));assert_eq!(refund.creditor,account("refund.testnet"));
        assert_eq!(provider.available.0,if provider_success{0}else{100});assert_eq!(refund.available.0,if refund_success{0}else{900});
        assert_eq!(provider.pending.0,0);assert_eq!(refund.pending.0,0);
        assert_eq!(c.paid,(if provider_success{100}else{0})+(if refund_success{900}else{0}));
        assert_eq!(c.owner_id,account("bob.testnet"));assert_eq!(c.owner_epoch,1);assert!(c.reserve_expired);c.assert_books();
    }}}
}

#[test]
fn insufficient_prepaid_gas_rejects_before_reserving_payment_or_provisional_owner(){
    let mut c=setup();fund(&mut c,1000);propose(&mut c,"keeper-a.testnet",0,100);accept(&mut c,0,"keeper-a.testnet");
    context("reader.testnet",110,0);c.open_challenge(D64(0));answer(&mut c,0,111);
    let low_gas=|actor:&str,deposit:u128,tgas:u64|{testing_env!(VMContextBuilder::new().current_account_id(account("asset.archivepass.testnet")).predecessor_account_id(account(actor)).signer_account_id(account(actor)).block_timestamp(112*NS_SECOND).attached_deposit(NearToken::from_yoctonear(deposit)).account_balance(NearToken::from_near(100)).prepaid_gas(Gas::from_tgas(tgas)).build());};
    let before=near_sdk::borsh::to_vec(&c).unwrap();
    low_gas("reader.testnet",0,119);fail(||{drop(c.claim_provider(account("keeper-a.testnet")));});assert_eq!(near_sdk::borsh::to_vec(&c).unwrap(),before);
    low_gas("alice.testnet",1,174);fail(||{drop(c.nft_transfer_call(account("receiver.testnet"),TOKEN.into(),None,None,"keep".into()));});assert_eq!(near_sdk::borsh::to_vec(&c).unwrap(),before);
    assert_eq!(PAYMENT_CALLBACK_GAS,Gas::from_tgas(50));assert_eq!(NFT_CALLBACK_GAS,Gas::from_tgas(50));
    context("reader.testnet",112,0);drop(c.claim_provider(account("keeper-a.testnet")));assert_eq!(c.credits[0].pending.0,100);c.assert_books();
}
#[test]
fn initialization_and_metadata_enumeration_are_bounded(){
    let c=setup();assert_eq!(c.nft_total_supply().0,1);assert_eq!(c.nft_supply_for_owner(account("alice.testnet")).0,1);assert_eq!(c.nft_supply_for_owner(account("bob.testnet")).0,0);assert_eq!(c.nft_tokens(Some(D128(1)),None).len(),0);assert!(c.nft_token("missing".into()).is_none());assert_eq!(c.nft_token(TOKEN.into()).unwrap()["metadata"]["title"],c.manifest.title);
    let mut m=manifest();m.title="tampered".into();fail(||protocol::validate_manifest(&m));let mut p=c.providers[0].clone();p.endpoint="file:///etc/passwd".into();fail(||protocol::validate_provider(&p));p.endpoint="https://user:password@example.com/".into();fail(||protocol::validate_provider(&p));
    m=manifest();m.title=" \t\u{feff}".into();fail(||protocol::validate_manifest(&m));m=manifest();m.filename="\n ".into();fail(||protocol::validate_manifest(&m));p=c.providers[0].clone();p.label=" \t".into();fail(||protocol::validate_provider(&p));p=c.providers[0].clone();p.endpoint="https://example.com/path#fragment".into();fail(||protocol::validate_provider(&p));
}
#[test]
fn nft_security_deposit_owner_and_approvals_enforced(){
    let mut c=setup();context("alice.testnet",101,0);fail(||c.nft_transfer(account("bob.testnet"),TOKEN.into(),None,None));context("alice.testnet",101,1);fail(||c.nft_transfer(account("bob.testnet"),TOKEN.into(),Some(0),None));context("evil.testnet",101,1);fail(||c.nft_transfer(account("bob.testnet"),TOKEN.into(),None,None));assert_eq!(c.owner_id,account("alice.testnet"));
}
#[test]
fn slot_consent_and_spend_boundaries_prevent_overcommitment(){
    let mut c=setup();fund(&mut c,10000);propose(&mut c,"keeper-a.testnet",0,100);
    context("alice.testnet",100,1);fail(||{c.propose_period(account("keeper-a.testnet"),D64(0),D128(100),D64(0));});
    context("keeper-a.testnet",110,0);fail(||{c.accept_period(D64(0));});
    context("reader.testnet",109,0);fail(||{c.open_challenge(D64(0));});
    for slot in 0..8{for provider in ["keeper-a.testnet","keeper-b.testnet"]{if slot==0 && provider=="keeper-a.testnet"{continue}propose(&mut c,provider,slot,100);}}
    assert_eq!(c.commitments.len(),16);context("alice.testnet",100,1);fail(||{c.propose_period(account("keeper-a.testnet"),D64(8),D128(100),D64(0));});assert_eq!(c.reserved,1600);c.assert_books();
}
#[test]
fn expiry_requires_all_releases_and_never_destroys_earned_credit(){
    let mut c=setup();fund(&mut c,1000);propose(&mut c,"keeper-a.testnet",0,100);propose(&mut c,"keeper-b.testnet",1,100);accept(&mut c,0,"keeper-a.testnet");context("reader.testnet",110,0);c.open_challenge(D64(0));answer(&mut c,0,111);
    context("reader.testnet",500,0);fail(||{c.finalize_expiry();});c.expire_period(D64(1));c.finalize_expiry();assert_eq!(c.get_ledger().earned_credit.0,100);assert_eq!(c.get_ledger().refund_credit.0,900);assert_eq!(c.get_ledger().available_upkeep.0,0);c.assert_books();
    context("sponsor.testnet",500,1);fail(||{c.fund_upkeep("v1".into());});assert_eq!(c.principal_in,1000);
}
#[test]
fn insufficient_operational_balance_cannot_spend_principal_on_storage(){
    let mut c=setup();fund(&mut c,1000);let ctx=VMContextBuilder::new().current_account_id(account("asset.archivepass.testnet")).predecessor_account_id(account("alice.testnet")).block_timestamp(100*NS_SECOND).attached_deposit(NearToken::from_yoctonear(1)).account_balance(NearToken::from_yoctonear(1001)).prepaid_gas(Gas::from_tgas(300)).build();testing_env!(ctx);fail(||{c.propose_period(account("keeper-a.testnet"),D64(0),D128(100),D64(0));});
}
#[test]
fn worst_case_bounded_state_fits_reserved_application_storage(){
    let mut c=setup();fund(&mut c,100000);let mut sample=propose(&mut c,"keeper-a.testnet",0,100);let longest=account(&format!("{}.testnet","a".repeat(56)));sample.provider_id=longest.clone();sample.payee=longest.clone();sample.endpoint=format!("https://{}","a".repeat(248));sample.state=CommitmentState::Missed;sample.missed_reason=Some("no_accepted_response".into());sample.challenge=Some(Challenge{chunk_index:16383,opened_at:D64(u64::MAX),deadline:D64(u64::MAX),selection_digest:"ff".repeat(32)});sample.accepted_at=Some(D64(u64::MAX));sample.settled_at=Some(D64(u64::MAX));
    c.commitments=(0..256).map(|i|{let mut next=sample.clone();next.commitment_id=D64(i);next.slot=D64(i);next}).collect();
    c.providers=(0..8).map(|i|ProviderConfig{provider_id:longest.clone(),label:"x".repeat(80),endpoint:sample.endpoint.clone(),enabled:i%2==0}).collect();
    c.credits=(0..9).map(|i|Credit{kind:if i==8{CreditKind::Refund}else{CreditKind::Provider},creditor:longest.clone(),available:D128(0),pending:D128(0),paid:D128(0),pending_operation_id:None}).collect();
    c.payments=(0..9).map(|i|PaymentAttempt{operation_id:D64(i),kind:CreditKind::Provider,creditor:longest.clone(),amount:D128(u128::MAX),started_at:D64(u64::MAX),status:PaymentStatus::Failed,receipt:None,resolved_at:Some(D64(u64::MAX))}).collect();
    c.transfer_call_pending=Some(TransferLock{operation_id:D64(u64::MAX),old_owner:longest.clone(),receiver_id:longest,started_at:D64(u64::MAX)});
    let bytes=near_sdk::borsh::to_vec(&c).unwrap().len() as u64;println!("worst_case_serialized_application_bytes={bytes};reserved={STATE_BUDGET_BYTES}");assert!(bytes<STATE_BUDGET_BYTES);
}
