import {useCallback,useEffect,useMemo,useState} from 'react';
import type {ReactNode} from 'react';
import {ASSET_ID,explorerTx,readLive,runChecks,timeOf,view} from '../../shared/live.ts';
import type {Check,ChainEvent,LiveState} from '../../shared/live.ts';
import {formatNear,parseNear} from '../../shared/amounts.ts';
import type {Commitment} from '../../shared/types.ts';
import {call,connect,connectedAccount,disconnect,signMessage} from './wallet.ts';
import {checkHolder,holderMessage,RECIPIENT} from './nep413.ts';
import type {HolderProof} from './nep413.ts';
import guideUrl from '../../fixtures/stewardship-guide.txt?url';
import wasmUrl from '../../contract/target/near/archivepass.wasm?url';

const REPO='https://github.com/aarash-mohsin/archivepass-near';
const RAW_WASM='https://raw.githubusercontent.com/aarash-mohsin/archivepass-near/main/contract/target/near/archivepass.wasm';
type Tab='verify'|'history'|'fund'|'holder';
const TABS:[Tab,string][]=[['verify','Verify'],['history','History'],['fund','Fund'],['holder','Holder console']];
const tabFromHash=():Tab=>{const t=location.hash.replace(/^#\/?/,'') as Tab;return TABS.some(([id])=>id===t)?t:'verify';};
const shortTx=(h:string)=>h.slice(0,8)+'…';
const accountUrl=(a:string)=>`https://testnet.nearblocks.io/address/${a}`;
const fmtTime=(ns:string)=>timeOf(ns).toLocaleString(undefined,{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit',second:'2-digit'});
const utc=(ns:string)=>timeOf(ns).toISOString().replace('T',' ').slice(0,19)+' UTC';
function N({v}:{v:string|bigint}){return <span className="near" title={`${v} yoctoNEAR`}>{formatNear(v.toString())}<small> NEAR</small></span>;}
function T({ns}:{ns:string}){return <time dateTime={timeOf(ns).toISOString()} title={utc(ns)}>{fmtTime(ns)}</time>;}
function Acct({id}:{id:string}){return <a className="acct" href={accountUrl(id)} target="_blank" rel="noreferrer">{id}</a>;}
function Tx({hash}:{hash:string}){return <a className="tx" href={explorerTx(hash)} target="_blank" rel="noreferrer">tx {shortTx(hash)}<span aria-hidden="true"> ↗</span></a>;}
function Pill({status}:{status:Check['status']|'RUN'}){return <span className={`pill ${status.toLowerCase()}`}>{status==='RUN'?<span className="dot-spin"/>:status}</span>;}

async function bytes(url:string){const r=await fetch(url,{cache:'no-store'});if(!r.ok)throw new Error(`HTTP ${r.status}`);return new Uint8Array(await r.arrayBuffer());}

export default function App(){
  const[tab,setTab]=useState<Tab>(tabFromHash());
  const[state,setState]=useState<LiveState|null>(null),[source,setSource]=useState<'live'|'snapshot'|''>('');
  const[checks,setChecks]=useState<Check[]>([]),[shown,setShown]=useState(0),[error,setError]=useState(''),[loading,setLoading]=useState(true);
  const[account,setAccount]=useState(''),[walletBusy,setWalletBusy]=useState(false),[walletError,setWalletError]=useState('');
  useEffect(()=>{const f=()=>{setTab(tabFromHash());window.scrollTo({top:0});};addEventListener('hashchange',f);return()=>removeEventListener('hashchange',f);},[]);
  useEffect(()=>{void connectedAccount().then(setAccount);},[]);
  const load=useCallback(async()=>{
    setLoading(true);setError('');setShown(0);setChecks([]);
    let value:LiveState,from:'live'|'snapshot'='live';
    try{
      value=await readLive();
      if(value.history_source==='unavailable'){const snap=await fetch('./snapshot.json').then(r=>r.json()).catch(()=>null) as LiveState|null;if(snap?.events?.length){value={...value,events:snap.events,old_owner_supply:{...snap.old_owner_supply,...value.old_owner_supply},history_source:'fastnear-tx-api',history_error:`Live history API unavailable; events from the snapshot recorded ${snap.observed_at}.`};}}
    }catch(cause){
      const snap=await fetch('./snapshot.json').then(r=>r.json()).catch(()=>null) as LiveState|null;
      if(!snap){setError(`NEAR testnet RPC could not be reached: ${cause instanceof Error?cause.message:cause}`);setLoading(false);return;}
      value=snap;from='snapshot';
    }
    setState(value);setSource(from);
    let wasm:Uint8Array|null=null,wasm_source='';
    try{wasm=await bytes(RAW_WASM);wasm_source='archivepass.wasm from the GitHub repository';}catch{try{wasm=await bytes(wasmUrl);wasm_source='archivepass.wasm shipped with this page';}catch{wasm=null;}}
    const file=await bytes(guideUrl);
    setChecks(await runChecks(value,{file,wasm,wasm_source}));setLoading(false);
  },[]);
  useEffect(()=>{void load();},[load]);
  useEffect(()=>{if(shown>=checks.length)return;const t=setTimeout(()=>setShown(n=>n+1),shown===0?250:160);return()=>clearTimeout(t);},[shown,checks.length]);
  const passed=checks.filter(c=>c.status==='PASS').length,failed=checks.filter(c=>c.status==='FAIL').length;
  async function walletAction(action:()=>Promise<void>){setWalletBusy(true);setWalletError('');try{await action();}catch(e){setWalletError(e instanceof Error?e.message:String(e));}finally{setWalletBusy(false);}}
  const asset=state?.asset;
  return <>
    <div className="strip"><span className="live-dot"/>Live on NEAR testnet · reads public RPC from your browser · nothing is signed unless you connect a wallet<span className="strip-right">ARCHIVEPASS / LIVE</span></div>
    <header className="top">
      <a className="brand" href="#/verify"><span className="brand-mark" aria-hidden="true">▥</span><span>Archive<span className="light">Pass</span></span></a>
      <nav aria-label="Sections">{TABS.map(([id,label])=><a key={id} href={`#/${id}`} className={tab===id?'active':''} aria-current={tab===id?'page':undefined}>{label}</a>)}<a href={REPO} target="_blank" rel="noreferrer" className="ext">Code ↗</a></nav>
      <div className="wallet">{account?<><span className="wallet-chip" title={account}><span className="live-dot"/>{account}</span><button className="link" disabled={walletBusy} onClick={()=>void walletAction(async()=>{await disconnect();setAccount('');})}>Disconnect</button></>:<button className="btn ghost" disabled={walletBusy} onClick={()=>void walletAction(async()=>setAccount(await connect()))}>{walletBusy?'Opening wallet…':'Connect testnet wallet'}</button>}</div>
    </header>
    <main>
      <section className="hero">
        <div>
          <p className="eyebrow">ONE ARCHIVE · ONE NFT · ITS OWN NEAR ACCOUNT</p>
          <h1>{asset?.manifest.title??'Public stewardship field guide'}</h1>
          <p className="lead">Other NFT wallets carry a balance through a sale. ArchivePass carries <em>ongoing obligations to third parties</em> through a handover: storage keepers are paid only for Merkle proofs of the file, and the asset account has no keys.</p>
          <p className="asset-id"><code>{ASSET_ID}</code> <a href={accountUrl(ASSET_ID)} target="_blank" rel="noreferrer">explorer ↗</a></p>
        </div>
        <aside className="summary" aria-live="polite">
          <div><small>Caretaker (NFT holder)</small><strong>{asset?<Acct id={asset.owner_id}/>:'…'}</strong><span className="sub">{asset?`owner epoch ${asset.owner_epoch}`:''}</span></div>
          <div><small>Upkeep available</small><strong>{asset?<N v={asset.ledger.available_upkeep}/>:'…'}</strong><span className="sub">{asset?<>of <N v={asset.ledger.principal_in}/> funded</>:''}</span></div>
          <div><small>Access keys on the asset</small><strong className={state&&state.access_keys.length===0?'good':''}>{state?state.access_keys.length:'…'}</strong><span className="sub">{state?.access_keys.length===0?'keyless: code and rules are final':''}</span></div>
          <div><small>Live checks</small><strong className={checks.length&&!failed&&shown>=checks.length?'good':''}>{checks.length?`${Math.min(shown,passed)} / ${checks.filter(c=>c.status!=='INFO').length}`:'…'}</strong><span className="sub">{loading?'running in your browser…':failed?`${failed} failed`:'passed'}</span></div>
        </aside>
      </section>
      {source==='snapshot'&&<div className="note warn">The testnet RPC could not be reached, so this page shows the snapshot recorded at {state?.observed_at}. Retry for live data.</div>}
      {state?.history_error&&<div className="note">{state.history_error}</div>}
      {error&&<div className="note bad" role="alert">{error} <button className="link" onClick={()=>void load()}>Retry</button></div>}
      {tab==='verify'&&<Verify checks={checks} shown={shown} loading={loading} reload={load} passed={passed} failed={failed}/>}
      {tab==='history'&&state&&<History state={state}/>}
      {tab==='fund'&&state&&<Fund state={state} account={account} busy={walletBusy} walletAction={walletAction} setAccount={setAccount} reload={load}/>}
      {tab==='holder'&&state&&<Holder state={state} account={account} busy={walletBusy} walletAction={walletAction} setAccount={setAccount} reload={load}/>}
      {walletError&&<div className="note bad" role="alert">{walletError} <button className="link" onClick={()=>setWalletError('')}>Dismiss</button></div>}
      {!state&&!error&&<div className="loading"><span className="dot-spin"/> Reading the asset from NEAR testnet…</div>}
    </main>
    <footer><span className="brand small">ArchivePass</span><p>A transferable caretaker role for public archives, with its upkeep fund and storage agreements attached. Built for the NEAR Hackathon, <em>NFTs That Do Something</em>.</p><p className="honest">A passed challenge proves a keeper produced the requested chunk in time. It does not prove continuous uptime or an independent copy. Testnet only.</p></footer>
  </>;
}

function Section({eyebrow,title,children,aside}:{eyebrow:string;title:string;children:ReactNode;aside?:ReactNode}){
  return <section className="section"><div className="section-head"><div><p className="eyebrow">{eyebrow}</p><h2>{title}</h2></div>{aside}</div>{children}</section>;
}

function Verify({checks,shown,loading,reload,passed,failed}:{checks:Check[];shown:number;loading:boolean;reload:()=>Promise<void>;passed:number;failed:number}){
  const done=!loading&&shown>=checks.length;
  return <Section eyebrow="DATA ROOM · CHECKED LIVE IN YOUR BROWSER" title="Don't trust the README. Check the chain." aside={<button className="btn ghost" disabled={loading} onClick={()=>void reload()}>{loading?'Checking…':'Run the checks again ↻'}</button>}>
    <p className="intro">Each line below is computed now, from public NEAR testnet RPC and the asset's transaction history. The file's hash and Merkle root are recomputed here, and every keeper's Merkle proof is re-verified from its transaction arguments.</p>
    <ol className="checks">{checks.map((c,i)=>{const visible=i<shown;return <li key={c.id} className={visible?'in':'wait'}>
      <Pill status={visible?c.status:'RUN'}/>
      <div><h3>{c.title}</h3>{visible&&<><p>{c.detail}</p>{c.txs.length>0&&<div className="txs">{[...new Set(c.txs)].slice(0,4).map(h=><Tx key={h} hash={h}/>)}</div>}</>}</div>
    </li>;})}{loading&&!checks.length&&Array.from({length:6},(_,i)=><li key={i} className="wait"><Pill status="RUN"/><div><h3 className="ghost-line"/></div></li>)}</ol>
    {done&&<div className={`verdict ${failed?'bad':'good'}`}><strong>{passed} passed, {failed} failed</strong><span>The same checks run from a terminal: <code>pnpm install && npm run verify</code></span></div>}
  </Section>;
}

function label(e:ChainEvent,commitments:Commitment[]):{title:ReactNode;tone:string}|null{
  const c=(id:unknown)=>commitments.find(x=>x.commitment_id===String(id));
  switch(e.event){
    case 'asset_created':return {title:<>Asset created as its own account, with no access keys</>,tone:'mint'};
    case 'upkeep_funded':return {title:<>Upkeep funded: <N v={e.data.amount}/></>,tone:'money'};
    case 'operations_funded':return {title:<>Operations funded: <N v={e.data.amount}/></>,tone:'money'};
    case 'period_proposed':return {title:<>Period #{e.data.commitment.commitment_id} booked with <Acct id={e.data.commitment.provider_id}/> for <N v={e.data.commitment.rate}/>, at owner epoch {e.data.commitment.proposed_owner_epoch}</>,tone:'book'};
    case 'period_accepted':return {title:<>Keeper <Acct id={c(e.data.commitment_id)?.provider_id??e.signer}/> accepted period #{e.data.commitment_id}</>,tone:'book'};
    case 'nft_transfer':return {title:<>NFT handed over: <Acct id={e.data.old_owner_id}/> → <Acct id={e.data.new_owner_id}/></>,tone:'handover'};
    case 'challenge_opened':return {title:<>Challenge on period #{e.data.commitment_id}: the contract picked chunk {e.data.challenge.chunk_index}</>,tone:'proof'};
    case 'sampled_response_accepted':return {title:<>Merkle proof accepted for period #{e.data.commitment_id} (chunk {e.data.chunk_index}); <Acct id={e.data.payee}/> earned <N v={e.data.rate}/></>,tone:'proof'};
    case 'payment_resolved':return {title:<>{e.data.success?'Paid':'Payment failed and was re-credited:'} <N v={e.data.amount}/> to <Acct id={e.data.creditor}/></>,tone:e.data.success?'money':'bad'};
    case 'period_missed':return {title:<>Period #{e.data.commitment_id} missed ({String(e.data.reason).replaceAll('_',' ')}): nothing paid, the reservation went back to the fund</>,tone:'bad'};
    case 'reserve_expired':return {title:<>Reserve expired: <N v={e.data.amount}/> credited to <Acct id={e.data.beneficiary}/></>,tone:'money'};
    case 'transfer_call_resolved':return {title:<>Transfer call resolved ({e.data.returned?'returned':'kept'})</>,tone:'handover'};
    default:return null;
  }
}

function History({state}:{state:LiveState}){
  const {asset,commitments,events}=state;
  const transfers=events.filter(e=>e.event==='nft_transfer');
  const created=events.find(e=>e.event==='asset_created');
  const holders=useMemo(()=>{
    const first=events.find(e=>e.event==='nft_mint')?.data.owner_id??transfers[0]?.data.old_owner_id??asset.owner_id;
    const list=[{account:first as string,from:created?.at??asset.created_at,to:transfers[0]?.at??null,epoch:0,tx:created?.tx}];
    transfers.forEach((t,i)=>list.push({account:t.data.new_owner_id,from:t.at,to:transfers[i+1]?.at??null,epoch:i+1,tx:t.tx}));
    return list;
  },[events,asset]);
  const funded=events.filter(e=>e.event==='upkeep_funded');
  const paid=events.filter(e=>e.event==='payment_resolved'&&e.data.success);
  const missed=commitments.filter(c=>c.state==='Missed');
  const rows=events.map(e=>({e,l:label(e,commitments)})).filter(x=>x.l).reverse();
  const handoverAt=transfers[0]?BigInt(transfers[0].at):null;
  return <>
    <Section eyebrow="PER-NFT HISTORY · FROM CHAIN EVENTS" title="Who held it, what came in, who was paid.">
      <div className="holders">{holders.map(h=><div key={h.epoch} className={`holder ${h.to?'':'current'}`}><small>EPOCH {h.epoch} · {h.to?'FORMER CARETAKER':'CURRENT CARETAKER'}</small><strong><Acct id={h.account}/></strong><span><T ns={h.from}/> → {h.to?<T ns={h.to}/>:'now'}</span>{h.tx&&<Tx hash={h.tx}/>}</div>)}</div>
      <div className="stats">
        <div><small>Money in</small><N v={asset.ledger.principal_in}/><span>{funded.length} contribution{funded.length===1?'':'s'}</span></div>
        <div><small>Paid to keepers</small><N v={asset.ledger.principal_paid}/><span>{paid.length} payouts, each for a proof</span></div>
        <div><small>Missed periods</small><b>{missed.length}</b><span>unpaid; reservation returned</span></div>
        <div><small>Still available</small><N v={asset.ledger.available_upkeep}/><span>for future service</span></div>
      </div>
    </Section>
    <Section eyebrow="SERVICE PERIODS · get_commitments" title="Every booked obligation and how it ended.">
      <div className="table-wrap"><table><thead><tr><th>#</th><th>Keeper</th><th>Window</th><th>Booked under</th><th>Result</th><th>Fee</th></tr></thead><tbody>{commitments.map(c=>{const beforeHandover=handoverAt!==null&&BigInt(c.proposed_owner_epoch)<BigInt(asset.owner_epoch);return <tr key={c.commitment_id}>
        <td>{c.commitment_id}</td><td><Acct id={c.provider_id}/></td><td><T ns={c.start}/> <span className="muted">+{Number(BigInt(c.end)-BigInt(c.start))/1e9}s</span></td>
        <td>epoch {c.proposed_owner_epoch}{beforeHandover&&<span className="flag">booked before the handover</span>}</td>
        <td><span className={`state ${c.state.toLowerCase()}`}>{c.state}</span>{c.challenge&&<span className="muted"> chunk {c.challenge.chunk_index}</span>}{c.missed_reason&&<span className="muted"> {c.missed_reason.replaceAll('_',' ')}</span>}</td>
        <td><N v={c.rate}/></td></tr>;})}</tbody></table></div>
    </Section>
    <Section eyebrow={`EVENT LOG · ${rows.length} EVENTS FROM ${new Set(events.map(e=>e.tx)).size} TRANSACTIONS`} title="The full story, newest first.">
      <ol className="events">{rows.map(({e,l},i)=><li key={e.tx+i} className={l!.tone}><span className="ev-dot"/><div><p className="ev-meta"><T ns={e.at}/> · signed by <Acct id={e.signer}/> · <code>{e.method}</code></p><p className="ev-title">{l!.title}</p></div><Tx hash={e.tx}/></li>)}</ol>
    </Section>
  </>;
}

interface WalletProps {state:LiveState;account:string;busy:boolean;walletAction:(a:()=>Promise<void>)=>Promise<void>;setAccount:(a:string)=>void;reload:()=>Promise<void>;}

function Fund({state,account,busy,walletAction,setAccount,reload}:WalletProps){
  const {asset}=state;const[amount,setAmount]=useState('0.01'),[tx,setTx]=useState('');
  const open=!asset.reserve_expired&&Date.now()*1e6<Number(asset.policy.fund_expiry);
  let valid=true;try{valid=BigInt(parseNear(amount))>0n;}catch{valid=false;}
  return <Section eyebrow="FUND THIS ARCHIVE · fund_upkeep · OPEN TO ANY ACCOUNT" title="Add to the upkeep fund from your wallet.">
    <div className="fund-grid">
      <div className="panel">
        <div className="ledger">{[['Funded in total',asset.ledger.principal_in],['Available',asset.ledger.available_upkeep],['Reserved for booked service',asset.ledger.reserved_upkeep],['Paid to keepers',asset.ledger.principal_paid]].map(([k,v])=><div key={k}><small>{k}</small><N v={v}/></div>)}</div>
        <form onSubmit={e=>{e.preventDefault();void walletAction(async()=>{let who=account;if(!who){who=await connect();setAccount(who);}setTx('');const hash=await call(ASSET_ID,{method:'fund_upkeep',args:{version_id:'v1'},deposit:parseNear(amount),gas:'30000000000000'});setTx(hash);await reload();});}}>
          <label htmlFor="amount">Contribution (testnet NEAR)</label>
          <div className="row"><input id="amount" inputMode="decimal" value={amount} onChange={e=>setAmount(e.target.value)} aria-invalid={!valid}/><button className="btn primary" disabled={busy||!open||!valid}>{busy?'Waiting for the wallet…':account?'Fund this archive':'Connect wallet and fund'}</button></div>
          <small>{open?<>Signed by your wallet as <code>fund_upkeep {'{"version_id":"v1"}'}</code> with the amount attached. Funding closes <T ns={asset.policy.fund_expiry}/>.</>:'Funding has closed for this asset.'}</small>
        </form>
        {tx&&<div className="note good">Funded. Your transaction: <Tx hash={tx}/>. The ledger above and the History tab now include it.</div>}
      </div>
      <div className="panel quiet">
        <h3>Where your money can go</h3>
        <ul className="rules">
          <li><b>To a keeper</b>, only for a period it accepted and then proved with a Merkle proof of a random chunk.</li>
          <li><b>To <Acct id={asset.policy.refund_beneficiary}/></b>, whatever is left after <T ns={asset.policy.fund_expiry}/>. That address was fixed at creation.</li>
          <li><b>Nowhere else.</b> The contract has no withdrawal method, the caretaker can't take it, and the account has no keys, so the code can't be changed.</li>
        </ul>
        <h3>No wallet? Use the CLI</h3>
        <pre>near call {ASSET_ID} fund_upkeep '{'{"version_id":"v1"}'}' --deposit 0.01 --accountId YOU.testnet</pre>
      </div>
    </div>
  </Section>;
}

function Holder({state,account,busy,walletAction,setAccount,reload}:WalletProps){
  const {asset,events,commitments}=state;
  const[proof,setProof]=useState<HolderProof|null>(null),[lookup,setLookup]=useState(''),[lookupResult,setLookupResult]=useState<ReactNode>(null);
  const formerOwners=events.filter(e=>e.event==='nft_transfer').map(e=>e.data.old_owner_id as string);
  async function prove(){let who=account;if(!who){who=await connect();setAccount(who);}const nonce=crypto.getRandomValues(new Uint8Array(32));const message=holderMessage(who);const signed=await signMessage(message,RECIPIENT,nonce);setProof(await checkHolder(signed,message,nonce));}
  async function check(id:string){const supply=await view<string>('nft_supply_for_owner',{account_id:id});setLookupResult(supply==='1'?<><b className="good">Holds the NFT.</b> <Acct id={id}/> is the current caretaker at epoch {asset.owner_epoch}.</>:formerOwners.includes(id)?<><b className="bad">Former caretaker, no access.</b> <Acct id={id}/> handed the NFT over. Its owner calls now fail with <code>OWNER_REQUIRED</code>, and bookings it made earlier stay fixed.</>:<><b>Never held it.</b> <Acct id={id}/> holds 0 ArchivePass tokens.</>);}
  return <Section eyebrow="HOLDER-ONLY CONSOLE · NEP-413 SIGNED MESSAGE" title="Only the current caretaker gets in.">
    <div className="fund-grid">
      <div className="panel">
        <ol className="steps"><li className={account?'done':''}>Connect a testnet wallet</li><li className={proof?'done':''}>Sign a message (free, no transaction)</li><li className={proof?.is_holder?'done':''}>The page checks the signature, the key and <code>nft_token</code></li></ol>
        <button className="btn primary" disabled={busy} onClick={()=>void walletAction(prove)}>{busy?'Waiting for the wallet…':account?'Prove I hold the NFT':'Connect wallet and prove'}</button>
        {proof&&<ul className="proof">
          <li className={proof.signature_valid?'ok':'no'}>NEP-413 signature over the message {proof.signature_valid?'is valid':'is not valid'}</li>
          <li className={proof.full_access?'ok':'no'}>{proof.public_key.slice(0,18)}… {proof.full_access?'is a full-access key of':'is not a full-access key of'} {proof.account}</li>
          <li className={proof.owner===proof.account?'ok':'no'}>nft_token owner is {proof.owner} (epoch {proof.owner_epoch})</li>
        </ul>}
        {proof&&!proof.is_holder&&<div className="note bad"><b>Locked.</b> {proof.account} is not the caretaker. {formerOwners.includes(proof.account)?'It held the NFT before the handover, and lost every owner right with it.':''}</div>}
        {proof?.is_holder&&<Console state={state} account={proof.account} busy={busy} walletAction={walletAction} reload={reload} commitments={commitments}/>}
      </div>
      <div className="panel quiet">
        <h3>Check any account, no wallet needed</h3>
        <form className="row" onSubmit={e=>{e.preventDefault();if(lookup.trim())void walletAction(()=>check(lookup.trim()));}}><input value={lookup} onChange={e=>setLookup(e.target.value)} placeholder="account.testnet" aria-label="Account to check"/><button className="btn ghost" disabled={busy}>Check</button></form>
        <div className="quick">{[asset.owner_id,...formerOwners].map(a=><button key={a} className="link" onClick={()=>{setLookup(a);void walletAction(()=>check(a));}}>{a}</button>)}</div>
        {lookupResult&&<p className="lookup">{lookupResult}</p>}
        <h3>What actually stops the old caretaker</h3>
        <p>The console is a convenience. The contract is the real gate: every owner method requires <code>predecessor = owner_id</code> and the current <code>expected_owner_epoch</code>, so a signature made before a handover is rejected as <code>STALE_OWNER</code>. See <a href={`${REPO}/blob/main/THREAT_MODEL.md`} target="_blank" rel="noreferrer">THREAT_MODEL.md</a>.</p>
      </div>
    </div>
  </Section>;
}

function Console({state,account,busy,walletAction,reload,commitments}:{state:LiveState;account:string;busy:boolean;walletAction:(a:()=>Promise<void>)=>Promise<void>;reload:()=>Promise<void>;commitments:Commitment[]}){
  const {asset}=state,policy=asset.policy;
  const[provider,setProvider]=useState(policy.eligible_providers[0]),[receiver,setReceiver]=useState(''),[tx,setTx]=useState('');
  const dur=BigInt(policy.period_duration),origin=BigInt(policy.service_origin),now=BigInt(Date.now())*1_000_000n;
  let slot=(now>origin?(now-origin)/dur:0n)+3n;while(commitments.some(c=>c.provider_id===provider&&c.slot===slot.toString()))slot++;
  const start=origin+slot*dur;
  const open=commitments.filter(c=>!['Earned','Missed'].includes(c.state));
  return <div className="console">
    <p className="eyebrow">UNLOCKED FOR {account}</p>
    <h3>Book a service period</h3>
    <p className="muted">Reserves {formatNear(policy.max_provider_rate)} NEAR from the fund for one {Number(dur/1_000_000_000n)}-second period starting {timeOf(start.toString()).toLocaleTimeString()}. The keeper must accept it before it starts; otherwise it expires unpaid and the money returns to the fund.</p>
    <div className="row"><select value={provider} onChange={e=>setProvider(e.target.value)} aria-label="Keeper">{policy.eligible_providers.map(p=><option key={p}>{p}</option>)}</select>
    <button className="btn primary" disabled={busy} onClick={()=>void walletAction(async()=>{setTx(await call(ASSET_ID,{method:'propose_period',args:{provider_id:provider,slot:slot.toString(),rate:policy.max_provider_rate,expected_owner_epoch:asset.owner_epoch},deposit:'1',gas:'100000000000000'}));await reload();})}>Book slot {slot.toString()}</button></div>
    <h3>Hand the archive on</h3>
    <p className="muted">Moves the NFT and the right to book future service. {open.length} open commitment{open.length===1?'':'s'}, all earned fees and the refund address stay as they are.</p>
    <div className="row"><input value={receiver} onChange={e=>setReceiver(e.target.value)} placeholder="next-caretaker.testnet" aria-label="Next caretaker"/><button className="btn ghost" disabled={busy||!receiver.trim()} onClick={()=>void walletAction(async()=>{setTx(await call(ASSET_ID,{method:'nft_transfer',args:{receiver_id:receiver.trim(),token_id:'archive',approval_id:null,memo:'ArchivePass holder console'},deposit:'1',gas:'100000000000000'}));await reload();})}>Transfer NFT</button></div>
    {tx&&<div className="note good">Sent: <Tx hash={tx}/></div>}
  </div>;
}
