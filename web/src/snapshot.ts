/** A forced post-command read supersedes an older poll; route invalidation
 * prevents either success or failure from a previous page changing this one. */
export class SnapshotCoordinator {
  private generation=0;
  private active=0;
  invalidate(){this.generation++;}
  async run<T>(load:()=>Promise<T>,apply:(value:T)=>void,failed:(error:unknown)=>void,force=false):Promise<void>{
    if(this.active&&!force)return;
    const generation=++this.generation;this.active++;
    try{const value=await load();if(generation===this.generation)apply(value);}
    catch(error){if(generation!==this.generation)return;failed(error);throw error;}
    finally{this.active--;}
  }
}
export function fundingState(asset:{reserve_expired:boolean;policy:{fund_expiry:string};ledger:{principal_in:string;available_upkeep:string;reserved_upkeep:string}},now:string):string {
  if(asset.reserve_expired)return 'Reserve expired';
  if(BigInt(now)>=BigInt(asset.policy.fund_expiry))return 'Term ended · settle unused funds';
  if(BigInt(asset.ledger.principal_in)===0n)return 'Awaiting upkeep';
  return BigInt(asset.ledger.available_upkeep)+BigInt(asset.ledger.reserved_upkeep)>0n?'Upkeep funded':'Upkeep exhausted';
}
