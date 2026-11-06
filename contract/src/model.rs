use near_sdk::{near, AccountId};
use near_sdk::serde::{Serialize, Serializer, Deserialize, Deserializer};

macro_rules! decimal {
    ($name:ident,$inner:ty) => {
        #[near(serializers=[borsh])]
        #[derive(Clone,Copy,Debug,Default,PartialEq,Eq)]
        pub struct $name(pub $inner);
        impl Serialize for $name {
            fn serialize<S:Serializer>(&self,s:S)->Result<S::Ok,S::Error>{s.serialize_str(&self.0.to_string())}
        }
        impl<'de> Deserialize<'de> for $name {
            fn deserialize<D:Deserializer<'de>>(d:D)->Result<Self,D::Error>{
                let v=String::deserialize(d)?;
                if v.is_empty() || (v.len()>1 && v.starts_with('0')) || !v.bytes().all(|b|b.is_ascii_digit()) {
                    return Err(near_sdk::serde::de::Error::custom("canonical decimal string required"));
                }
                v.parse::<$inner>().map(Self).map_err(near_sdk::serde::de::Error::custom)
            }
        }
    }
}
decimal!(D64,u64);
decimal!(D128,u128);

#[near(serializers=[borsh,json])]
#[derive(Clone,Debug)]
#[serde(deny_unknown_fields)]
pub struct Manifest {
    pub schema:String,pub version_id:String,pub title:String,pub filename:String,
    pub media_type:String,pub license_note:String,pub size_bytes:D64,pub chunk_size:u32,
    pub chunk_count:u32,pub file_sha256:String,pub merkle_root:String,pub manifest_sha256:String,
}
#[near(serializers=[borsh,json])]
#[derive(Clone,Debug)]
#[serde(deny_unknown_fields)]
pub struct Policy {
    pub service_origin:D64,pub period_duration:D64,pub max_provider_rate:D128,
    pub max_slot_spend:D128,pub fund_expiry:D64,pub refund_beneficiary:AccountId,
    pub eligible_providers:Vec<AccountId>,pub max_nonterminal_commitments:u32,
    pub max_total_commitments:u32,pub max_pending_payouts:u32,
}
#[near(serializers=[borsh,json])]
#[derive(Clone,Debug)]
#[serde(deny_unknown_fields)]
pub struct ProviderConfig {pub provider_id:AccountId,pub label:String,pub endpoint:String,pub enabled:bool}
#[near(serializers=[borsh,json])]
#[derive(Clone,Debug)]
pub struct Challenge {pub chunk_index:u32,pub opened_at:D64,pub deadline:D64,pub selection_digest:String}
#[near(serializers=[borsh,json])]
#[derive(Clone,Debug,PartialEq,Eq)]
pub enum CommitmentState {Proposed,Accepted,Challenged,Earned,Missed}
#[near(serializers=[borsh,json])]
#[derive(Clone,Debug)]
pub struct Commitment {
    pub commitment_id:D64,pub provider_id:AccountId,pub payee:AccountId,pub slot:D64,
    pub start:D64,pub end:D64,pub rate:D128,pub version_id:String,pub manifest_sha256:String,
    pub merkle_root:String,pub endpoint:String,pub proposed_owner_epoch:D64,
    pub state:CommitmentState,pub challenge:Option<Challenge>,pub accepted_at:Option<D64>,
    pub settled_at:Option<D64>,pub missed_reason:Option<String>,
}
impl Commitment {pub fn terminal(&self)->bool{matches!(self.state,CommitmentState::Earned|CommitmentState::Missed)}}
#[near(serializers=[borsh,json])]
#[derive(Clone,Debug,PartialEq,Eq)]
#[serde(rename_all="lowercase")]
pub enum CreditKind {Provider,Refund}
#[near(serializers=[borsh,json])]
#[derive(Clone,Debug)]
pub struct Credit {pub kind:CreditKind,pub creditor:AccountId,pub available:D128,pub pending:D128,pub paid:D128,pub pending_operation_id:Option<D64>}
#[near(serializers=[borsh,json])]
#[derive(Clone,Debug,PartialEq,Eq)]
pub enum PaymentStatus {Pending,Succeeded,Failed,Unknown}
#[near(serializers=[borsh,json])]
#[derive(Clone,Debug)]
pub struct Receipt {pub source:String,pub status:PaymentStatus,pub transaction_hash:Option<String>,pub receipt_ids:Vec<String>,pub local_event_id:Option<D64>,pub explorer_url:Option<String>}
#[near(serializers=[borsh,json])]
#[derive(Clone,Debug)]
pub struct PaymentAttempt {pub operation_id:D64,pub kind:CreditKind,pub creditor:AccountId,pub amount:D128,pub started_at:D64,pub status:PaymentStatus,pub receipt:Option<Receipt>,pub resolved_at:Option<D64>}
#[near(serializers=[json])]
pub struct Ledger {pub principal_in:D128,pub available_upkeep:D128,pub reserved_upkeep:D128,pub earned_credit:D128,pub refund_credit:D128,pub pending_payments:D128,pub principal_paid:D128,pub conservation_residual:D128,pub operations_funded:D128,pub security_deposits:D128}
#[near(serializers=[borsh,json])]
#[derive(Clone,Debug)]
pub struct TransferLock {pub operation_id:D64,pub old_owner:AccountId,pub receiver_id:AccountId,pub started_at:D64}
#[near(serializers=[json])]
pub struct ChainAsset {pub network_domain:String,pub contract_id:AccountId,pub token_id:String,pub protocol_version:String,pub manifest:Manifest,pub policy:Policy,pub owner_id:AccountId,pub owner_epoch:D64,pub transfer_call_pending:Option<TransferLock>,pub reserve_expired:bool,pub providers:Vec<ProviderConfig>,pub ledger:Ledger,pub credits:Vec<Credit>,pub created_at:D64}
#[near(serializers=[json])]
pub struct Page<T:Serialize> {pub items:Vec<T>,pub next_cursor:Option<String>}
