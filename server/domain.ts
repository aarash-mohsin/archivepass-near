import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { readFileSync, writeFileSync, renameSync, mkdirSync, realpathSync, lstatSync, existsSync } from 'node:fs';
import { resolve, join, sep } from 'node:path';
import type { Asset, Manifest, Policy, ProviderConfig, Commitment, Credit, PaymentAttempt, Event, Receipt, Command, CommandEnvelope, CommandResult, Page, Proof } from '../shared/types.ts';
import { buildArchive, verifyProof, selectChallenge } from '../shared/protocol.ts';
import { Store } from './db.ts';
import { account, decimal, DomainError, requireRule, uuid, nowNs } from './errors.ts';
import { LOCAL_ACTORS, type AppConfig } from './config.ts';

export interface Draft { draft_id: string; manifest: Manifest; created_at: string }
export interface UploadMetadata { title: string; filename: string; media_type: string; license_note: string; public_distribution_attested: true; expected_file_sha256: string; expected_merkle_root: string; expected_manifest_sha256: string }
export interface CreateAssetInput { draft_id: string; owner_id: string; policy: Policy; providers: ProviderConfig[] }
export interface DomainOptions { clock?: () => bigint }
const terminal = (c: Commitment) => c.state === 'Earned' || c.state === 'Missed';
const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x));
const canonical = (x: unknown): string => JSON.stringify(x, (_k, v) => v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.keys(v).sort().map(k => [k, v[k]])) : v);
const hash = (x: unknown) => createHash('sha256').update(canonical(x)).digest('hex');
const localReceipt = (id: string | null = null, status: Receipt['status'] = 'Succeeded'): Receipt => ({ source: 'local', status, transaction_hash: null, receipt_ids: [], local_event_id: id, explorer_url: null });
const LOCAL_RECEIVERS:Record<string,string>={'keep.archivepass.testnet':'keep','return.archivepass.testnet':'return','panic.archivepass.testnet':'panic','forward.archivepass.testnet':'forward'};
function text(value: unknown, max: number, name: string, nonempty = false, ascii = false): asserts value is string {
  requireRule(typeof value === 'string' && !/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(value) && Buffer.byteLength(value) <= max && (!nonempty || value.trim().length > 0) && (!ascii || /^[\x20-\x7e]*$/.test(value)), 'INVALID_INPUT', `${name} is invalid or too long.`, 422);
}
export function validateProvider(p: ProviderConfig, eligible: string[]) {
  requireRule(p && typeof p === 'object', 'INVALID_INPUT', 'Provider configuration required.', 422); account(p.provider_id);
  requireRule(eligible.includes(p.provider_id), 'PROVIDER_REQUIRED', 'Provider is outside the immutable eligible set.', 422);
  text(p.label, 80, 'Provider label', true); text(p.endpoint, 256, 'Provider endpoint', true, true);
  let u: URL; try { u = new URL(p.endpoint); } catch { throw new DomainError('INVALID_INPUT', 'Invalid provider endpoint.', 422); }
  requireRule(['http:', 'https:'].includes(u.protocol) && !u.username && !u.password && !u.hash, 'INVALID_INPUT', 'Provider endpoint must be an HTTP(S) URL without credentials or fragment.', 422);
  requireRule(typeof p.enabled === 'boolean', 'INVALID_INPUT', 'Provider enabled flag must be boolean.', 422);
}
function validatePolicy(p: Policy, now: bigint) {
  requireRule(p && typeof p === 'object', 'INVALID_INPUT', 'Policy required.', 422);
  const origin = decimal(p.service_origin, 64), duration = decimal(p.period_duration, 64), expiry = decimal(p.fund_expiry, 64);
  requireRule(duration >= 30_000_000_000n && duration <= 2_592_000_000_000_000n && origin > now && expiry >= origin + duration && expiry < 1n << 64n, 'INVALID_INPUT', 'Use a future service origin, a 30-second to 30-day period, and a viable finite expiry.', 422);
  requireRule(decimal(p.max_provider_rate) > 0n && decimal(p.max_slot_spend) >= decimal(p.max_provider_rate), 'INVALID_INPUT', 'Invalid provider or slot spending cap.', 422);
  account(p.refund_beneficiary); requireRule(Array.isArray(p.eligible_providers) && p.eligible_providers.length >= 2 && p.eligible_providers.length <= 8 && new Set(p.eligible_providers).size === p.eligible_providers.length, 'INVALID_INPUT', 'Choose two through eight distinct eligible providers.', 422);
  p.eligible_providers.forEach(account);
  requireRule(p.max_nonterminal_commitments === 16 && p.max_total_commitments === 256 && p.max_pending_payouts === 8, 'INVALID_INPUT', 'Protocol capacity constants cannot be changed.', 422);
}
function commandShape(command:unknown):asserts command is Command {
 requireRule(command&&typeof command==='object'&&!Array.isArray(command),'INVALID_INPUT','A command object is required.',422);
 const c=command as Record<string,unknown>;const fields:Record<string,string[]>={fund_upkeep:['amount','version_id'],fund_operations:['amount'],configure_provider:['expected_owner_epoch','provider'],propose_period:['expected_owner_epoch','provider_id','slot','rate'],accept_period:['commitment_id'],open_challenge:['commitment_id'],submit_response:['proof'],expire_period:['commitment_id'],finalize_expiry:[],claim_provider:['provider_id'],claim_refund:[],nft_transfer:['expected_owner_epoch','receiver_id','token_id'],nft_transfer_call:['expected_owner_epoch','receiver_id','token_id','msg']};
 requireRule(typeof c.type==='string'&&Object.hasOwn(fields,c.type),'INVALID_INPUT','Unknown command type.',422);const names=fields[c.type]!;requireRule(names.every(k=>Object.hasOwn(c,k))&&Object.keys(c).every(k=>k==='type'||names.includes(k)),'INVALID_INPUT','Command fields are missing or unsupported.',422);
 if(c.type==='submit_response'){const p=c.proof;requireRule(p&&typeof p==='object'&&!Array.isArray(p),'INVALID_INPUT','A proof object is required.',422);const proof=p as Record<string,unknown>;requireRule(['commitment_id','version_id','chunk_index','chunk_base64','siblings'].every(k=>Object.hasOwn(proof,k))&&Object.keys(proof).every(k=>['commitment_id','version_id','chunk_index','chunk_base64','siblings'].includes(k)),'INVALID_INPUT','Proof fields are missing or unsupported.',422);decimal(proof.commitment_id,64);requireRule(typeof proof.version_id==='string'&&Number.isInteger(proof.chunk_index)&&typeof proof.chunk_base64==='string'&&proof.chunk_base64.length<=1400&&Array.isArray(proof.siblings)&&proof.siblings.length<=14,'PROOF_INVALID','Malformed proof shape.',422);}
}

export class Domain {
  store: Store; config: AppConfig; clock: () => bigint; blob_root: string;
  constructor(config: AppConfig, options: DomainOptions = {}) {
    this.config = config; this.clock = options.clock ?? nowNs; this.store = new Store(join(config.data_dir, 'archivepass.sqlite'));
    const boundMode=this.store.db.prepare('SELECT value FROM settings WHERE key=?').get('application_mode'); requireRule(!boundMode || boundMode.value===config.mode,'MODE_MISMATCH','This data directory belongs to a different execution mode.',409); this.store.db.prepare('INSERT OR IGNORE INTO settings VALUES(?,?)').run('application_mode',config.mode);
    this.blob_root = resolve(config.data_dir, 'blobs'); mkdirSync(this.blob_root, { recursive: true });
    requireRule(!lstatSync(this.blob_root).isSymbolicLink() && realpathSync(this.blob_root) === this.blob_root, 'INVALID_INPUT', 'The content root must be a canonical directory without links.', 422);
    for (const row of this.store.db.prepare('SELECT id FROM assets').all()) { const a = this.asset(String(row.id)); const original = JSON.stringify(a.ledger); this.assertIntegrity(a); requireRule(JSON.stringify(a.ledger) === original, 'INTEGRITY_ERROR', 'Persisted aggregate ledger disagrees with credit rows.', 500); }
  }
  close() { this.store.close(); }
  now() { return this.clock().toString(); }
  environment() { return { mode: this.config.mode, network_domain: this.config.mode === 'local' ? 'archivepass-local-v1' : 'near-testnet', now: this.now(), api_version: 'archivepass-v1', local_actors: this.config.mode === 'local' ? [...LOCAL_ACTORS,...Object.keys(LOCAL_RECEIVERS)] : [], keeper_bindings: this.config.keeper_bindings, operator_auth_required: true, deployments: [], last_sync_at: null,
    evidence: Object.fromEntries(['local_functional','rust_unit','wasm','receipt_integration','testnet_flow','live_transfer_call','keyless'].map(k => [k, { status: 'not_run', observed_at: null, detail: 'Health does not establish this verification gate.' }])) }; }
  private localOnly() { requireRule(this.config.mode === 'local', 'SIGNED_ACTION_REQUIRED', 'Use the documented provider/owner signed testnet script; this API cannot impersonate a chain signer.', 409); }
  private getJson<T>(table: 'assets'|'drafts', id: string): T {
    requireRule(uuid(id), 'NOT_FOUND', 'Unknown identifier.', 404); const row = this.store.db.prepare(`SELECT body FROM ${table} WHERE id=?`).get(id);
    requireRule(row, 'NOT_FOUND', `${table === 'assets' ? 'Archive' : 'Draft'} not found.`, 404); return JSON.parse(String(row.body));
  }
  asset(id: string): Asset { const a = this.getJson<Asset>('assets', id); a.observed_at = this.now(); return a; }
  draft(id: string): Draft { return this.getJson<Draft>('drafts', id); }
  private replay<T>(scope: string, requestId: string, body: unknown): T | undefined {
    requireRule(uuid(requestId), 'INVALID_INPUT', 'X-Request-Id must be a UUID.', 400);
    const row = this.store.db.prepare('SELECT body_hash,result FROM idempotency WHERE scope=? AND request_id=?').get(scope, requestId);
    if (!row) return undefined; requireRule(row.body_hash === hash(body), 'REQUEST_ID_CONFLICT', 'This request ID was already used with a different body.'); return JSON.parse(String(row.result));
  }
  private remember(scope: string, requestId: string, body: unknown, result: unknown) { this.store.db.prepare('INSERT INTO idempotency VALUES(?,?,?,?)').run(scope, requestId, hash(body), JSON.stringify(result)); }
  private event(asset: Asset, actor: string | null, name: string, data: Record<string, unknown>): Receipt {
    const e: Event = { event_id: '0', asset_id: asset.asset_id, at: this.now(), actor_id: actor, name, data, receipt: localReceipt() };
    const result = this.store.db.prepare('INSERT INTO events(asset_id,body) VALUES(?,?)').run(asset.asset_id, JSON.stringify(e)); e.event_id = result.lastInsertRowid.toString(); e.receipt = localReceipt(e.event_id);
    this.store.db.prepare('UPDATE events SET body=? WHERE id=?').run(JSON.stringify(e), e.event_id); return e.receipt;
  }
  private safeBlob(hashValue: string): string {
    requireRule(/^[0-9a-f]{64}$/.test(hashValue), 'NOT_FOUND', 'Unknown content.', 404); const path = resolve(this.blob_root, hashValue);
    requireRule(path.startsWith(this.blob_root + sep), 'NOT_FOUND', 'Invalid content path.', 404);
    if (existsSync(path)) requireRule(!lstatSync(path).isSymbolicLink() && realpathSync(path) === path, 'NOT_FOUND', 'Unsafe content path.', 404); return path;
  }
  content(id: string): { manifest: Manifest; bytes: Buffer } { const manifest = this.asset(id).manifest; const path = this.safeBlob(manifest.file_sha256); requireRule(existsSync(path), 'NOT_FOUND', 'Archive content is unavailable.', 404); return { manifest, bytes: readFileSync(path) }; }
  async upload(bytes: Uint8Array, metadata: UploadMetadata, requestId: string): Promise<Draft> {
    this.localOnly(); requireRule(bytes.byteLength > 0 && bytes.byteLength <= 16_777_216, 'INVALID_INPUT', 'Upload must contain 1 byte through 16 MiB.', 422);
    requireRule(metadata && metadata.public_distribution_attested === true, 'INVALID_INPUT', 'Confirm that this content may be distributed publicly.', 422);
    const body = { metadata, byte_hash: createHash('sha256').update(bytes).digest('hex') }; const scope = 'local:draft:upload'; const replay = this.replay<Draft>(scope, requestId, body); if (replay) return replay;
    let manifest: Manifest; try { ({ manifest } = await buildArchive(bytes, { title: metadata.title, filename: metadata.filename, media_type: metadata.media_type, license_note: metadata.license_note })); } catch (e) { throw new DomainError('INVALID_INPUT', e instanceof Error ? e.message : 'Invalid manifest.', 422); }
    requireRule(manifest.file_sha256 === metadata.expected_file_sha256 && manifest.merkle_root === metadata.expected_merkle_root && manifest.manifest_sha256 === metadata.expected_manifest_sha256, 'CONTENT_MISMATCH', 'Uploaded bytes do not match the browser manifest.', 422);
    const target = this.safeBlob(manifest.file_sha256); if (!existsSync(target)) { const temp = join(this.blob_root, `.upload-${randomUUID()}`); writeFileSync(temp, bytes, { flag: 'wx' }); renameSync(temp, target); }
    else requireRule(createHash('sha256').update(readFileSync(target)).digest('hex') === manifest.file_sha256, 'CONTENT_MISMATCH', 'Existing local content is corrupt. The operator must restore it before reuse.', 422);
    return this.store.transaction(() => { const again = this.replay<Draft>(scope, requestId, body); if (again) return again; const draft = { draft_id: randomUUID(), manifest, created_at: this.now() }; this.store.db.prepare('INSERT INTO drafts VALUES(?,?)').run(draft.draft_id, JSON.stringify(draft)); this.remember(scope, requestId, body, draft); return draft; });
  }
  create(input: CreateAssetInput, requestId: string): Asset {
    requireRule(input&&typeof input==='object'&&!Array.isArray(input),'INVALID_INPUT','Archive creation object required.',422);
    requireRule(this.config.mode === 'local', 'SIGNED_DEPLOYMENT_REQUIRED', 'Deploy the dedicated testnet account using the signed deployment script.', 409);
    const scope = `local:create:${input?.owner_id ?? ''}`;
    return this.store.transaction(() => {
      const replay = this.replay<Asset>(scope, requestId, input); if (replay) return replay;
      account(input.owner_id); validatePolicy(input.policy, this.clock()); const draft = this.draft(input.draft_id);
      requireRule(Number(this.store.db.prepare('SELECT count(*) AS n FROM assets').get()!.n) < 256, 'CAPACITY_REACHED', 'Local archive limit reached.');
      requireRule(Array.isArray(input.providers) && input.providers.length === input.policy.eligible_providers.length && input.providers.every(p=>p&&typeof p==='object') && new Set(input.providers.map(p => p.provider_id)).size === input.providers.length, 'INVALID_INPUT', 'Provide exactly one configuration for every eligible provider.', 422);
      input.providers.forEach(p => validateProvider(p, input.policy.eligible_providers));
      const id = randomUUID(); const a: Asset = { asset_id: id, mode: 'local', network_domain: 'archivepass-local-v1', contract_id: `local:${id}`, token_id: 'archive', protocol_version: 'archivepass-v1', manifest: draft.manifest, policy: clone(input.policy), owner_id: input.owner_id, owner_epoch: '0', transfer_call_pending: null, reserve_expired: false, providers: clone(input.providers), credits: [], created_at: this.now(), observed_at: this.now(), deployment: { code_hash: null, key_status: 'local', verified_at: null },
        ledger: { principal_in:'0',available_upkeep:'0',reserved_upkeep:'0',earned_credit:'0',refund_credit:'0',pending_payments:'0',principal_paid:'0',conservation_residual:'0',operations_funded:'0',security_deposits:'0' } };
      this.store.db.prepare('INSERT INTO assets VALUES(?,?)').run(id, JSON.stringify(a)); this.event(a, input.owner_id, 'archive_created', { manifest_sha256: a.manifest.manifest_sha256, policy: a.policy }); this.remember(scope, requestId, input, a); return a;
    });
  }
  commitments(id: string): Commitment[] { this.asset(id); return this.store.db.prepare('SELECT body FROM commitments WHERE asset_id=? ORDER BY length(id),id').all(id).map(r => JSON.parse(String(r.body))); }
  payments(id: string): PaymentAttempt[] { this.asset(id); return this.store.db.prepare('SELECT body FROM payments WHERE asset_id=? ORDER BY length(id),id').all(id).map(r => JSON.parse(String(r.body))); }
  history(id: string): Event[] { this.asset(id); return this.store.db.prepare('SELECT body FROM events WHERE asset_id=? ORDER BY id').all(id).map(r => JSON.parse(String(r.body))); }
  private commitment(id: string, commitmentId: string): Commitment { decimal(commitmentId, 64); const row = this.store.db.prepare('SELECT body FROM commitments WHERE asset_id=? AND id=?').get(id, commitmentId); requireRule(row, 'NOT_FOUND', 'Commitment not found.', 404); return JSON.parse(String(row.body)); }
  private saveCommitment(id: string, c: Commitment) { this.store.db.prepare('INSERT INTO commitments VALUES(?,?,?,?,?) ON CONFLICT(asset_id,id) DO UPDATE SET body=excluded.body').run(id, c.commitment_id, c.provider_id, c.slot, JSON.stringify(c)); }
  private savePayment(id: string, p: PaymentAttempt) { this.store.db.prepare('INSERT INTO payments VALUES(?,?,?) ON CONFLICT(asset_id,id) DO UPDATE SET body=excluded.body').run(id, p.operation_id, JSON.stringify(p)); }
  private credit(a: Asset, kind: 'provider'|'refund', creditor: string): Credit { let c = a.credits.find(c => c.kind === kind && c.creditor === creditor); if (!c) { c = {kind,creditor,available:'0',pending:'0',paid:'0',pending_operation_id:null}; a.credits.push(c); } return c; }
  private owner(a: Asset, actor: string, epoch: string, stable = true) { requireRule(actor === a.owner_id, 'OWNER_REQUIRED', 'Only the current caretaker may perform this action.', 403); requireRule(epoch === a.owner_epoch, 'STALE_OWNER', 'Ownership changed. Refresh the archive before retrying.'); if (stable) requireRule(!a.transfer_call_pending, 'TRANSFER_PENDING', 'Future service controls are locked during transfer-call resolution.'); }
  private fresh(a: Asset) { requireRule(!a.reserve_expired && this.clock() < decimal(a.policy.fund_expiry,64), 'PROOF_EXPIRED', 'The fixed upkeep term has expired.'); }
  private save(a: Asset) { this.assertIntegrity(a); a.observed_at = this.now(); this.store.db.prepare('UPDATE assets SET body=? WHERE id=?').run(JSON.stringify(a), a.asset_id); }
  assertIntegrity(a: Asset) {
    const sum = (xs: string[]) => xs.reduce((s, x) => s + decimal(x), 0n);
    a.ledger.earned_credit = sum(a.credits.filter(c=>c.kind==='provider').map(c=>c.available)).toString(); a.ledger.refund_credit = sum(a.credits.filter(c=>c.kind==='refund').map(c=>c.available)).toString(); a.ledger.pending_payments = sum(a.credits.map(c=>c.pending)).toString();
    const residual = decimal(a.ledger.principal_in) - sum([a.ledger.available_upkeep,a.ledger.reserved_upkeep,a.ledger.earned_credit,a.ledger.refund_credit,a.ledger.pending_payments,a.ledger.principal_paid]);
    requireRule(residual === 0n, 'INTEGRITY_ERROR', 'Principal conservation failed.', 500);
    const rows = this.store.db.prepare('SELECT body FROM commitments WHERE asset_id=?').all(a.asset_id).map(r=>JSON.parse(String(r.body)) as Commitment);
    requireRule(sum(rows.filter(c=>!terminal(c)).map(c=>c.rate)) === decimal(a.ledger.reserved_upkeep), 'INTEGRITY_ERROR', 'Reserved obligations do not reconcile.', 500);
    const pending = this.store.db.prepare('SELECT body FROM payments WHERE asset_id=?').all(a.asset_id).map(r=>JSON.parse(String(r.body)) as PaymentAttempt).filter(p=>p.status==='Pending'||p.status==='Unknown');
    requireRule(sum(pending.map(p=>p.amount)) === decimal(a.ledger.pending_payments), 'INTEGRITY_ERROR', 'Pending liabilities do not reconcile.', 500); a.ledger.conservation_residual = '0';
  }
  async command(id: string, envelope: CommandEnvelope, requestId: string): Promise<CommandResult> {
    this.localOnly(); requireRule(envelope && typeof envelope === 'object' && envelope.command && typeof envelope.command === 'object', 'INVALID_INPUT', 'Command envelope required.', 400); account(envelope.actor_id);
    commandShape(envelope.command);const cmd = envelope.command; const scope = `local:${id}:${envelope.actor_id}:${cmd.type}`; const replay = this.replay<CommandResult>(scope, requestId, envelope); if (replay) return replay;
    let preparedProof: { manifest: string; challenge: string } | null = null;
    let selected: { selection_digest: string; chunk_index: number } | null = null;
    if (cmd.type === 'submit_response') {
      const a = this.asset(id); const c = this.commitment(id, cmd.proof?.commitment_id); requireRule(c.state === 'Challenged' && c.challenge, terminal(c) ? 'ALREADY_SETTLED' : 'CHALLENGE_NOT_OPEN', 'A pending challenge is required.');
      requireRule(envelope.actor_id === c.provider_id, 'PROVIDER_REQUIRED', 'Only the fixed provider may answer.', 403); requireRule(this.clock() < BigInt(c.end), 'PROOF_EXPIRED', 'Response deadline has passed.');
      requireRule(cmd.proof.version_id === c.version_id && cmd.proof.chunk_index === c.challenge.chunk_index, 'PROOF_INVALID', 'Proof identity/index differs from the fixed challenge.', 422);
      let valid = false; try { valid = await verifyProof(a.manifest, cmd.proof); } catch {} requireRule(valid, 'PROOF_INVALID', 'Chunk/path does not match the committed archive.', 422); preparedProof = { manifest: a.manifest.manifest_sha256, challenge: canonical(c.challenge) };
    } else if (cmd.type === 'open_challenge') {
      const a = this.asset(id), c = this.commitment(id, cmd.commitment_id);
      if (c.state !== 'Challenged') selected = await selectChallenge({ network_domain: a.network_domain, contract_id: a.contract_id, version_id: 'v1', provider_id: c.provider_id, commitment_id: c.commitment_id, slot: c.slot, merkle_root: c.merkle_root, chunk_count: a.manifest.chunk_count }, randomBytes(32));
    }
    return this.store.transaction(() => {
      const again = this.replay<CommandResult>(scope, requestId, envelope); if (again) return again;
      const a = this.asset(id), actor = envelope.actor_id; let c: Commitment | null = null, p: PaymentAttempt | null = null; const now = this.clock(); let data: Record<string, unknown> = {};
      switch (cmd.type) {
        case 'fund_upkeep': { this.fresh(a); requireRule(cmd.version_id === 'v1', 'INVALID_INPUT', 'Wrong archive version.', 422); const amount = decimal(cmd.amount); requireRule(amount > 0n, 'INVALID_INPUT', 'Funding amount must be positive.', 422); a.ledger.principal_in = (decimal(a.ledger.principal_in)+amount).toString(); a.ledger.available_upkeep = (decimal(a.ledger.available_upkeep)+amount).toString(); data = {amount:cmd.amount,refund_beneficiary:a.policy.refund_beneficiary}; break; }
        case 'fund_operations': { const amount=decimal(cmd.amount); requireRule(amount>0n,'INVALID_INPUT','Operations funding must be positive.',422); a.ledger.operations_funded=(decimal(a.ledger.operations_funded)+amount).toString(); data={amount:cmd.amount}; break; }
        case 'configure_provider': { this.owner(a,actor,cmd.expected_owner_epoch); this.fresh(a); validateProvider(cmd.provider,a.policy.eligible_providers); const index=a.providers.findIndex(p=>p.provider_id===cmd.provider.provider_id); if(index<0) a.providers.push(clone(cmd.provider)); else a.providers[index]=clone(cmd.provider); data={provider:cmd.provider}; break; }
        case 'propose_period': {
          this.owner(a,actor,cmd.expected_owner_epoch); this.fresh(a); const provider=a.providers.find(p=>p.provider_id===cmd.provider_id); requireRule(provider?.enabled,'PROVIDER_REQUIRED','Choose an enabled eligible provider.'); const slot=decimal(cmd.slot,64), rate=decimal(cmd.rate); const start=decimal(a.policy.service_origin,64)+slot*decimal(a.policy.period_duration,64), end=start+decimal(a.policy.period_duration,64);
          requireRule(end < (1n<<64n) && now<start && end<=decimal(a.policy.fund_expiry,64),'ACCEPTANCE_CLOSED','Period must start in the future and end before the fixed expiry.');
          requireRule(rate>0n && rate<=decimal(a.policy.max_provider_rate),'INVALID_INPUT','Provider payment exceeds the fixed cap.',422); const cs=this.commitments(id);
          requireRule(cs.length<256 && cs.filter(c=>!terminal(c)).length<16,'CAPACITY_REACHED','Commitment capacity reached.'); requireRule(!cs.some(c=>c.provider_id===cmd.provider_id && c.slot===cmd.slot),'SLOT_ALREADY_USED','This provider/slot was already committed.');
          requireRule(cs.filter(c=>c.slot===cmd.slot).reduce((s,c)=>s+BigInt(c.rate),0n)+rate<=decimal(a.policy.max_slot_spend),'INVALID_INPUT','Slot spending cap exceeded.',422); requireRule(decimal(a.ledger.available_upkeep)>=rate,'INSUFFICIENT_UPKEEP','Available upkeep cannot cover this commitment.');
          const cid=(cs.reduce((m,c)=>BigInt(c.commitment_id)>m?BigInt(c.commitment_id):m,0n)+1n).toString();
          c={commitment_id:cid,provider_id:provider.provider_id,payee:provider.provider_id,slot:cmd.slot,start:start.toString(),end:end.toString(),rate:cmd.rate,version_id:'v1',manifest_sha256:a.manifest.manifest_sha256,merkle_root:a.manifest.merkle_root,endpoint:provider.endpoint,proposed_owner_epoch:a.owner_epoch,state:'Proposed',challenge:null,accepted_at:null,settled_at:null,missed_reason:null}; this.saveCommitment(id,c); a.ledger.available_upkeep=(BigInt(a.ledger.available_upkeep)-rate).toString(); a.ledger.reserved_upkeep=(BigInt(a.ledger.reserved_upkeep)+rate).toString(); data={commitment_id:cid}; break;
        }
        case 'accept_period': { c=this.commitment(id,cmd.commitment_id); requireRule(actor===c.provider_id,'PROVIDER_REQUIRED','Only the fixed provider may accept.',403); requireRule(c.state==='Proposed' && now<BigInt(c.start),'ACCEPTANCE_CLOSED','Provider acceptance is closed.'); c.state='Accepted'; c.accepted_at=now.toString(); this.saveCommitment(id,c); data={commitment_id:c.commitment_id}; break; }
        case 'open_challenge': { c=this.commitment(id,cmd.commitment_id); if(c.state!=='Challenged') { requireRule(c.state==='Accepted','CHALLENGE_NOT_OPEN','Provider must accept before a challenge opens.'); requireRule(now>=BigInt(c.start)&&now<BigInt(c.end),'CHALLENGE_NOT_OPEN','Challenge can open only within the service period.'); requireRule(selected,'CHALLENGE_NOT_OPEN','Challenge selection unavailable.'); c.challenge={...selected,opened_at:now.toString(),deadline:c.end}; c.state='Challenged'; this.saveCommitment(id,c); } data={commitment_id:c.commitment_id,challenge:c.challenge}; break; }
        case 'submit_response': { c=this.commitment(id,cmd.proof.commitment_id); requireRule(c.state==='Challenged'&&c.challenge,terminal(c)?'ALREADY_SETTLED':'CHALLENGE_NOT_OPEN','No unsettled challenge exists.'); requireRule(actor===c.provider_id,'PROVIDER_REQUIRED','Only the fixed provider may answer.',403); requireRule(now<BigInt(c.end),'PROOF_EXPIRED','Response deadline has passed.'); requireRule(preparedProof && preparedProof.manifest===a.manifest.manifest_sha256 && preparedProof.challenge===canonical(c.challenge) && cmd.proof.chunk_index===c.challenge.chunk_index,'PROOF_INVALID','Authoritative challenge changed.',422); c.state='Earned'; c.settled_at=now.toString(); this.saveCommitment(id,c); a.ledger.reserved_upkeep=(BigInt(a.ledger.reserved_upkeep)-BigInt(c.rate)).toString(); const credit=this.credit(a,'provider',c.payee); credit.available=(BigInt(credit.available)+BigInt(c.rate)).toString(); data={commitment_id:c.commitment_id,chunk_index:c.challenge.chunk_index}; break; }
        case 'expire_period': { c=this.commitment(id,cmd.commitment_id); if(!terminal(c)) { requireRule(now>=BigInt(c.end),'PROOF_EXPIRED','The service period has not ended.'); c.missed_reason=c.state==='Proposed'?'not_accepted':c.state==='Accepted'?'not_opened':'no_accepted_response'; c.state='Missed'; c.settled_at=now.toString(); this.saveCommitment(id,c); a.ledger.reserved_upkeep=(BigInt(a.ledger.reserved_upkeep)-BigInt(c.rate)).toString(); a.ledger.available_upkeep=(BigInt(a.ledger.available_upkeep)+BigInt(c.rate)).toString(); } data={commitment_id:c.commitment_id}; break; }
        case 'finalize_expiry': { requireRule(now>=decimal(a.policy.fund_expiry,64),'PROOF_EXPIRED','Fixed expiry has not arrived.'); requireRule(!this.commitments(id).some(c=>!terminal(c)),'UNSETTLED_COMMITMENTS','Settle all elapsed commitments before final expiry.'); if(!a.reserve_expired) { const cr=this.credit(a,'refund',a.policy.refund_beneficiary); cr.available=(BigInt(cr.available)+BigInt(a.ledger.available_upkeep)).toString(); a.ledger.available_upkeep='0'; a.reserve_expired=true; } data={refund_beneficiary:a.policy.refund_beneficiary}; break; }
        case 'claim_provider': case 'claim_refund': {
          const kind=cmd.type==='claim_provider'?'provider':'refund', creditor=cmd.type==='claim_provider'?cmd.provider_id:a.policy.refund_beneficiary; account(creditor); const cr=this.credit(a,kind,creditor); requireRule(cr.pending_operation_id===null,'PAYMENT_PENDING','This creditor already has an unresolved payment.'); requireRule(BigInt(cr.available)>0n,'NO_CREDIT','There is no available credit to claim.'); const ps=this.payments(id); requireRule(ps.filter(p=>p.status==='Pending'||p.status==='Unknown').length<8,'CAPACITY_REACHED','Pending payment capacity reached.'); const operation_id=(ps.reduce((m,p)=>BigInt(p.operation_id)>m?BigInt(p.operation_id):m,0n)+1n).toString();
          p={operation_id,kind,creditor,amount:cr.available,started_at:now.toString(),status:'Pending',receipt:localReceipt(null,'Pending'),resolved_at:null}; cr.available='0'; cr.pending=p.amount; cr.pending_operation_id=operation_id; this.savePayment(id,p);
          const setting=this.store.db.prepare('SELECT value FROM settings WHERE key=?').get('next_payment_outcome'); const outcome=setting?String(setting.value):'success'; this.store.db.prepare('DELETE FROM settings WHERE key=?').run('next_payment_outcome'); this.store.db.prepare('INSERT INTO outbox VALUES(?,?,?,NULL)').run(id,operation_id,outcome); data={operation_id,creditor,amount:p.amount}; break;
        }
        case 'nft_transfer': case 'nft_transfer_call': {
          this.owner(a,actor,cmd.expected_owner_epoch,false); requireRule(cmd.token_id==='archive','INVALID_INPUT','Unknown NFT.',422); account(cmd.receiver_id); requireRule(cmd.receiver_id!==a.owner_id,'INVALID_INPUT','Recipient already owns the archive.',422);
          if(cmd.type==='nft_transfer_call') { requireRule(!a.transfer_call_pending,'TRANSFER_PENDING','Nested transfer-call is unavailable.'); text(cmd.msg,1024,'Receiver message'); requireRule(Object.hasOwn(LOCAL_RECEIVERS,cmd.receiver_id)||(this.config.dev_faults&&cmd.msg==='development:unresolved'),'UNSUPPORTED_LOCAL_RECEIVER','Local transfer-call supports only the explicitly named keep, return, panic and forward test receivers. Use ordinary transfer for a normal account.',422); a.transfer_call_pending={operation_id:(BigInt(a.owner_epoch)+1n).toString(),old_owner:a.owner_id,receiver_id:cmd.receiver_id,started_at:now.toString()}; }
          const old=a.owner_id; a.owner_id=cmd.receiver_id; a.owner_epoch=(decimal(a.owner_epoch,64)+1n).toString(); data={old_owner:old,owner_id:a.owner_id,owner_epoch:a.owner_epoch}; break;
        }
        default: throw new DomainError('INVALID_INPUT','Unknown command type.',422);
      }
      if (['configure_provider','propose_period','nft_transfer','nft_transfer_call'].includes(cmd.type)) a.ledger.security_deposits=(decimal(a.ledger.security_deposits)+1n).toString();
      this.save(a); const receipt=this.event(a,actor,cmd.type,data); const result: CommandResult={asset:clone(a),commitment:c,payment:p,receipt}; this.remember(scope,requestId,envelope,result); return result;
    });
  }
  setNextOutcome(outcome: unknown) { this.localOnly(); requireRule(this.config.dev_faults,'NOT_FOUND','Development faults are disabled.',404); requireRule(outcome==='success'||outcome==='failure'||outcome==='unknown','INVALID_INPUT','Unsupported payment outcome.',422); this.store.db.prepare('INSERT INTO settings VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run('next_payment_outcome',outcome); }
  processPayments(crashAfter?: 'delivery') {
    this.localOnly(); const rows=this.store.db.prepare('SELECT asset_id,id,outcome,delivery FROM outbox').all();
    for(const row of rows) {
      const id=String(row.asset_id), op=String(row.id); let delivery=row.delivery ? String(row.delivery) : null;
      if(!delivery) { delivery=String(row.outcome); this.store.transaction(()=>this.store.db.prepare('UPDATE outbox SET delivery=? WHERE asset_id=? AND id=? AND delivery IS NULL').run(delivery,id,op)); }
      if(crashAfter==='delivery') return;
      this.resolvePayment(id,op,delivery);
    }
  }
  private resolvePayment(id: string, op: string, delivery: string) {
    return this.store.transaction(()=>{
      const a=this.asset(id), p=this.payments(id).find(p=>p.operation_id===op); if(!p || (p.status!=='Pending'&&p.status!=='Unknown')) return;
      const cr=this.credit(a,p.kind,p.creditor); requireRule(cr.pending_operation_id===op && cr.pending===p.amount,'INTEGRITY_ERROR','Pending creditor does not match payment.',500);
      if(delivery==='unknown') { p.status='Unknown'; p.receipt=localReceipt(null,'Unknown'); this.savePayment(id,p); this.save(a); return; }
      cr.pending='0'; cr.pending_operation_id=null; p.status=delivery==='success'?'Succeeded':'Failed'; p.resolved_at=this.now();
      if(delivery==='success') { cr.paid=(BigInt(cr.paid)+BigInt(p.amount)).toString(); a.ledger.principal_paid=(BigInt(a.ledger.principal_paid)+BigInt(p.amount)).toString(); } else cr.available=(BigInt(cr.available)+BigInt(p.amount)).toString();
      p.receipt=this.event(a,null,'payment_resolved',{operation_id:op,status:p.status,creditor:p.creditor,amount:p.amount}); p.receipt.status=p.status; this.savePayment(id,p); this.store.db.prepare('DELETE FROM outbox WHERE asset_id=? AND id=?').run(id,op); this.save(a);
    });
  }
  reconcilePayment(operationId: string) { decimal(operationId,64); const rows=this.store.db.prepare('SELECT asset_id,id,delivery FROM outbox WHERE id=?').all(operationId); requireRule(rows.length===1,'PAYMENT_UNKNOWN','Operation is absent or ambiguous; consult archive-specific history.'); const row=rows[0]!; requireRule(row.delivery && row.delivery!=='unknown','PAYMENT_UNKNOWN','No definitive durable delivery receipt exists. Pending credit cannot be restored from elapsed time.'); this.resolvePayment(String(row.asset_id),String(row.id),String(row.delivery)); return this.asset(String(row.asset_id)); }
  processTransferCalls() {
    this.localOnly(); for(const row of this.store.db.prepare('SELECT id FROM assets').all()) this.store.transaction(()=>{
      const a=this.asset(String(row.id)), lock=a.transfer_call_pending; if(!lock) return;
      // These explicitly named local receiver fixtures are simulated receiver code, not user-provided callback outcomes.
      const behavior=LOCAL_RECEIVERS[lock.receiver_id]; if(!behavior) return;
      if(behavior==='forward' && a.owner_id===lock.receiver_id) { a.owner_id='bob.archivepass.testnet'; a.owner_epoch=(BigInt(a.owner_epoch)+1n).toString(); }
      if((behavior==='return'||behavior==='panic') && a.owner_id===lock.receiver_id) { a.owner_id=lock.old_owner; a.owner_epoch=(BigInt(a.owner_epoch)+1n).toString(); }
      a.transfer_call_pending=null; this.save(a); this.event(a,null,'transfer_call_resolved',{operation_id:lock.operation_id,owner_id:a.owner_id,simulated:true});
    });
  }
  page<T>(items: T[], cursor: string | null, limit = 20): Page<T> { requireRule(Number.isInteger(limit)&&limit>=1&&limit<=50,'INVALID_INPUT','Page limit must be 1 through 50.',422); const start=cursor===null?0:Number(decimal(cursor,64)); requireRule(Number.isSafeInteger(start),'INVALID_INPUT','Invalid cursor.',422); return {items:items.slice(start,start+limit),next_cursor:start+limit<items.length?String(start+limit):null}; }
  list(cursor: string|null=null,limit=20): Page<Asset> { const items=this.store.db.prepare('SELECT id FROM assets ORDER BY rowid DESC').all().map(r=>this.asset(String(r.id))); return this.page(items,cursor,limit); }
  preview(id: string, receiver: string) { account(receiver); const asset=this.asset(id); return {asset,receiver_id:receiver,nonterminal_commitments:this.commitments(id).filter(c=>!terminal(c)),unpaid_credits:asset.credits.filter(c=>BigInt(c.available)+BigInt(c.pending)>0n),disclosures:['Fixed commitments and claims survive transfer.','The caretaker cannot withdraw upkeep.','Local test ledger: selected identities are simulated authentication.']}; }
  observe(id: string, body: Record<string, unknown>, requestId: string) {
    this.localOnly(); this.asset(id); requireRule(this.config.keeper_bindings.some(k=>k.origin===body.source_origin),'INVALID_INPUT','Observation source must be a configured keeper origin.',422); decimal(body.started_at,64); decimal(body.finished_at,64); decimal(body.size_bytes,64); requireRule(typeof body.verified==='boolean' && (body.error===null||typeof body.error==='string'),'INVALID_INPUT','Invalid observation.',422);
    for(const key of ['expected_sha256','actual_sha256']) requireRule(typeof body[key]==='string' && (body[key]===''||/^[a-f0-9]{64}$/.test(body[key] as string)),'INVALID_INPUT','Invalid observation digest.',422);
    const scope=`local:${id}:observation`; return this.store.transaction(()=>{ const replay=this.replay<unknown>(scope,requestId,body); if(replay)return replay; const record={...body,source:'browser_reported',observed_at:this.now()}; const inserted=this.store.db.prepare('INSERT INTO observations(asset_id,body) VALUES(?,?)').run(id,JSON.stringify(record)); const result={observation_id:inserted.lastInsertRowid.toString(),...record}; this.remember(scope,requestId,body,result); return result; });
  }
  export(id: string) { const asset=this.asset(id); return {schema:'archivepass-export-v1',exported_at:this.now(),asset,commitments:this.commitments(id),payments:this.payments(id),events:this.history(id),observations:this.store.db.prepare('SELECT id,body FROM observations WHERE asset_id=? ORDER BY id').all(id).map(r=>({observation_id:String(r.id),...JSON.parse(String(r.body))}))}; }
}
