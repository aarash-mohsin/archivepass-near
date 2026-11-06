mod model;
pub mod protocol;
pub use model::*;
use near_sdk::{near,env,require,ext_contract,AccountId,Gas,NearToken,PanicOnDefault,Promise,PromiseOrValue};
use near_sdk::serde_json::{json,Value};

const STATE_BUDGET_BYTES:u64=260_000;
const NS_SECOND:u64=1_000_000_000;
const TOKEN:&str="archive";
const PAYMENT_CALLBACK_GAS:Gas=Gas::from_tgas(50);
const NFT_CALLBACK_GAS:Gas=Gas::from_tgas(50);
fn add(a:u128,b:u128)->u128{a.checked_add(b).expect("AMOUNT_OVERFLOW")}
fn sub(a:u128,b:u128)->u128{a.checked_sub(b).expect("ACCOUNTING_UNDERFLOW")}
fn inc(a:u64)->u64{a.checked_add(1).expect("COUNTER_OVERFLOW")}
fn no_deposit(){require!(env::attached_deposit().is_zero(),"UNEXPECTED_DEPOSIT")}

#[ext_contract(ext_receiver)]
#[allow(dead_code)]
trait Receiver {fn nft_on_transfer(&mut self,sender_id:AccountId,previous_owner_id:AccountId,token_id:String,msg:String)->PromiseOrValue<bool>;}
#[ext_contract(ext_self)]
#[allow(dead_code)]
trait Callback {fn on_payment_result(&mut self,operation_id:D64)->bool;fn on_nft_transfer_result(&mut self,operation_id:D64)->bool;}

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct ArchivePass {
    manifest:Manifest,policy:Policy,providers:Vec<ProviderConfig>,network_domain:String,
    owner_id:AccountId,owner_epoch:u64,created_at:u64,transfer_call_pending:Option<TransferLock>,
    next_transfer:u64,reserve_expired:bool,commitments:Vec<Commitment>,credits:Vec<Credit>,
    payments:Vec<PaymentAttempt>,next_payment:u64,principal_in:u128,available:u128,reserved:u128,
    paid:u128,operations_funded:u128,security_deposits:u128,storage_budget_bytes:u64,
}

#[near]
impl ArchivePass {
    #[init]
    pub fn new(owner_id:AccountId,manifest:Manifest,policy:Policy,providers:Vec<ProviderConfig>,network_domain:String,protocol_version:String)->Self {
        no_deposit();protocol::validate_manifest(&manifest);
        require!(network_domain=="near-testnet" && protocol_version=="archivepass-v1","INVALID_PROTOCOL_DOMAIN");
        require!((2..=8).contains(&policy.eligible_providers.len()),"INVALID_PROVIDER_ALLOWLIST");
        require!(policy.eligible_providers.iter().enumerate().all(|(i,p)|!policy.eligible_providers[..i].contains(p)),"DUPLICATE_PROVIDER");
        require!(policy.max_nonterminal_commitments==16 && policy.max_total_commitments==256 && policy.max_pending_payouts==8,"INVALID_PROTOCOL_BOUNDS");
        require!((30*NS_SECOND..=30*24*3600*NS_SECOND).contains(&policy.period_duration.0),"INVALID_PERIOD_DURATION");
        require!(policy.service_origin.0>env::block_timestamp(),"ORIGIN_NOT_FUTURE");
        require!(policy.service_origin.0.checked_add(policy.period_duration.0).expect("TIME_OVERFLOW")<=policy.fund_expiry.0,"INVALID_EXPIRY");
        require!(policy.max_provider_rate.0>0 && policy.max_slot_spend.0>=policy.max_provider_rate.0,"INVALID_SPENDING_CAP");
        require!(providers.len()==policy.eligible_providers.len(),"PROVIDER_CONFIGURATION_REQUIRED");
        for (i,p) in providers.iter().enumerate(){
            require!(policy.eligible_providers.contains(&p.provider_id) && !providers[..i].iter().any(|q|q.provider_id==p.provider_id),"INVALID_PROVIDER_CONFIG");protocol::validate_provider(p);
        }
        let mut credits=policy.eligible_providers.iter().map(|p|Credit{kind:CreditKind::Provider,creditor:p.clone(),available:D128(0),pending:D128(0),paid:D128(0),pending_operation_id:None}).collect::<Vec<_>>();
        credits.push(Credit{kind:CreditKind::Refund,creditor:policy.refund_beneficiary.clone(),available:D128(0),pending:D128(0),paid:D128(0),pending_operation_id:None});
        let value=Self{manifest,policy,providers,network_domain,owner_id,owner_epoch:0,created_at:env::block_timestamp(),transfer_call_pending:None,next_transfer:1,reserve_expired:false,commitments:vec![],credits,payments:vec![],next_payment:1,principal_in:0,available:0,reserved:0,paid:0,operations_funded:env::account_balance().as_yoctonear(),security_deposits:0,storage_budget_bytes:env::storage_usage().checked_add(STATE_BUDGET_BYTES).expect("STORAGE_OVERFLOW")};
        value.assert_headroom();value.assert_books();value.event("asset_created",json!({"owner_id":value.owner_id,"manifest_sha256":value.manifest.manifest_sha256}));
        env::log_str(&format!("EVENT_JSON:{}",json!({"standard":"nep171","version":"1.0.0","event":"nft_mint","data":[{"owner_id":value.owner_id,"token_ids":[TOKEN]}]})));value
    }
    pub fn get_asset(&self)->ChainAsset {
        ChainAsset{network_domain:self.network_domain.clone(),contract_id:env::current_account_id(),token_id:TOKEN.into(),protocol_version:"archivepass-v1".into(),manifest:self.manifest.clone(),policy:self.policy.clone(),owner_id:self.owner_id.clone(),owner_epoch:D64(self.owner_epoch),transfer_call_pending:self.transfer_call_pending.clone(),reserve_expired:self.reserve_expired,providers:self.providers.clone(),ledger:self.get_ledger(),credits:self.credits.clone(),created_at:D64(self.created_at)}
    }
    pub fn get_manifest(&self)->Manifest{self.manifest.clone()}
    pub fn get_policy(&self)->Policy{self.policy.clone()}
    pub fn get_credits(&self)->Vec<Credit>{self.credits.clone()}
    pub fn get_ledger(&self)->Ledger {
        let earned=self.credits.iter().filter(|c|c.kind==CreditKind::Provider).fold(0,|s,c|add(s,c.available.0));
        let refund=self.credits.iter().filter(|c|c.kind==CreditKind::Refund).fold(0,|s,c|add(s,c.available.0));
        let pending=self.credits.iter().fold(0,|s,c|add(s,c.pending.0));
        let total=add(add(add(add(add(self.available,self.reserved),earned),refund),pending),self.paid);
        require!(self.principal_in==total,"ACCOUNTING_INTEGRITY");
        Ledger{principal_in:D128(self.principal_in),available_upkeep:D128(self.available),reserved_upkeep:D128(self.reserved),earned_credit:D128(earned),refund_credit:D128(refund),pending_payments:D128(pending),principal_paid:D128(self.paid),conservation_residual:D128(0),operations_funded:D128(self.operations_funded),security_deposits:D128(self.security_deposits)}
    }
    pub fn get_commitments(&self,from_index:D64,limit:u32)->Page<Commitment>{page(&self.commitments,from_index.0,limit)}
    pub fn get_payments(&self,from_index:D64,limit:u32)->Page<PaymentAttempt>{page(&self.payments,from_index.0,limit)}
    pub fn get_storage_quote(&self)->Value {
        json!({"storage_budget_bytes":self.storage_budget_bytes.to_string(),"future_state_budget_bytes":STATE_BUDGET_BYTES.to_string(),"required_operational_yocto":self.storage_cost().to_string(),"actual_storage_usage":env::storage_usage().to_string(),"serialized_application_bytes":near_sdk::borsh::to_vec(self).unwrap().len().to_string()})
    }
    #[payable]
    pub fn fund_upkeep(&mut self,version_id:String)->Ledger {
        require!(version_id=="v1","INVALID_VERSION");require!(!self.reserve_expired && env::block_timestamp()<self.policy.fund_expiry.0,"FUNDING_CLOSED");
        let amount=env::attached_deposit().as_yoctonear();require!(amount>0,"POSITIVE_DEPOSIT_REQUIRED");
        self.principal_in=add(self.principal_in,amount);self.available=add(self.available,amount);self.finish();self.event("upkeep_funded",json!({"amount":amount.to_string(),"refund_beneficiary":self.policy.refund_beneficiary,"fund_expiry":self.policy.fund_expiry}));self.get_ledger()
    }
    #[payable]
    pub fn fund_operations(&mut self)->Ledger {
        let amount=env::attached_deposit().as_yoctonear();require!(amount>0,"POSITIVE_DEPOSIT_REQUIRED");self.operations_funded=add(self.operations_funded,amount);self.finish();self.event("operations_funded",json!({"amount":amount.to_string()}));self.get_ledger()
    }
    #[payable]
    pub fn configure_provider(&mut self,provider:ProviderConfig,expected_owner_epoch:D64)->ProviderConfig {
        self.owner_action(expected_owner_epoch,true);protocol::validate_provider(&provider);
        let index=self.providers.iter().position(|p|p.provider_id==provider.provider_id).expect("PROVIDER_NOT_ELIGIBLE");
        self.providers[index]=provider.clone();self.finish();self.event("provider_configured",json!({"provider":provider}));provider
    }
    #[payable]
    pub fn propose_period(&mut self,provider_id:AccountId,slot:D64,rate:D128,expected_owner_epoch:D64)->Commitment {
        self.owner_action(expected_owner_epoch,true);
        require!(!self.reserve_expired && env::block_timestamp()<self.policy.fund_expiry.0,"FUNDING_CLOSED");
        require!(self.commitments.len()<256 && self.commitments.iter().filter(|c|!c.terminal()).count()<16,"CAPACITY_REACHED");
        let provider=self.providers.iter().find(|p|p.provider_id==provider_id && p.enabled).expect("PROVIDER_NOT_ENABLED");
        require!(rate.0>0 && rate.0<=self.policy.max_provider_rate.0,"INVALID_RATE");
        require!(!self.commitments.iter().any(|c|c.provider_id==provider_id && c.slot==slot),"SLOT_ALREADY_USED");
        let start=self.policy.service_origin.0.checked_add(slot.0.checked_mul(self.policy.period_duration.0).expect("TIME_OVERFLOW")).expect("TIME_OVERFLOW");
        let end=start.checked_add(self.policy.period_duration.0).expect("TIME_OVERFLOW");
        require!(env::block_timestamp()<start && end<=self.policy.fund_expiry.0,"INVALID_SLOT_WINDOW");
        let slot_total=self.commitments.iter().filter(|c|c.slot==slot).fold(rate.0,|sum,c|add(sum,c.rate.0));require!(slot_total<=self.policy.max_slot_spend.0,"SLOT_SPEND_CAP");
        require!(self.available>=rate.0,"INSUFFICIENT_UPKEEP");
        let commitment=Commitment{commitment_id:D64(self.commitments.len() as u64),provider_id:provider_id.clone(),payee:provider_id,slot,start:D64(start),end:D64(end),rate,version_id:"v1".into(),manifest_sha256:self.manifest.manifest_sha256.clone(),merkle_root:self.manifest.merkle_root.clone(),endpoint:provider.endpoint.clone(),proposed_owner_epoch:D64(self.owner_epoch),state:CommitmentState::Proposed,challenge:None,accepted_at:None,settled_at:None,missed_reason:None};
        self.available=sub(self.available,rate.0);self.reserved=add(self.reserved,rate.0);self.commitments.push(commitment.clone());self.finish();self.event("period_proposed",json!({"commitment":commitment}));commitment
    }
    pub fn accept_period(&mut self,commitment_id:D64)->Commitment {
        no_deposit();let c=self.commitment_mut(commitment_id);
        require!(env::predecessor_account_id()==c.provider_id,"PROVIDER_REQUIRED");require!(c.state==CommitmentState::Proposed,"INVALID_STATE");require!(env::block_timestamp()<c.start.0,"ACCEPTANCE_CLOSED");
        c.state=CommitmentState::Accepted;c.accepted_at=Some(D64(env::block_timestamp()));let result=c.clone();self.finish();self.event("period_accepted",json!({"commitment_id":commitment_id}));result
    }
    pub fn open_challenge(&mut self,commitment_id:D64)->Commitment {
        no_deposit();let c=self.commitment(commitment_id).clone();
        if c.state==CommitmentState::Challenged{return c}
        require!(c.state==CommitmentState::Accepted,"CHALLENGE_NOT_OPEN");require!(env::block_timestamp()>=c.start.0 && env::block_timestamp()<c.end.0,"CHALLENGE_WINDOW_CLOSED");
        let (selection_digest,chunk_index)=protocol::select_challenge(&self.network_domain,env::current_account_id().as_str(),c.provider_id.as_str(),c.commitment_id.0,c.slot.0,&c.merkle_root,&env::random_seed(),self.manifest.chunk_count);
        let c=self.commitment_mut(commitment_id);c.challenge=Some(Challenge{chunk_index,opened_at:D64(env::block_timestamp()),deadline:c.end,selection_digest});c.state=CommitmentState::Challenged;let result=c.clone();self.finish();self.event("challenge_opened",json!({"commitment_id":commitment_id,"challenge":result.challenge}));result
    }
    pub fn submit_response(&mut self,commitment_id:D64,version_id:String,chunk_index:u32,chunk_base64:String,siblings:Vec<String>)->Commitment {
        no_deposit();let c=self.commitment(commitment_id).clone();
        require!(!c.terminal(),"ALREADY_SETTLED");require!(env::predecessor_account_id()==c.provider_id,"PROVIDER_REQUIRED");require!(c.state==CommitmentState::Challenged,"CHALLENGE_NOT_OPEN");
        require!(env::block_timestamp()<c.end.0,"PROOF_EXPIRED");require!(version_id==c.version_id && chunk_index==c.challenge.as_ref().unwrap().chunk_index,"PROOF_INVALID");
        require!(protocol::verify_proof(&self.manifest,chunk_index,&chunk_base64,&siblings),"PROOF_INVALID");
        self.reserved=sub(self.reserved,c.rate.0);let credit=self.credit_mut(&CreditKind::Provider,&c.payee);credit.available=D128(add(credit.available.0,c.rate.0));
        let c=self.commitment_mut(commitment_id);c.state=CommitmentState::Earned;c.settled_at=Some(D64(env::block_timestamp()));let result=c.clone();self.finish();self.event("sampled_response_accepted",json!({"commitment_id":commitment_id,"chunk_index":chunk_index,"rate":result.rate,"payee":result.payee}));result
    }
    pub fn expire_period(&mut self,commitment_id:D64)->Commitment {
        no_deposit();let c=self.commitment(commitment_id).clone();if c.terminal(){return c}
        require!(env::block_timestamp()>=c.end.0,"PERIOD_NOT_EXPIRED");
        self.reserved=sub(self.reserved,c.rate.0);self.available=add(self.available,c.rate.0);
        let c=self.commitment_mut(commitment_id);c.missed_reason=Some(match c.state{CommitmentState::Proposed=>"not_accepted",CommitmentState::Accepted=>"not_opened",_=>"no_accepted_response"}.into());c.state=CommitmentState::Missed;c.settled_at=Some(D64(env::block_timestamp()));let result=c.clone();self.finish();self.event("period_missed",json!({"commitment_id":commitment_id,"reason":result.missed_reason}));result
    }
    pub fn finalize_expiry(&mut self)->Ledger {
        no_deposit();require!(env::block_timestamp()>=self.policy.fund_expiry.0,"RESERVE_NOT_EXPIRED");
        if self.reserve_expired{return self.get_ledger()}
        require!(self.reserved==0 && self.commitments.iter().all(|c|c.terminal()),"OUTSTANDING_COMMITMENTS");
        let amount=self.available;self.available=0;let beneficiary=self.policy.refund_beneficiary.clone();let credit=self.credit_mut(&CreditKind::Refund,&beneficiary);credit.available=D128(add(credit.available.0,amount));self.reserve_expired=true;self.finish();self.event("reserve_expired",json!({"amount":amount.to_string(),"beneficiary":beneficiary}));self.get_ledger()
    }
    pub fn claim_provider(&mut self,provider_id:AccountId)->Promise {no_deposit();self.claim(CreditKind::Provider,provider_id)}
    pub fn claim_refund(&mut self)->Promise {no_deposit();self.claim(CreditKind::Refund,self.policy.refund_beneficiary.clone())}
    #[private]
    pub fn on_payment_result(&mut self,operation_id:D64)->bool {
        no_deposit();require!(env::predecessor_account_id()==env::current_account_id(),"PRIVATE_CALLBACK");require!(env::promise_results_count()==1,"INVALID_CALLBACK_RESULTS");
        let Some(index)=self.payments.iter().position(|p|p.operation_id==operation_id && p.status==PaymentStatus::Pending) else{return false};
        let attempt=self.payments[index].clone();let success=env::promise_result_checked(0,32).is_ok();
        let credit=self.credit_mut(&attempt.kind,&attempt.creditor);require!(credit.pending_operation_id==Some(operation_id) && credit.pending.0==attempt.amount.0,"PAYMENT_INTEGRITY");
        credit.pending=D128(0);credit.pending_operation_id=None;
        if success{credit.paid=D128(add(credit.paid.0,attempt.amount.0));self.paid=add(self.paid,attempt.amount.0);}else{credit.available=D128(add(credit.available.0,attempt.amount.0));}
        self.payments[index].status=if success{PaymentStatus::Succeeded}else{PaymentStatus::Failed};self.payments[index].resolved_at=Some(D64(env::block_timestamp()));
        self.assert_books();self.event("payment_resolved",json!({"operation_id":operation_id,"success":success,"creditor":attempt.creditor,"kind":attempt.kind,"amount":attempt.amount}));success
    }
    #[payable]
    pub fn nft_transfer(&mut self,receiver_id:AccountId,token_id:String,approval_id:Option<u64>,memo:Option<String>) {
        self.nft_checks(&receiver_id,&token_id,approval_id,&memo);self.security_deposit();let old=self.owner_id.clone();self.move_owner(receiver_id);self.finish();self.nft_event(&old,&self.owner_id,memo);
    }
    #[payable]
    pub fn nft_transfer_call(&mut self,receiver_id:AccountId,token_id:String,approval_id:Option<u64>,memo:Option<String>,msg:String)->PromiseOrValue<bool> {
        require!(self.transfer_call_pending.is_none(),"TRANSFER_PENDING");self.nft_checks(&receiver_id,&token_id,approval_id,&memo);require!(msg.len()<=1024,"INVALID_RECEIVER_MESSAGE");require!(env::prepaid_gas().as_gas()>=Gas::from_tgas(175).as_gas(),"INSUFFICIENT_GAS");self.security_deposit();
        let operation_id=D64(self.next_transfer);self.next_transfer=inc(self.next_transfer);let old=self.owner_id.clone();
        self.transfer_call_pending=Some(TransferLock{operation_id,old_owner:old.clone(),receiver_id:receiver_id.clone(),started_at:D64(env::block_timestamp())});self.move_owner(receiver_id.clone());self.finish();self.nft_event(&old,&receiver_id,memo);
        PromiseOrValue::Promise(ext_receiver::ext(receiver_id).with_static_gas(Gas::from_tgas(50)).nft_on_transfer(old.clone(),old,TOKEN.into(),msg).then(ext_self::ext(env::current_account_id()).with_static_gas(NFT_CALLBACK_GAS).on_nft_transfer_result(operation_id)))
    }
    #[private]
    pub fn on_nft_transfer_result(&mut self,operation_id:D64)->bool {
        no_deposit();require!(env::predecessor_account_id()==env::current_account_id(),"PRIVATE_CALLBACK");require!(env::promise_results_count()==1,"INVALID_CALLBACK_RESULTS");
        let Some(lock)=self.transfer_call_pending.clone().filter(|p|p.operation_id==operation_id) else{return true};
        let should_return=match env::promise_result_checked(0,16){Ok(data)=>near_sdk::serde_json::from_slice::<bool>(&data).unwrap_or(true),Err(_)=>true};
        let returned=should_return && self.owner_id==lock.receiver_id;
        if returned{let previous=self.owner_id.clone();self.move_owner(lock.old_owner.clone());self.nft_event(&previous,&lock.old_owner,Some("transfer_call return".into()));}
        self.transfer_call_pending=None;self.assert_books();self.event("transfer_call_resolved",json!({"operation_id":operation_id,"returned":returned,"owner_id":self.owner_id}));!returned
    }
    pub fn nft_token(&self,token_id:String)->Option<Value>{if token_id!=TOKEN {None}else{Some(self.token())}}
    pub fn nft_metadata(&self)->Value{json!({"spec":"nft-1.0.0","name":"ArchivePass","symbol":"ARCHIVE","icon":null,"base_uri":null,"reference":null,"reference_hash":null})}
    pub fn nft_total_supply(&self)->D128{D128(1)}
    pub fn nft_supply_for_owner(&self,account_id:AccountId)->D128{D128(u128::from(account_id==self.owner_id))}
    pub fn nft_tokens(&self,from_index:Option<D128>,limit:Option<u64>)->Vec<Value>{if from_index.unwrap_or(D128(0)).0==0 && limit.unwrap_or(50)>0{vec![self.token()]}else{vec![]}}
    pub fn nft_tokens_for_owner(&self,account_id:AccountId,from_index:Option<D128>,limit:Option<u64>)->Vec<Value>{if account_id==self.owner_id{self.nft_tokens(from_index,limit)}else{vec![]}}
}

impl ArchivePass {
    fn event(&self,event:&str,data:Value){env::log_str(&format!("EVENT_JSON:{}",json!({"standard":"archivepass","version":"1.0.0","event":event,"data":[data]})))}
    fn nft_event(&self,old:&AccountId,new:&AccountId,memo:Option<String>){env::log_str(&format!("EVENT_JSON:{}",json!({"standard":"nep171","version":"1.0.0","event":"nft_transfer","data":[{"old_owner_id":old,"new_owner_id":new,"token_ids":[TOKEN],"memo":memo}]})))}
    fn token(&self)->Value {
        use base64::Engine;
        json!({"token_id":TOKEN,"owner_id":self.owner_id,"approved_account_ids":{},"metadata":{"title":self.manifest.title,"description":"Transferable stewardship of a public archive with restricted finite upkeep funding. Sampled responses do not prove continuous uptime.","media":null,"media_hash":null,"copies":1,"issued_at":self.created_at.to_string(),"expires_at":null,"starts_at":null,"updated_at":null,"extra":self.manifest.manifest_sha256,"reference":format!("archivepass:{}",self.manifest.manifest_sha256),"reference_hash":base64::engine::general_purpose::STANDARD.encode(protocol::unhex(&self.manifest.manifest_sha256).unwrap())}})
    }
    fn owner_action(&mut self,epoch:D64,stable:bool){require!(env::predecessor_account_id()==self.owner_id,"OWNER_REQUIRED");require!(epoch.0==self.owner_epoch,"STALE_OWNER");if stable{require!(self.transfer_call_pending.is_none(),"TRANSFER_PENDING")}self.security_deposit();}
    fn security_deposit(&mut self){require!(env::attached_deposit().as_yoctonear()==1,"EXACTLY_ONE_YOCTO_REQUIRED");self.security_deposits=add(self.security_deposits,1);}
    fn nft_checks(&self,receiver:&AccountId,token:&str,approval:Option<u64>,memo:&Option<String>){require!(token==TOKEN,"TOKEN_NOT_FOUND");require!(approval.is_none(),"APPROVALS_UNSUPPORTED");require!(env::predecessor_account_id()==self.owner_id,"OWNER_REQUIRED");require!(receiver!=&self.owner_id,"TRANSFER_TO_SELF");require!(memo.as_ref().is_none_or(|m|m.len()<=256),"MEMO_TOO_LONG");}
    fn move_owner(&mut self,owner:AccountId){self.owner_id=owner;self.owner_epoch=inc(self.owner_epoch);}
    fn commitment(&self,id:D64)->&Commitment {self.commitments.get(usize::try_from(id.0).expect("NOT_FOUND")).expect("NOT_FOUND")}
    fn commitment_mut(&mut self,id:D64)->&mut Commitment {self.commitments.get_mut(usize::try_from(id.0).expect("NOT_FOUND")).expect("NOT_FOUND")}
    fn credit_mut(&mut self,kind:&CreditKind,account:&AccountId)->&mut Credit{self.credits.iter_mut().find(|c|&c.kind==kind && &c.creditor==account).expect("CREDIT_NOT_FOUND")}
    fn claim(&mut self,kind:CreditKind,creditor:AccountId)->Promise {
        require!(env::prepaid_gas().as_gas()>=Gas::from_tgas(120).as_gas(),"INSUFFICIENT_GAS");
        require!(self.payments.iter().filter(|p|p.status==PaymentStatus::Pending).count()<8,"CAPACITY_REACHED");self.assert_headroom();
        let index=self.credits.iter().position(|c|c.kind==kind && c.creditor==creditor).expect("CREDIT_NOT_FOUND");let credit=&self.credits[index];require!(credit.pending_operation_id.is_none(),"PAYMENT_PENDING");require!(credit.available.0>0,"NO_CREDIT");
        let amount=credit.available;let operation_id=D64(self.next_payment);self.next_payment=inc(self.next_payment);
        self.credits[index].available=D128(0);self.credits[index].pending=amount;self.credits[index].pending_operation_id=Some(operation_id);
        self.payments.retain(|p|p.kind!=kind || p.creditor!=creditor || p.status==PaymentStatus::Pending);
        self.payments.push(PaymentAttempt{operation_id,kind:kind.clone(),creditor:creditor.clone(),amount,started_at:D64(env::block_timestamp()),status:PaymentStatus::Pending,receipt:None,resolved_at:None});
        self.finish();self.event("payment_started",json!({"operation_id":operation_id,"kind":kind,"creditor":creditor,"amount":amount}));
        Promise::new(creditor).transfer(NearToken::from_yoctonear(amount.0)).then(ext_self::ext(env::current_account_id()).with_static_gas(PAYMENT_CALLBACK_GAS).on_payment_result(operation_id))
    }
    fn storage_cost(&self)->u128{(self.storage_budget_bytes as u128).checked_mul(env::storage_byte_cost().as_yoctonear()).expect("STORAGE_OVERFLOW")}
    fn nonpending_cash(&self)->u128{self.credits.iter().fold(add(self.available,self.reserved),|sum,c|add(sum,c.available.0))}
    fn assert_headroom(&self){
        require!(near_sdk::borsh::to_vec(self).expect("SERIALIZATION_FAILED").len() as u64<=STATE_BUDGET_BYTES,"STATE_BUDGET_EXHAUSTED");
        require!(env::storage_usage()<=self.storage_budget_bytes,"STORAGE_BUDGET_EXHAUSTED");
        require!(env::account_balance().as_yoctonear()>=add(self.storage_cost(),self.nonpending_cash()),"STORAGE_HEADROOM");
    }
    fn assert_books(&self){let _=self.get_ledger();require!(self.reserved==self.commitments.iter().filter(|c|!c.terminal()).fold(0,|s,c|add(s,c.rate.0)),"RESERVATION_INTEGRITY");require!(self.credits.iter().fold(0,|s,c|add(s,c.paid.0))==self.paid,"PAID_INTEGRITY");for credit in &self.credits{require!(credit.pending_operation_id.is_some()==(credit.pending.0>0),"PENDING_INTEGRITY");}}
    fn finish(&self){self.assert_books();self.assert_headroom();}
}
fn page<T:Clone+near_sdk::serde::Serialize>(items:&[T],from:u64,limit:u32)->Page<T>{require!((1..=50).contains(&limit),"INVALID_PAGE_LIMIT");let start=usize::try_from(from).unwrap_or(usize::MAX).min(items.len());let end=start.saturating_add(limit as usize).min(items.len());Page{items:items[start..end].to_vec(),next_cursor:if end<items.len(){Some(end.to_string())}else{None}}}

#[cfg(test)]
mod tests;
