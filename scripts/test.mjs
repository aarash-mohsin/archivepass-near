import {readdirSync} from 'node:fs';import {join} from 'node:path';import {spawnSync} from 'node:child_process';
function walk(dir){return readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(join(dir,e.name)):/\.(test|spec)\.(ts|mjs)$/.test(e.name)?[join(dir,e.name)]:[]);}
const files=walk('tests');if(!files.length)throw new Error('No tests found');const r=spawnSync(process.execPath,['--test',...files],{stdio:'inherit'});process.exit(r.status??1);
