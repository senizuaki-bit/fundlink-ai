import {existsSync,readFileSync,writeFileSync,mkdirSync,rmSync,readdirSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'..');
function run(args){const r=spawnSync(process.execPath,args,{cwd:root,stdio:'inherit',env:process.env});if(r.error)throw r.error;if(r.status!==0)process.exit(r.status||1);}
if(!existsSync(path.join(root,'dist/server/wrangler.json')))run(['scripts/run-framework.mjs','build']);
const temp=path.join(root,'.wrangler','fundlink-init');mkdirSync(temp,{recursive:true});
for(const file of readdirSync(path.join(root,'drizzle')).filter(f=>/^\d+_.+\.sql$/.test(f)).sort()){
 // Current migrations only create tables/indexes; making these idempotent also supports upgrades from the earlier local demo.
 const source=readFileSync(path.join(root,'drizzle',file),'utf8').replace(/CREATE TABLE (?!IF NOT EXISTS)/g,'CREATE TABLE IF NOT EXISTS ').replace(/CREATE (UNIQUE )?INDEX (?!IF NOT EXISTS)/g,(_,unique)=>`CREATE ${unique||''}INDEX IF NOT EXISTS `);
 const generated=path.join(temp,file);writeFileSync(generated,source);
 run(['--import','./scripts/sites-env.mjs','./node_modules/wrangler/bin/wrangler.js','d1','execute','DB','--local','--config','dist/server/wrangler.json','--persist-to','.wrangler/state','--file',generated]);
 rmSync(generated);
}
console.log('FundLink local database ready. Existing workspace data preserved.');
