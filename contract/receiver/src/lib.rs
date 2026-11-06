use near_sdk::{near,env,AccountId,Promise,PromiseOrValue,NearToken,Gas};
#[near(contract_state)]
#[derive(Default)]
pub struct Receiver;
#[near]
impl Receiver {
    pub fn nft_on_transfer(&mut self,sender_id:AccountId,previous_owner_id:AccountId,token_id:String,msg:String)->PromiseOrValue<near_sdk::serde_json::Value>{
        let _=(sender_id,previous_owner_id);
        match msg.as_str(){
            "keep"=>PromiseOrValue::Value(near_sdk::serde_json::json!(false)),
            "return"=>PromiseOrValue::Value(near_sdk::serde_json::json!(true)),
            "malformed"=>PromiseOrValue::Value(near_sdk::serde_json::json!("not-a-boolean")),
            "panic"=>env::panic_str("DELIBERATE_RECEIVER_FAILURE"),
            value if value.starts_with("forward:")=>{
                let receiver_id:AccountId=value[8..].parse().expect("INVALID_FORWARD_ACCOUNT");
                PromiseOrValue::Promise(Promise::new(env::predecessor_account_id()).function_call("nft_transfer",near_sdk::serde_json::to_vec(&near_sdk::serde_json::json!({"receiver_id":receiver_id,"token_id":token_id,"approval_id":null,"memo":"receiver fixture forwarding"})).unwrap(),NearToken::from_yoctonear(1),Gas::from_tgas(25)))
            },
            value if value.starts_with("attack:")=>{
                let args:near_sdk::serde_json::Value=near_sdk::serde_json::from_str(&value[7..]).expect("INVALID_ATTACK_ARGS");
                PromiseOrValue::Promise(Promise::new(env::predecessor_account_id()).function_call("propose_period",near_sdk::serde_json::to_vec(&args).unwrap(),NearToken::from_yoctonear(1),Gas::from_tgas(25)))
            },
            _=>PromiseOrValue::Value(near_sdk::serde_json::json!(true)),
        }
    }
}
