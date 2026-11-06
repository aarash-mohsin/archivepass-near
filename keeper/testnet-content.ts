import type {KeeperService} from './service.ts';
/** A single bounded recovery task; settlement never waits for source availability. */
export function startContentRecovery(keeper:KeeperService,id:string,options:{retry_ms?:number;onError?:(error:unknown)=>void}={}){
 let stopped=false,timer:ReturnType<typeof setTimeout>|undefined,pending:Promise<void>|undefined,failures=0;
 const check=()=>{if(stopped||pending)return pending??Promise.resolve();pending=(async()=>{try{await keeper.importAsset(id);failures=0;}catch(error){failures++;options.onError?.(error);}finally{pending=undefined;if(!stopped&&failures){timer=setTimeout(()=>void check(),Math.min(300000,(options.retry_ms??30000)*2**Math.min(failures,4)));timer.unref();}}})();return pending;};
 void check();return{check,stop:async()=>{stopped=true;if(timer)clearTimeout(timer);await pending;}};
}
