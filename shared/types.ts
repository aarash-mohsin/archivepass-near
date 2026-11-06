export type Decimal=string;
export type AccountId=string;
export type HashHex=string;
export type AssetId=string;
export type Mode='local'|'testnet';
export interface ArchiveMetadata {title:string;filename:string;media_type:string;license_note:string;}
export interface Manifest extends ArchiveMetadata {schema:'archivepass-manifest-v1';version_id:'v1';size_bytes:Decimal;chunk_size:1024;chunk_count:number;file_sha256:HashHex;merkle_root:HashHex;manifest_sha256:HashHex;}
/** levels[0] contains real and padded leaves; levels.at(-1) is the single root. */
export interface MerkleTree {levels:HashHex[][];chunk_count:number;size_bytes:Decimal;}
export interface Policy {service_origin:Decimal;period_duration:Decimal;max_provider_rate:Decimal;max_slot_spend:Decimal;fund_expiry:Decimal;refund_beneficiary:AccountId;eligible_providers:AccountId[];max_nonterminal_commitments:16;max_total_commitments:256;max_pending_payouts:8;}
export interface ProviderConfig {provider_id:AccountId;label:string;endpoint:string;enabled:boolean;}
export interface Challenge {chunk_index:number;opened_at:Decimal;deadline:Decimal;selection_digest:HashHex;}
export type CommitmentState='Proposed'|'Accepted'|'Challenged'|'Earned'|'Missed';
export interface Commitment {commitment_id:Decimal;provider_id:AccountId;payee:AccountId;slot:Decimal;start:Decimal;end:Decimal;rate:Decimal;version_id:'v1';manifest_sha256:HashHex;merkle_root:HashHex;endpoint:string;proposed_owner_epoch:Decimal;state:CommitmentState;challenge:Challenge|null;accepted_at:Decimal|null;settled_at:Decimal|null;missed_reason:'not_accepted'|'not_opened'|'no_accepted_response'|null;}
export interface Proof {commitment_id:Decimal;version_id:'v1';chunk_index:number;chunk_base64:string;siblings:HashHex[];}
export interface Credit {kind:'provider'|'refund';creditor:AccountId;available:Decimal;pending:Decimal;paid:Decimal;pending_operation_id:Decimal|null;}
export interface Receipt {source:'local'|'near-testnet';status:'Pending'|'Succeeded'|'Failed'|'Unknown';transaction_hash:string|null;receipt_ids:string[];local_event_id:Decimal|null;explorer_url:string|null;}
export interface PaymentAttempt {operation_id:Decimal;kind:'provider'|'refund';creditor:AccountId;amount:Decimal;started_at:Decimal;status:'Pending'|'Succeeded'|'Failed'|'Unknown';receipt:Receipt|null;resolved_at:Decimal|null;}
export interface Ledger {principal_in:Decimal;available_upkeep:Decimal;reserved_upkeep:Decimal;earned_credit:Decimal;refund_credit:Decimal;pending_payments:Decimal;principal_paid:Decimal;conservation_residual:Decimal;operations_funded:Decimal;security_deposits:Decimal;}
export interface TransferLock {operation_id:Decimal;old_owner:AccountId;receiver_id:AccountId;started_at:Decimal;}
export interface Asset {asset_id:AssetId;mode:Mode;network_domain:'archivepass-local-v1'|'near-testnet';contract_id:string;token_id:'archive';protocol_version:'archivepass-v1';manifest:Manifest;policy:Policy;owner_id:AccountId;owner_epoch:Decimal;transfer_call_pending:TransferLock|null;reserve_expired:boolean;providers:ProviderConfig[];ledger:Ledger;credits:Credit[];created_at:Decimal;observed_at:Decimal;deployment:{code_hash:string|null;key_status:'local'|'verified_keyless'|'retained'|'unknown';verified_at:Decimal|null};}
export interface Event {event_id:Decimal;asset_id:AssetId;at:Decimal;actor_id:AccountId|null;name:string;data:Record<string,unknown>;receipt:Receipt;}
export interface Page<T> {items:T[];next_cursor:string|null;}
export interface ApiError {error:{code:string;message:string;details?:Record<string,unknown>};request_id:string|null;}
export type ChainAsset=Omit<Asset,'asset_id'|'mode'|'observed_at'|'deployment'>;
export type Command=
 |{type:'fund_upkeep';amount:Decimal;version_id:'v1'}
 |{type:'fund_operations';amount:Decimal}
 |{type:'configure_provider';expected_owner_epoch:Decimal;provider:ProviderConfig}
 |{type:'propose_period';expected_owner_epoch:Decimal;provider_id:AccountId;slot:Decimal;rate:Decimal}
 |{type:'accept_period';commitment_id:Decimal}
 |{type:'open_challenge';commitment_id:Decimal}
 |{type:'submit_response';proof:Proof}
 |{type:'expire_period';commitment_id:Decimal}
 |{type:'finalize_expiry'}
 |{type:'claim_provider';provider_id:AccountId}
 |{type:'claim_refund'}
 |{type:'nft_transfer';expected_owner_epoch:Decimal;receiver_id:AccountId;token_id:'archive'}
 |{type:'nft_transfer_call';expected_owner_epoch:Decimal;receiver_id:AccountId;token_id:'archive';msg:string};
export interface CommandEnvelope {actor_id:AccountId;command:Command;}
export interface CommandResult {asset:Asset;commitment:Commitment|null;payment:PaymentAttempt|null;receipt:Receipt;}
export interface Environment {mode:Mode;network_domain:'archivepass-local-v1'|'near-testnet';now:Decimal;api_version:string;local_actors:AccountId[];keeper_bindings:{provider_id:AccountId;origin:string}[];operator_auth_required:boolean;deployments:{asset_id:AssetId;contract_id:string;code_hash:string|null;key_status:Asset['deployment']['key_status']}[];last_sync_at:Decimal|null;evidence:Record<string,{status:'pass'|'fail'|'not_run';observed_at:Decimal|null;detail:string}>;}
export interface Draft {draft_id:string;manifest:Manifest;created_at:Decimal;}
export interface Observation {source_origin:string;started_at:Decimal;finished_at:Decimal;size_bytes:Decimal;expected_sha256:string;actual_sha256:string;verified:boolean;error:string|null;}
export interface ChallengeInput {network_domain:string;contract_id:string;version_id:'v1';provider_id:string;commitment_id:Decimal;slot:Decimal;merkle_root:HashHex;chunk_count:number;}
export interface KeeperAssetStatus {asset_id:string;provider_id:string;origin?:string;reachable:boolean;status:'NotImported'|'Importing'|'Ready'|'Missing'|'Corrupt'|'Failed'|'Unavailable';manifest_sha256:string|null;checked_at:string|null;imported_at:string|null;serving_enabled:boolean;worker_enabled:boolean;next_obligation:{commitment_id:string;start:string;end:string;state:CommitmentState}|null;last_error:string|null;}
