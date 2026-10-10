import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {registerHooks} from 'node:module';

const sql=new DatabaseSync(':memory:');sql.exec('PRAGMA foreign_keys=ON');
for(const name of ['0000_magenta_stardust.sql','0001_knowledge.sql','0002_watch_schedules.sql','0003_flywheel.sql','0004_platform_flywheel.sql'])sql.exec(readFileSync(new URL('../drizzle/'+name,import.meta.url),'utf8'));
class ApiError extends Error{constructor(message,status=400){super(message);this.status=status}}
const harness={user:'alice',failDelete:false,failProjection:false,beforeBatch:null,batches:0};
const statement=(query,values=[])=>({bind(...next){return statement(query,next)},async first(){return sql.prepare(query).get(...values)??null},async all(){return {results:sql.prepare(query).all(...values)}},async run(){if(harness.failDelete&&/^DELETE FROM flywheel_evaluations/.test(query)){harness.failDelete=false;throw Error('simulated DB failure')};if(harness.failProjection&&/^INSERT INTO platform_events/.test(query)){harness.failProjection=false;throw Error('simulated projection failure')};return {meta:{changes:Number(sql.prepare(query).run(...values).changes)}}}});
harness.db={prepare:query=>statement(query),batch:async items=>{harness.batches++;if(harness.beforeBatch){const callback=harness.beforeBatch;harness.beforeBatch=null;callback()}sql.exec('BEGIN');try{const results=[];for(const item of items)results.push(await item.run());sql.exec('COMMIT');return results}catch(error){sql.exec('ROLLBACK');throw error}}};
harness.ApiError=ApiError;globalThis.__flywheelApi=harness;
const stub='data:text/javascript,'+encodeURIComponent(`export const ApiError=globalThis.__flywheelApi.ApiError;export const db=()=>globalThis.__flywheelApi.db;export async function owner(){if(!globalThis.__flywheelApi.user)throw new ApiError('login required',401);return globalThis.__flywheelApi.user}export function roleOf(request){const role=new URL(request.url).searchParams.get('role');if(!['investor','founder'].includes(role))throw new ApiError('invalid role');return role}export function sameOrigin(request){const origin=request.headers.get('origin');if(origin&&origin!==new URL(request.url).origin)throw new ApiError('bad origin',403)}export function fail(error){return Response.json({error:error instanceof ApiError?error.message:'operation failed'},{status:error instanceof ApiError?error.status:503})}`);
registerHooks({resolve(specifier,context,next){if(specifier==='@/lib/server'||specifier==='./server'&&context.parentURL?.endsWith('/lib/platform-flywheel-server.ts'))return {url:stub,shortCircuit:true};if(specifier.startsWith('@/'))return {url:new URL('../'+specifier.slice(2)+'.ts',import.meta.url).href,shortCircuit:true};return next(specifier,context)}});
const {blankWorkspace}=await import('../lib/model.ts');
const {sampleProfile,companies}=await import('../lib/catalog.ts');
const route=await import('../app/api/state/route.ts');
const now=new Date().toISOString(),past=new Date(Date.now()-60_000).toISOString(),grant=new Date(Date.now()-86_400_000).toISOString();
const request=(method='GET',role='investor',body,headers={})=>new Request('http://localhost/api/state?role='+role,{method,headers,...(body===undefined?{}:{body:typeof body==='string'?body:JSON.stringify(body)})});
const row=(user='alice',role='investor')=>sql.prepare('SELECT data,version,updated_at FROM workspaces WHERE owner=? AND role=?').get(user,role);
const state=(user='alice',role='investor')=>{const r=row(user,role);return {...JSON.parse(r.data),version:r.version}};
const snapshots=(user='alice',role='investor')=>Number(sql.prepare('SELECT count(*) n FROM flywheel_evaluations WHERE owner=? AND role=?').get(user,role).n);
function seed(user,role='investor'){
 const w={...blankWorkspace(),profile:sampleProfile(role),version:1};w.settings={...w.settings,learning:true,learningConsent:{version:1,grantedAt:grant}};
 sql.prepare('INSERT INTO workspaces VALUES(?,?,?,?,?)').run(user,role,JSON.stringify(w),1,now);
 const id=user+'-'+role;sql.prepare('INSERT INTO knowledge_entities(id,owner,role,name,kind,canonical_url,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)').run(id,user,role,'私有主体 '+id,role==='founder'?'fund':'company','https://example.org/'+id,now,now);return w;
}
seed('alice');seed('alice','founder');seed('bob');
const feedback=(id,entityId='alice-investor')=>({id,entityId,stage:'meeting',occurredAt:past,note:'已真实完成项目介绍会，并确认后续沟通安排。',reference:'https://example.org/reference',recordedAt:past,updatedAt:past});
const addSnapshot=(id,user='alice',role='investor')=>sql.prepare('INSERT INTO flywheel_evaluations VALUES(?,?,?,?,?)').run(id,user,role,now,JSON.stringify({id,privateNote:'private-'+user+'-'+role}));
let checks=0;async function check(name,fn){await fn();checks++;console.log('PASS:',name)}

await check('state route enforces authentication, origin, role and malformed request boundaries',async()=>{
 harness.user=null;assert.equal((await route.GET(request())).status,401);assert.equal((await route.PUT(request('PUT','investor',{}))).status,401);harness.user='alice';
 assert.equal((await route.GET(request('GET','other'))).status,400);
 assert.equal((await route.PUT(request('PUT','investor',state(),{Origin:'https://untrusted.example'}))).status,403);
 const before=row();
 for(const invalid of ['{','null','false','5','[]','{}'])assert.equal((await route.PUT(request('PUT','investor',invalid))).status,400,invalid+' should be a bad request');
 assert.equal((await route.PUT(request('PUT','investor','x'.repeat(800001)))).status,400);
 assert.equal((await route.PUT(request('PUT','investor','{}',{'Content-Length':'900001'}))).status,400);
 assert.deepEqual(row(),before,'rejected requests do not alter prior workspace');
 const result=await route.GET(request());assert.equal(result.status,200);assert.match(result.headers.get('cache-control'),/no-store/);
});

await check('state route stamps returned events and cannot forge real deal outcomes or ownership',async()=>{
 const w=state();const input={...w,owner:'bob',signals:[{id:'actual-view',entityId:'alice-investor',kind:'view',time:past,mode:'real'},{id:'forged-meeting',entityId:'alice-investor',kind:'meeting',time:past,mode:'real'},{id:'demo-view',entityId:companies[0].id,kind:'view',time:past,mode:'real'}]};
 const before=Date.now(),response=await route.PUT(request('PUT','investor',input));assert.equal(response.status,200);const body=await response.json();
 assert.equal(body.version,w.version+1);assert.equal(body.signals.length,3);assert.ok(body.signals.every(s=>Date.parse(s.time)>=before));
 assert.equal(body.signals.find(s=>s.id==='forged-meeting').mode,'simulation');assert.equal(body.signals.find(s=>s.id==='demo-view').mode,'simulation');assert.equal(body.signals.find(s=>s.id==='actual-view').mode,'real');
 assert.equal(state('bob').signals?.length||0,0);assert.deepEqual(body.signals,state().signals);
 const stale=await route.PUT(request('PUT','investor',input));assert.equal(stale.status,409);assert.equal(state().version,body.version);
});

await check('actual feedback must reference an owned subject in the same identity and receives server provenance',async()=>{
 const before=state();
 for(const entityId of ['bob-investor','alice-founder','unknown']){
  const rejected=await route.PUT(request('PUT','investor',{...state(),businessFeedback:[feedback('bad-'+entityId,entityId)]}));
  assert.equal(rejected.status,404);assert.equal(state().version,before.version);
 }
 const response=await route.PUT(request('PUT','investor',{...state(),businessFeedback:[feedback('real-meeting')]}));assert.equal(response.status,200);const body=await response.json();
 assert.equal(body.businessFeedback.length,1);assert.notEqual(body.businessFeedback[0].recordedAt,past);assert.equal(body.businessFeedback[0].recordedAt,body.businessFeedback[0].updatedAt);
 const event=body.signals.find(s=>s.feedbackId==='real-meeting');assert.equal(event.mode,'real');assert.equal(event.kind,'meeting');
 const read=await route.GET(request());assert.deepEqual((await read.json()).businessFeedback,body.businessFeedback);
 const edited=state();edited.businessFeedback[0].stage='diligence';edited.businessFeedback[0].note='已实际进入尽职调查，双方明确了资料清单。';
 assert.equal((await route.PUT(request('PUT','investor',edited))).status,200);
 assert.deepEqual(state().signals.filter(s=>s.feedbackId==='real-meeting').map(s=>s.kind),['diligence']);
});

await check('clear atomically erases scoped signals and snapshots while retaining actual business records',async()=>{
 addSnapshot('alice-cycle');addSnapshot('founder-cycle','alice','founder');addSnapshot('bob-cycle','bob');
 const before=state(),beforeBatches=harness.batches,response=await route.PUT(request('PUT','investor',{...before,settings:{...before.settings,learningRequest:'clear'}}));assert.equal(response.status,200);const body=await response.json();
 assert.equal(harness.batches,beforeBatches+1);assert.equal(body.settings.learning,false);assert.equal(body.settings.learningRequest,undefined);assert.deepEqual(body.signals,[]);assert.deepEqual(state().signals,[]);
 assert.deepEqual(body.businessFeedback,before.businessFeedback);assert.equal(snapshots(),0);assert.equal(snapshots('alice','founder'),1);assert.equal(snapshots('bob'),1);
 assert.equal(state().version,before.version+1);assert.match(body.events[0].title,/清除/);
 assert.equal((await route.PUT(request('PUT','investor',{...state(),profile:{...state().profile,name:'普通后续保存'}}))).status,200);assert.deepEqual(state().signals,[],'later save must not resurrect linked business events');
});

await check('clear transaction rollback preserves both signals and snapshots when snapshot deletion fails',async()=>{
 const user='rollback';seed(user);harness.user=user;addSnapshot('rollback-cycle',user);
 const initial=state(user),event={id:'rollback-view',entityId:user+'-investor',kind:'view',time:past,mode:'real'};
 assert.equal((await route.PUT(request('PUT','investor',{...initial,signals:[event]}))).status,200);const before=row(user);harness.failDelete=true;
 const current=state(user),response=await route.PUT(request('PUT','investor',{...current,settings:{...current.settings,learningRequest:'clear'}}));assert.equal(response.status,503);
 assert.deepEqual(row(user),before,'workspace clear must roll back with the snapshot delete');assert.equal(snapshots(user),1);
 harness.user='alice';
});

await check('a concurrent save makes clear return 409 without deleting a newer evaluation',async()=>{
 const user='race';seed(user);harness.user=user;addSnapshot('race-cycle',user);const initial=state(user);
 harness.beforeBatch=()=>{const winner={...initial,profile:{...initial.profile,name:'并发保存获胜'}};sql.prepare('UPDATE workspaces SET data=?,version=version+1,updated_at=? WHERE owner=? AND role=?').run(JSON.stringify(winner),'concurrent-write',user,'investor')};
 const response=await route.PUT(request('PUT','investor',{...initial,settings:{...initial.settings,learningRequest:'clear'}}));assert.equal(response.status,409);
 assert.equal(state(user).profile.name,'并发保存获胜');assert.equal(state(user).settings.learning,true);assert.equal(snapshots(user),1,'losing clear cannot erase winner-scoped history');
 harness.user='alice';
});

await check('deleting actual feedback removes linked signals and never crosses owner or identity',async()=>{
 const user='delete';seed(user);harness.user=user;
 assert.equal((await route.PUT(request('PUT','investor',{...state(user),businessFeedback:[feedback('delete-me',user+'-investor')]}))).status,200);
 assert.equal(state(user).signals.filter(s=>s.feedbackId==='delete-me').length,1);
 assert.equal((await route.PUT(request('PUT','investor',{...state(user),businessFeedback:[]}))).status,200);
 assert.equal(state(user).signals.length,0);assert.equal(state(user).businessFeedback.length,0);
 harness.user='alice';assert.equal((await route.GET(request('GET','founder'))).status,200);assert.equal(state('alice','founder').businessFeedback?.length||0,0);
});

await check('state and platform projection commit together with owned subjects, metadata only and immediate revocation',async()=>{
 const user='projection';seed(user);harness.user=user;
 const event={id:'projected-view',entityId:user+'-investor',kind:'view',time:past,mode:'real',detail:'PRIVATE-SEARCH-TEXT'};
 const unowned={...event,id:'unowned-view',entityId:'bob-investor'};
 const report=feedback('projected-meeting',user+'-investor');report.note='PRIVATE-MEETING-NOTE 已真实完成会议，保留给本人查看。';
 const response=await route.PUT(request('PUT','investor',{...state(user),signals:[event,unowned],businessFeedback:[report]}));assert.equal(response.status,200);
 const projected=()=>sql.prepare('SELECT data FROM platform_events WHERE owner=? AND actor_role=? ORDER BY id').all(user,'investor').map(r=>JSON.parse(r.data));
 const initial=projected();assert.ok(initial.some(e=>e.sourceEventId==='projected-view'));assert.ok(initial.some(e=>e.sourceType==='business_feedback'));
 assert.ok(initial.every(e=>e.entityId===user+'-investor'&&e.owner===user&&e.actorRole==='investor'));assert.ok(!JSON.stringify(initial).includes('PRIVATE-'));
 assert.equal(sql.prepare("SELECT version FROM platform_projection_sync WHERE owner=? AND actor_role='investor' AND stream='workspace'").get(user).version,state(user).version);
 const before=row(user),beforeEvents=projected();harness.failProjection=true;
 const failed=await route.PUT(request('PUT','investor',{...state(user),profile:{...state(user).profile,name:'must roll back'}}));assert.equal(failed.status,503);assert.deepEqual(row(user),before);assert.deepEqual(projected(),beforeEvents);
 const current=state(user);assert.equal((await route.PUT(request('PUT','investor',{...current,settings:{...current.settings,learningRequest:'revoke'}}))).status,200);
 const revoked=projected();assert.ok(revoked.every(e=>!e.learningEligible));assert.equal(revoked.filter(e=>e.sourceType==='signal').length,0);assert.equal(revoked.filter(e=>e.sourceType==='business_feedback').length,1);
 harness.user='alice';
});

sql.close();delete globalThis.__flywheelApi;
console.log(`PASS: ${checks} state API authorization, provenance, feedback, clear and transaction scenarios`);
