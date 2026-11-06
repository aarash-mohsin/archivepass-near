import {spawnSync} from 'node:child_process';
for(const config of ['tsconfig.server.json','tsconfig.web.json']){const r=spawnSync(process.execPath,['node_modules/typescript/bin/tsc','-p',config],{stdio:'inherit'});if(r.status!==0)process.exit(r.status??1);}
