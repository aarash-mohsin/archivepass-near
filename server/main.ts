import { createApplication } from './http.ts';
import { loadConfig } from './config.ts';
const config=loadConfig();const app=createApplication(config);
app.server.listen(config.port,config.host,()=>console.log(`ArchivePass ${config.mode} API listening at http://${config.host}:${config.port}; operator token supplied by environment or data/app/operator-token.`));
for(const signal of ['SIGINT','SIGTERM'] as const)process.on(signal,()=>{void app.close().then(()=>process.exit(0));});
