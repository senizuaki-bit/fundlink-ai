import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {registerHooks} from 'node:module';

const sql=new DatabaseSync(':memory:');sql.exec('PRAGMA foreign_keys=ON');
for(const name of ['0000_magenta_stardust.sql','0001_knowledge.sql','0002_watch_schedules.sql','0003_flywheel.sql','0004_platform_flywheel.sql'])sql.exec(readFileSync(new URL('../drizzle/'+name,import.meta.url),'utf8'));
class ApiError extends Error{constructor(message,status=400){super(message);this.status=status}}
const harness={user:'alice',failProjection:false,onRead:null,queries:[]};
const statement=(query,values=[])=>({bind(...next){return statement(query,next)},async first(){harness.queries.push(query);if(harness.onRead){const callback=harness.onRead;callback(query,values)}return sql.prepare(query).get(...values)??null},async all(){harness.queries.push(query);if(harness.onRead){const callback=harness.onRead;callback(query,values)}return {results:sql.prepare(query).all(...values)}},async run(){if(harness.failProjection&&/^INSERT INTO platform_events/.test(query))throw Error('projection unavailable');return {meta:{changes:Number(sql.prepare(query).run(...values).changes)}}}});
harness.db={prepare:query=>statement(query),batch:async items=>{sql.exec('BEGIN');try{const result=[];for(const item of items)result.push(await item.run());sql.exec('COMMIT');return result}catch(error){sql.exec('ROLLBACK');throw error}}};
harness.ApiError=ApiError;globalThis.__recommendations=harness;
const serverStub='data:text/javascript,'+encodeURIComponent(`export const ApiError=globalThis.__recommendations.ApiError;export const db=()=>globalThis.__recommendations.db;export const runtimeEnv={};export async function owner(){if(!globalThis.__recommendations.user)throw new ApiError('login required',401);return globalThis.__recommendations.user}export function roleOf(request){const role=new URL(request.url).searchParams.get('role');if(!['investor','founder'].includes(role))throw new ApiError('invalid role');return role}export function sameOrigin(request){const origin=request.headers.get('origin');if(origin&&origin!==new URL(request.url).origin)throw new ApiError('bad origin',403)}export function fail(error){return Response.json({error:error instanceof ApiError?error.message:'operation failed'},{status:error instanceof ApiError?error.status:503})}`);
registerHooks({resolve(specifier,context,next){
 if(specifier==='@/lib/server'||specifier==='./server'&&/\/lib\/(?:recommendation-server|platform-flywheel-server|knowledge-server)\.ts$/.test(context.parentURL||''))return {url:serverStub,shortCircuit:true};
 if(specifier.startsWith('@/'))return {url:new URL('../'+specifier.slice(2)+'.ts',import.meta.url).href,shortCircuit:true};
 return next(specifier,context);
}});
const {blankWorkspace}=await import('../lib/model.ts');
const {catalog,sampleProfile}=await import('../lib/catalog.ts');
const {getRecommendations}=await import('../lib/recommendation-server.ts');
const {rankedRecommendations}=await import('../lib/recommendations.ts');
const route=await import('../app/api/recommendations/route.ts');
const stateRoute=await import('../app/api/state/route.ts');
const now=new Date().toISOString(),grant=new Date(Date.now()-86_400_000).toISOString();
const request=(role='investor',extra='')=>new Request('http://localhost/api/recommendations?role='+role+extra);
const state=(user,role='investor')=>{const row=sql.prepare('SELECT data,version FROM workspaces WHERE owner=? AND role=?').get(user,role);return {...JSON.parse(row.data),version:row.version}};
const save=(w,role='investor')=>stateRoute.PUT(new Request('http://localhost/api/state?role='+role,{method:'PUT',body:JSON.stringify(w)}));
function seed(user,role='investor',signals=true){
 const w={...blankWorkspace(),profile:sampleProfile(role),version:1};w.profile.name='PRIVATE-PROFILE-'+user+'-'+role;
 w.settings={...w.settings,learning:true,learningConsent:{version:1,grantedAt:grant}};
 if(signals)w.signals=[{id:'interest-'+role,entityId:catalog(role)[0].id,kind:'interest',mode:'simulation',time:now,detail:'PRIVATE-NOTE-'+user}];
 sql.prepare('INSERT INTO workspaces VALUES(?,?,?,?,?)').run(user,role,JSON.stringify(w),1,now);
 const entityId=user+'-'+role;
 sql.prepare('INSERT INTO knowledge_entities(id,owner,role,name,kind,canonical_url,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)').run(entityId,user,role,'PRIVATE-ENTITY-'+user+'-'+role,role==='founder'?'fund':'company','https://example.org/'+entityId,now,now);
 return w;
}
seed('alice');seed('alice','founder');seed('bob');
let checks=0;async function check(name,fn){await fn();checks++;console.log('PASS:',name)}

await check('recommendation API authenticates, validates inputs and never exposes arbitrary owner scopes',async()=>{
 harness.user=null;assert.equal((await route.GET(request())).status,401);harness.user='alice';
 for(const req of [request('admin'),request('investor','&version=-1'),request('investor','&version=1.5'),request('investor','&version=9007199254740993'),request('investor','&query='+encodeURIComponent('x'.repeat(301)))])assert.equal((await route.GET(req)).status,400);
 const stale=await route.GET(request('investor','&version=0'));assert.equal(stale.status,409);assert.match(stale.headers.get('cache-control'),/no-store/);
 const response=await route.GET(request('investor','&owner=bob&version=1'));assert.equal(response.status,200);assert.match(response.headers.get('cache-control'),/no-store/);
 const feed=await response.json(),text=JSON.stringify(feed);assert.equal(feed.role,'investor');assert.equal(feed.workspaceVersion,1);assert.equal(feed.pipeline.version,1);
 assert.ok(text.includes('PRIVATE-ENTITY-alice-investor'));assert.ok(!text.includes('PRIVATE-ENTITY-bob'));assert.ok(!text.includes('PRIVATE-ENTITY-alice-founder'));assert.ok(!text.includes('PRIVATE-NOTE'));
});

await check('both sides use the same central event and ranking pipeline with fixed pair orientation',async()=>{
 for(const role of ['investor','founder']){
  const feed=await getRecommendations('alice',role,'',1),ranked=rankedRecommendations(feed);
  assert.equal(feed.role,role);assert.equal(feed.pipeline.version,1);assert.ok(feed.pipeline.eventCount>0);assert.ok(ranked.length>0);assert.ok(ranked.every(r=>r.match.eligible));
  assert.deepEqual(ranked.map(r=>r.entity.id),feed.order.map(r=>r.entityId));assert.ok(!feed.evaluated.some(r=>r.entity.id==='alice-'+(role==='investor'?'founder':'investor')));
  const events=sql.prepare("SELECT data FROM platform_events WHERE owner='alice' AND actor_role=? AND stream='workspace'").all(role).map(r=>JSON.parse(r.data));assert.ok(events.length>0);
  for(const event of events){assert.equal(role==='investor'?event.investorKey:event.companyKey,event.actorKey);assert.equal(role==='investor'?event.companyKey:event.investorKey,event.subjectKey);assert.equal(event.provenance,'simulation');assert.ok(!JSON.stringify(event).includes('PRIVATE-NOTE'))}
 }
});

await check('central events are authoritative; existing projection is not bypassed with raw workspace signals',async()=>{
 const user='authoritative';seed(user,'investor',false);const baseline=await getRecommendations(user,'investor','',1),id=catalog('investor')[0].id;
 const changed=state(user);changed.signals=[{id:'raw-unprojected',entityId:id,kind:'interest',mode:'simulation',time:now}];
 // Deliberately tamper with JSON without a version transition: bypassing the projection must not affect ranking.
 sql.prepare('UPDATE workspaces SET data=? WHERE owner=? AND role=?').run(JSON.stringify(changed),user,'investor');
 const unprojected=await getRecommendations(user,'investor','',1);assert.equal(unprojected.evaluated.find(r=>r.entity.id===id).match.feedbackAdjustment,baseline.evaluated.find(r=>r.entity.id===id).match.feedbackAdjustment);
 harness.user=user;assert.equal((await save(changed)).status,200);const projected=await getRecommendations(user,'investor','',2);
 assert.ok(projected.evaluated.find(r=>r.entity.id===id).match.feedbackAdjustment>baseline.evaluated.find(r=>r.entity.id===id).match.feedbackAdjustment);
 harness.user='alice';
});

await check('revoke and clear reach recommendations immediately without changing hard constraints',async()=>{
 const user='optout';seed(user);harness.user=user;const before=await getRecommendations(user,'investor','',1),id=catalog('investor')[0].id;
 assert.ok(before.evaluated.find(r=>r.entity.id===id).match.feedbackAdjustment>0);
 let w=state(user);assert.equal((await save({...w,settings:{...w.settings,learningRequest:'revoke'}})).status,200);
 const revoked=await getRecommendations(user,'investor','',2);assert.ok(revoked.evaluated.every(r=>r.match.feedbackAdjustment===0));assert.deepEqual(revoked.order.map(r=>r.entityId).sort(),before.order.map(r=>r.entityId).sort());
 w=state(user);assert.equal((await save({...w,settings:{...w.settings,learningRequest:'clear'}})).status,200);
 const cleared=await getRecommendations(user,'investor','',3);assert.ok(cleared.evaluated.every(r=>r.match.feedbackAdjustment===0));assert.equal(sql.prepare("SELECT COUNT(*) n FROM platform_events WHERE owner=? AND source_type='signal'").get(user).n,0);
 harness.user='alice';
});

await check('knowledge permission prevents knowledge reads and evidence projection, while core ranking remains usable',async()=>{
 const user='private-off';const w=seed(user);w.settings.knowledge=false;sql.prepare('UPDATE workspaces SET data=? WHERE owner=? AND role=?').run(JSON.stringify(w),user,'investor');
 harness.queries=[];const feed=await getRecommendations(user,'investor','',1);
 assert.equal(feed.evaluated.length,catalog('investor').length);assert.ok(!JSON.stringify(feed).includes('PRIVATE-ENTITY'));assert.ok(harness.queries.every(query=>!query.includes('FROM source_items')&&!query.includes('FROM risk_findings')&&!query.includes('FROM relationships')));
 assert.equal(sql.prepare("SELECT COUNT(*) n FROM platform_projection_sync WHERE owner=? AND stream='evidence'").get(user).n,0);
});

await check('projection failure returns an error instead of local ranking and partial state',async()=>{
 const user='failure';seed(user);harness.user=user;harness.failProjection=true;
 const response=await route.GET(request('investor','&version=1'));assert.equal(response.status,503);const body=await response.json();assert.deepEqual(body,{error:'operation failed'});
 assert.equal(sql.prepare('SELECT COUNT(*) n FROM platform_events WHERE owner=?').get(user).n,0);assert.equal(sql.prepare('SELECT COUNT(*) n FROM platform_projection_sync WHERE owner=?').get(user).n,0);
 harness.failProjection=false;harness.user='alice';
});

await check('concurrent permission changes reject stale generation rather than returning mixed results',async()=>{
 const user='race';seed(user);let changed=false;
 harness.onRead=(query,values)=>{if(!changed&&/SELECT (?:e\.)?data FROM platform_events/.test(query)&&values[0]===user){changed=true;const w=state(user);w.settings.learning=false;w.settings.learningConsent.revokedAt=now;sql.prepare('UPDATE workspaces SET data=?,version=version+1 WHERE owner=? AND role=?').run(JSON.stringify(w),user,'investor')}};
 await assert.rejects(getRecommendations(user,'investor','',1),error=>error.status===409);harness.onRead=null;assert.ok(changed);
 const latest=await getRecommendations(user,'investor','',2);assert.ok(latest.evaluated.every(r=>r.match.feedbackAdjustment===0));
});

await check('new workspaces initialize safely and scoped queries preserve the exact server order',async()=>{
 await assert.rejects(getRecommendations('new-user','founder','',2),error=>error.status===409);
 assert.equal(sql.prepare("SELECT COUNT(*) n FROM workspaces WHERE owner='new-user'").get().n,0);
 const feed=await getRecommendations('new-user','founder',' 人工智能 ',0);assert.equal(feed.workspaceVersion,0);assert.equal(feed.role,'founder');assert.ok(feed.evaluated.every(r=>!r.entity.real));
 const healthy=await getRecommendations('alice','investor','工业');assert.ok(healthy.evaluated.some(r=>r.retrieval.matchedTerms.length>0));assert.deepEqual(rankedRecommendations(healthy).map(r=>r.entity.id),healthy.order.map(r=>r.entityId));
});

sql.close();delete globalThis.__recommendations;
console.log(`PASS: ${checks} shared recommendation service and API scenarios`);
