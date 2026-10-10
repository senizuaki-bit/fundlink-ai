import {spawnSync} from 'node:child_process';
import {readdirSync} from 'node:fs';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'..');
const env={...process.env};delete env.FUNDLINK_TEST_URL;
for(const file of readdirSync(path.join(root,'scripts')).filter(f=>/^verify(?:-[a-z-]+)?\.mjs$/.test(f)).sort()){
 console.log('\n'+file);
 const result=spawnSync(process.execPath,['--import','./scripts/test-loader.mjs','scripts/'+file],{cwd:root,stdio:'inherit',env});
 if(result.error)throw result.error;if(result.status)process.exit(result.status);
}
console.log('\nAll offline verification suites passed.');
