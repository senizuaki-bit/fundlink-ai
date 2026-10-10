import assert from 'node:assert/strict';
import {test} from 'node:test';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {registerHooks} from 'node:module';

const sql=new DatabaseSync(':memory:');
sql.exec('CREATE TABLE workspaces(owner TEXT,role TEXT,data TEXT,version INTEGER,PRIMARY KEY(owner,role))');
sql.exec(readFileSync(new URL('../drizzle/0003_flywheel.sql',import.meta.url),'utf8'));
const statement=(query,values=[])=>({
 bind(...next){return statement(query,next)},
 async first(){return sql.prepare(query).get(...values)??null},
 async all(){return {results:sql.prepare(query).all(...values)}},
 async run(){harness.mutations.push(query);return {meta:{changes:Number(sql.prepare(query).run(...values).changes)}}}
});
class ApiError extends Error{constructor(message,status=400){super(message);this.status=status}}
const fixtures=new Map();
const harness={db:{prepare:query=>statement(query)},ApiError,user:'alice',mutations:[],calls:[],knowledge:async(user,role)=>fixtures.get(user+':'+role)||emptyKnowledge()};
globalThis.__flywheelServer=harness;
const serverStub='data:text/javascript,'+encodeURIComponent(`export const ApiError=globalThis.__flywheelServer.ApiError;export const db=()=>globalThis.__flywheelServer.db;export async function owner(){if(!globalThis.__flywheelServer.user)throw new ApiError('login required',401);return globalThis.__flywheelServer.user}export function roleOf(request){const role=new URL(request.url).searchParams.get('role');if(!['investor','founder'].includes(role))throw new ApiError('invalid role');return role}export function sameOrigin(request){const origin=request.headers.get('origin');if(origin&&origin!==new URL(request.url).origin)throw new ApiError('bad origin',403)}export function fail(error){return Response.json({error:error instanceof ApiError?error.message:'operation failed'},{status:error.status||503})}`);
registerHooks({resolve(specifier,context,next){
 if(specifier==='@/lib/server'||specifier==='./server'&&context.parentURL?.endsWith('/lib/flywheel-server.ts'))return {url:serverStub,shortCircuit:true};
 if(specifier==='@/lib/flywheel-server')return {url:new URL('../lib/flywheel-server.ts',import.meta.url).href,shortCircuit:true};
 if(specifier==='./knowledge-server'&&context.parentURL?.endsWith('/lib/flywheel-server.ts'))return {url:'data:text/javascript,'+encodeURIComponent(`export async function listKnowledge(...args){globalThis.__flywheelServer.calls.push(args);return globalThis.__flywheelServer.knowledge(...args)}`),shortCircuit:true};
 return next(specifier,context);
}});
const {blankWorkspace}=await import('../lib/model.ts');
const {sampleProfile}=await import('../lib/catalog.ts');
const {emptyKnowledge}=await import('../lib/knowledge-adapter.ts');
const {flywheelReport}=await import('../lib/flywheel-server.ts');
const route=await import('../app/api/flywheel/route.ts');
const now=new Date().toISOString();
const request=(method='GET',role='investor',headers={},body)=>new Request('http://localhost/api/flywheel?role='+role,{method,headers,...(body===undefined?{}:{body})});
const count=(user,role)=>Number(sql.prepare('SELECT COUNT(*) AS n FROM flywheel_evaluations WHERE owner=? AND role=?').get(user,role).n);
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve}};
function setup(user,role='investor',version=1){
 const w=blankWorkspace();w.profile=sampleProfile(role);w.profile.name=user+' '+role;w.version=version;
 w.settings={...w.settings,learning:true,learningConsent:{version:1,grantedAt:new Date(Date.now()-86_400_000).toISOString()}};
 const id=user+'-'+role;
 w.signals=[{id:'exposure-'+id,entityId:id,kind:'exposure',mode:'real',time:now},{id:'interest-'+id,entityId:id,kind:'interest',mode:'real',time:now}];
 sql.prepare('INSERT INTO workspaces VALUES(?,?,?,?)').run(user,role,JSON.stringify(w),version);
 const k=emptyKnowledge();
 k.entities=[{id,name:user+' '+role+' private company',kind:role==='investor'?'company':'fund',canonicalUrl:'',status:'user_provided',summary:'Confidential '+user+' '+role,profile:{sector:'人工智能'},createdAt:now,updatedAt:now}];
 k.sources=[{id:'source-'+id,entityId:id,type:'upload',title:'Private evidence '+id,url:'',canonicalUrl:'',excerpt:'NEVER-EXPOSE-RAW-'+id,publishedAt:null,collectedAt:now,visibility:'private',claimType:'self_disclosed',contentHash:'hash',lineageKey:'lineage',documentId:'document-'+id,extractionMode:'rules',extractionNote:''}];
 k.findings=[{id:'finding-'+id,entityId:id,title:'Restricted finding '+id,finding:'Restricted detailed content',category:'evidence',priority:'high',comparison:'insufficient',claimIds:[],sourceIds:['source-'+id],hypotheses:[],nextAction:'Review original source',reviewStatus:'pending',reviewNote:'',createdAt:now}];
 fixtures.set(user+':'+role,k);return w;
}
setup('alice');setup('alice','founder');setup('bob');

await test('GET builds an owner/role scoped read-only report without persisting or changing workspace',async()=>{
 harness.user='alice';harness.mutations=[];harness.calls=[];
 const before=sql.prepare('SELECT data,version FROM workspaces WHERE owner=? AND role=?').get('alice','investor');
 const response=await route.GET(request());assert.equal(response.status,200);assert.match(response.headers.get('cache-control'),/no-store/);
 const report=await response.json(),text=JSON.stringify(report);
 assert.equal(report.current.role,'investor');assert.equal(report.current.workspaceVersion,1);assert.equal(report.current.id,undefined);assert.deepEqual(report.history,[]);
 assert.match(text,/Restricted finding alice-investor/);assert.ok(!text.includes('bob-investor'));assert.ok(!text.includes('alice-founder'));assert.ok(!text.includes('NEVER-EXPOSE-RAW'));
 assert.deepEqual(harness.calls,[['alice','investor']]);assert.deepEqual(harness.mutations,[]);assert.equal(count('alice','investor'),0);
 assert.deepEqual(sql.prepare('SELECT data,version FROM workspaces WHERE owner=? AND role=?').get('alice','investor'),before);
});

await test('POST persists the actual evaluation and history across independent reads without modifying profile version',async()=>{
 const response=await route.POST(request('POST','investor',{'Content-Type':'application/json'},JSON.stringify({action:'evaluate'})));
 assert.equal(response.status,200);assert.match(response.headers.get('cache-control'),/no-store/);
 const report=await response.json();assert.match(report.current.id,/^cycle_/);assert.equal(report.history.length,1);
 assert.deepEqual(report.history[0],report.current);
 const stored=JSON.parse(sql.prepare('SELECT data FROM flywheel_evaluations WHERE id=?').get(report.current.id).data);
 assert.deepEqual(stored,report.current);assert.equal(count('alice','investor'),1);
 assert.equal(sql.prepare('SELECT version FROM workspaces WHERE owner=? AND role=?').get('alice','investor').version,1);
 const reloaded=await flywheelReport('alice','investor');assert.deepEqual(reloaded.history,[stored]);
 const founder=await flywheelReport('alice','founder');assert.equal(founder.history.length,0);assert.ok(!JSON.stringify(founder).includes('alice-investor'));
 const other=await flywheelReport('bob','investor');assert.equal(other.history.length,0);assert.ok(!JSON.stringify(other).includes('alice-investor'));
});

await test('snapshot retention keeps only thirty entries in the target owner/role, preserving other scopes',async()=>{
 for(let i=0;i<35;i++)sql.prepare('INSERT INTO flywheel_evaluations VALUES(?,?,?,?,?)').run('older-'+i,'alice','investor',new Date(Date.UTC(2020,0,i+1)).toISOString(),JSON.stringify({id:'older-'+i,createdAt:new Date(Date.UTC(2020,0,i+1)).toISOString()}));
 sql.prepare('INSERT INTO flywheel_evaluations VALUES(?,?,?,?,?)').run('bob-history','bob','investor','2020-01-01T00:00:00.000Z',JSON.stringify({id:'bob-history'}));
 sql.prepare('INSERT INTO flywheel_evaluations VALUES(?,?,?,?,?)').run('founder-history','alice','founder','2020-01-01T00:00:00.000Z',JSON.stringify({id:'founder-history'}));
 const report=await flywheelReport('alice','investor',true);
 assert.equal(count('alice','investor'),30);assert.equal(report.history.length,30);assert.ok(report.history.some(s=>s.id===report.current.id));
 assert.ok(!report.history.some(s=>s.id==='older-0'));assert.equal(count('bob','investor'),1);assert.equal(count('alice','founder'),1);
 const dates=report.history.map(s=>s.createdAt);assert.deepEqual(dates,[...dates].sort().reverse());
});

await test('a concurrent revoke or clear changes the workspace version and prevents a stale snapshot insert',async()=>{
 for(const action of ['revoke','clear']){
  const user='concurrent-'+action;const original=setup(user);
  const started=deferred(),complete=deferred(),normal=harness.knowledge;
  harness.knowledge=async(owner,role)=>{if(owner===user){started.resolve();await complete.promise}return fixtures.get(owner+':'+role)||emptyKnowledge()};
  const pending=flywheelReport(user,'investor',true);await started.promise;
  const updated={...original,settings:{...original.settings,learning:false,learningConsent:{...original.settings.learningConsent,revokedAt:now}},signals:action==='clear'?[]:original.signals};
  sql.prepare('UPDATE workspaces SET data=?,version=version+1 WHERE owner=? AND role=?').run(JSON.stringify(updated),user,'investor');
  complete.resolve();await assert.rejects(pending,e=>e.status===409&&/工作区已更新/.test(e.message));
  assert.equal(count(user,'investor'),0,'stale evaluation must never be saved');harness.knowledge=normal;
  const current=await flywheelReport(user,'investor',true);assert.equal(current.current.workspaceVersion,2);assert.equal(current.current.signals.authorized,false);assert.equal(count(user,'investor'),1);
 }
});

await test('missing workspace is readable but cannot persist a cycle, and malformed storage fails without disclosure',async()=>{
 const missing=await flywheelReport('new-user','investor');assert.equal(missing.current.workspaceVersion,0);assert.deepEqual(missing.history,[]);
 await assert.rejects(flywheelReport('new-user','investor',true),e=>e.status===409);assert.equal(count('new-user','investor'),0);
 sql.prepare('INSERT INTO workspaces VALUES(?,?,?,?)').run('bad-storage','investor','{private raw data',1);harness.user='bad-storage';
 const response=await route.GET(request());assert.equal(response.status,503);assert.equal((await response.json()).error,'operation failed');harness.user='alice';
});

await test('routes enforce authentication, role, origin and request bounds without writing rejected requests',async()=>{
 const total=()=>Number(sql.prepare('SELECT COUNT(*) AS n FROM flywheel_evaluations').get().n),before=total();
 harness.user=null;assert.equal((await route.GET(request())).status,401);assert.equal((await route.POST(request('POST','investor',{},'{"action":"evaluate"}'))).status,401);
 harness.user='alice';
 assert.equal((await route.GET(request('GET','administrator'))).status,400);
 assert.equal((await route.POST(request('POST','administrator',{},'{"action":"evaluate"}'))).status,400);
 assert.equal((await route.POST(request('POST','investor',{Origin:'https://other.example'},'{"action":"evaluate"}'))).status,403);
 for(const body of ['{','null','[]','{}','{"action":"train"}','x'.repeat(1001)])assert.equal((await route.POST(request('POST','investor',{},body))).status,400);
 assert.equal((await route.POST(request('POST','investor',{'Content-Length':'2001'},'{"action":"evaluate"}'))).status,400);
 assert.equal(total(),before);
});

await test('client owner injection cannot read or persist another identity’s private evaluation',async()=>{
 harness.user='alice';const bobBefore=count('bob','investor');
 const response=await route.POST(request('POST','investor',{},JSON.stringify({action:'evaluate',owner:'bob',role:'founder'})));
 assert.equal(response.status,200);const report=await response.json();assert.equal(report.current.role,'investor');
 assert.ok(!JSON.stringify(report).includes('bob-investor'));assert.equal(count('bob','investor'),bobBefore);
 assert.equal(sql.prepare('SELECT owner,role FROM flywheel_evaluations WHERE id=?').get(report.current.id).owner,'alice');
 harness.user="' OR 1=1 --";const outsider=await route.GET(request());assert.equal(outsider.status,200);
 const outside=await outsider.json();assert.deepEqual(outside.history,[]);assert.ok(!JSON.stringify(outside).includes('Restricted finding'));harness.user='alice';
});
sql.close();
