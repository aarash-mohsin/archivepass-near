import {spawnSync} from 'node:child_process';
for(const args of [['scripts/typecheck.mjs'],['node_modules/vite/bin/vite.js','build']]){const r=spawnSync(process.execPath,args,{stdio:'inherit'});if(r.status!==0)process.exit(r.status??1);}
