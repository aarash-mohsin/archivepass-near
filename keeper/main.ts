import { loadKeeperConfig } from './config.ts';
import { createKeeper } from './service.ts';
const config=loadKeeperConfig();const app=createKeeper(config);
app.server.listen(config.port,config.host,()=>{console.log(`ArchivePass ${config.provider_id} keeper at http://${config.host}:${config.port} (${config.mode}); separate local directory, not independent infrastructure.`);app.keeper.start();void(async()=>{for(const id of config.approved_assets)try{await app.keeper.importAsset(id);}catch(error){console.error('Explicit keeper import failed:',error instanceof Error?error.message:'unknown');}})();});
for(const signal of ['SIGINT','SIGTERM'] as const)process.on(signal,()=>void app.close().then(()=>process.exit(0)));
