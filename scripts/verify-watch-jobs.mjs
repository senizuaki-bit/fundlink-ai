import assert from 'node:assert/strict';
import {test} from 'node:test';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {registerHooks} from 'node:module';

const sql=new DatabaseSync(':memory:');
sql.exec(readFileSync(new URL('../drizzle/0002_watch_schedules.sql',import.meta.url),'utf8'));
sql.exec('CREATE TABLE knowledge_entities(id TEXT,owner TEXT,role TEXT); CREATE TABLE source_items(id TEXT,owner TEXT,role TEXT,entity_id TEXT,visibility TEXT)');
const statement=(query,values=[])=>({bind(...next){return statement(query,next)},async first(){return sql.prepare(query).get(...values)??null},async run(){return {meta:{changes:Number(sql.prepare(query).run(...values).changes)}}}});
class ApiError extends Error{constructor(message,status=400){super(message);this.status=status}}
const harness={db:{prepare:query=>statement(query)},ApiError,user:'test-owner',calls:[],execute:async()=>page()};
globalThis.__watchJobs=harness;
const serverStub='data:text/javascript,'+encodeURIComponent(`export const ApiError=globalThis.__watchJobs.ApiError;export const db=()=>globalThis.__watchJobs.db;export async function owner(){if(!globalThis.__watchJobs.user)throw new ApiError('login required',401);return globalThis.__watchJobs.user}export function roleOf(request){const role=new URL(request.url).searchParams.get('role');if(!['investor','founder'].includes(role))throw new ApiError('invalid role');return role}export function sameOrigin(request){const origin=request.headers.get('origin');if(origin&&origin!==new URL(request.url).origin)throw new ApiError('bad origin',403)}export function fail(error){return Response.json({error:error.message},{status:error.status||503})}`);
registerHooks({resolve(specifier,context,next){
  if(specifier==='@/lib/server'||specifier==='./server'&&context.parentURL?.endsWith('/lib/watch-schedule-server.ts'))return {url:serverStub,shortCircuit:true};
  if(specifier==='@/lib/watch-schedule-server')return {url:new URL('../lib/watch-schedule-server.ts',import.meta.url).href,shortCircuit:true};
  if(specifier==='./knowledge-server'&&context.parentURL?.endsWith('/lib/watch-schedule-server.ts'))return {url:'data:text/javascript,'+encodeURIComponent(`export async function watchKnowledge(...args){globalThis.__watchJobs.calls.push(args);return globalThis.__watchJobs.execute(...args)}`),shortCircuit:true};
  return next(specifier,context);
}});
const {readWatchSchedule,saveWatchSchedule,tickWatchSchedule}=await import('../lib/watch-schedule-server.ts');
const route=await import('../app/api/watch-schedule/route.ts');
function page(nextCursor=null){return {events:[{changed:true},{changed:false}],progress:{nextCursor,remaining:nextCursor?7:0},run:{status:'success'}}}
function entity(user,role,id,visibility='public'){sql.prepare('INSERT INTO knowledge_entities VALUES(?,?,?)').run(id,user,role);sql.prepare('INSERT INTO source_items VALUES(?,?,?,?,?)').run('src-'+id,user,role,id,visibility)}
function setup(user,role='investor'){const id=user+'-entity';entity(user,role,id);return {enabled:true,intervalHours:6,entityIds:[id]}}
function deferred(){let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve}}
function row(user,role='investor'){return sql.prepare('SELECT * FROM watch_schedules WHERE owner=? AND role=?').get(user,role)}

await test('default disabled, enabling due immediately, scoped reads and private-only rejection',async()=>{
  assert.equal((await readWatchSchedule('missing','investor')).enabled,false);
  harness.calls=[];assert.deepEqual(await tickWatchSchedule('missing','investor'),{ran:false});assert.equal(harness.calls.length,0);
  const config=setup('alice');const before=Date.now();const saved=await saveWatchSchedule('alice','investor',config);
  assert.equal(saved.enabled,true);assert.ok(Date.parse(saved.nextRunAt)>=before&&Date.parse(saved.nextRunAt)<=Date.now());
  assert.equal((await readWatchSchedule('alice','founder')).enabled,false);assert.equal((await readWatchSchedule('bob','investor')).enabled,false);
  await assert.rejects(saveWatchSchedule('bob','investor',config),e=>e.status===404);
  await assert.rejects(saveWatchSchedule('alice','founder',config),e=>e.status===404);
  entity('alice','investor','private-only','private');
  await assert.rejects(saveWatchSchedule('alice','investor',{...config,entityIds:['private-only']}),/公开来源/);
  await assert.rejects(saveWatchSchedule('alice','investor',{...config,entityIds:[]}),/1–6/);
});

await test('simultaneous ticks acquire one lease and execute only once',async()=>{
  await saveWatchSchedule('lease','investor',setup('lease'));
  const started=deferred(),complete=deferred();harness.calls=[];harness.execute=async()=>{started.resolve();return complete.promise};
  const first=tickWatchSchedule('lease','investor');await started.promise;
  const second=await tickWatchSchedule('lease','investor');assert.deepEqual(second,{ran:false});assert.equal(harness.calls.length,1);assert.ok(row('lease').lease_id);
  complete.resolve(page());const result=await first;assert.equal(result.status,'success');assert.equal(result.changed,1);assert.equal(row('lease').lease_id,null);
  const state=await readWatchSchedule('lease','investor');assert.ok(Date.parse(state.nextRunAt)>Date.now()+5.9*3600000);
  assert.deepEqual(await tickWatchSchedule('lease','investor'),{ran:false});
});

await test('pagination retains cursor and immediately continues until next interval',async()=>{
  await saveWatchSchedule('pages','founder',setup('pages','founder'));harness.calls=[];harness.execute=async()=>harness.calls.length===1?page('page-2'):page();
  assert.equal((await tickWatchSchedule('pages','founder')).status,'continuing');
  let state=await readWatchSchedule('pages','founder');assert.equal(state.cursor,'page-2');assert.ok(Date.parse(state.nextRunAt)<=Date.now());
  assert.equal((await tickWatchSchedule('pages','founder')).status,'success');
  assert.equal(harness.calls[0][0],'pages');assert.equal(harness.calls[0][1],'founder');assert.deepEqual(harness.calls[0][2],['pages-entity']);assert.equal(harness.calls[0][3].limit,6);assert.equal(harness.calls[1][3].cursor,'page-2');
  state=await readWatchSchedule('pages','founder');assert.equal(state.cursor,null);assert.ok(Date.parse(state.nextRunAt)>Date.now()+5.9*3600000);
});

await test('failure clears lease, exposes a safe message and backs off before retry',async()=>{
  await saveWatchSchedule('failure','investor',setup('failure'));harness.execute=async()=>{throw Error('secret upstream diagnostic')};
  const result=await tickWatchSchedule('failure','investor');assert.equal(result.status,'failed');
  const state=await readWatchSchedule('failure','investor');assert.equal(state.lastStatus,'failed');assert.ok(!state.lastMessage.includes('secret'));assert.equal(row('failure').lease_id,null);assert.equal(row('failure').lease_until,null);assert.equal(state.cursor,null);
  assert.ok(Date.parse(state.nextRunAt)>Date.now()+0.99*3600000&&Date.parse(state.nextRunAt)<Date.now()+1.01*3600000);
  assert.deepEqual(await tickWatchSchedule('failure','investor'),{ran:false});
});

await test('pausing during an in-flight page cannot be overwritten by its completion',async()=>{
  const config=setup('paused');await saveWatchSchedule('paused','investor',config);
  const started=deferred(),complete=deferred();harness.execute=async()=>{started.resolve();return complete.promise};
  const tick=tickWatchSchedule('paused','investor');await started.promise;
  await saveWatchSchedule('paused','investor',{...config,enabled:false,intervalHours:24});
  complete.resolve(page('old-page-cursor'));await tick;
  const state=await readWatchSchedule('paused','investor');assert.equal(state.enabled,false);assert.equal(state.intervalHours,24);assert.equal(state.nextRunAt,null);assert.equal(state.cursor,null);assert.equal(state.lastStatus,'idle');
  assert.deepEqual(await tickWatchSchedule('paused','investor'),{ran:false});
});

await test('re-enabling with a new scope retains the active lease and old completion cannot overwrite new settings',async()=>{
  const config=setup('reconfigured');await saveWatchSchedule('reconfigured','investor',config);
  const started=deferred(),complete=deferred();harness.calls=[];harness.execute=async()=>{started.resolve();return complete.promise};
  const active=tickWatchSchedule('reconfigured','investor');await started.promise;
  const oldLease=row('reconfigured').lease_id;
  await saveWatchSchedule('reconfigured','investor',{...config,enabled:false});
  entity('reconfigured','investor','new-public-entity');
  const replacement={enabled:true,intervalHours:12,entityIds:['new-public-entity']};
  await saveWatchSchedule('reconfigured','investor',replacement);
  const scheduled=row('reconfigured');assert.equal(scheduled.lease_id,oldLease);assert.equal(scheduled.revision,2);
  assert.deepEqual(await tickWatchSchedule('reconfigured','investor'),{ran:false});assert.equal(harness.calls.length,1);
  complete.resolve({...page('outdated-cursor'),events:[{changed:false,status:'failed'}]});await active;
  const state=await readWatchSchedule('reconfigured','investor');
  assert.equal(state.enabled,true);assert.equal(state.intervalHours,12);assert.deepEqual(state.entityIds,['new-public-entity']);assert.equal(state.nextRunAt,scheduled.next_run_at);
  assert.equal(state.lastStatus,'idle');assert.equal(state.lastRunAt,null);assert.equal(state.cursor,null);assert.equal(state.cycleFailures,0);assert.equal(row('reconfigured').lease_id,null);
  harness.execute=async()=>page();await tickWatchSchedule('reconfigured','investor');
  assert.deepEqual(harness.calls[1][2],['new-public-entity']);assert.equal(harness.calls[1][3].cursor,undefined);
  assert.ok(Date.parse((await readWatchSchedule('reconfigured','investor')).nextRunAt)>Date.now()+11.9*3600000);
});

await test('pausing still succeeds after a scheduled entity has been deleted',async()=>{
  const config=setup('deleted-scope');await saveWatchSchedule('deleted-scope','investor',config);
  sql.prepare('DELETE FROM knowledge_entities WHERE owner=?').run('deleted-scope');sql.prepare('DELETE FROM source_items WHERE owner=?').run('deleted-scope');
  const paused=await saveWatchSchedule('deleted-scope','investor',{...config,enabled:false});
  assert.equal(paused.enabled,false);assert.equal(paused.nextRunAt,null);assert.deepEqual(await tickWatchSchedule('deleted-scope','investor'),{ran:false});
  await assert.rejects(saveWatchSchedule('deleted-scope','investor',config),e=>e.status===404);
});

await test('later successful pages preserve earlier failures, and a new cycle resets the failure count',async()=>{
  await saveWatchSchedule('partial-cycle','investor',setup('partial-cycle'));harness.calls=[];
  harness.execute=async()=>harness.calls.length===1?{...page('remaining-sources'),events:[{changed:false,status:'failed'},{changed:true,status:'success'}]}:page();
  assert.equal((await tickWatchSchedule('partial-cycle','investor')).status,'partial');
  let state=await readWatchSchedule('partial-cycle','investor');assert.equal(state.cycleFailures,1);assert.equal(state.cursor,'remaining-sources');
  assert.equal((await tickWatchSchedule('partial-cycle','investor')).status,'partial');
  state=await readWatchSchedule('partial-cycle','investor');assert.equal(state.cursor,null);assert.equal(state.cycleFailures,1);assert.match(state.lastMessage,/累计 1 项读取失败/);
  sql.prepare('UPDATE watch_schedules SET next_run_at=? WHERE owner=? AND role=?').run('2020-01-01T00:00:00.000Z','partial-cycle','investor');
  assert.equal((await tickWatchSchedule('partial-cycle','investor')).status,'success');
  state=await readWatchSchedule('partial-cycle','investor');assert.equal(state.cycleFailures,0);assert.equal(state.lastStatus,'success');
});

await test('routes require authentication, role and same origin and bound settings input',async()=>{
  const request=(method='POST',role='investor',headers={},body)=>new Request('http://localhost/api/watch-schedule?role='+role,{method,headers,...(body===undefined?{}:{body})});
  harness.user=null;assert.equal((await route.GET(request('GET'))).status,401);assert.equal((await route.POST(request())).status,401);
  harness.user='alice';assert.equal((await route.POST(request('POST','invalid'))).status,400);assert.equal((await route.POST(request('POST','investor',{Origin:'https://other.example'}))).status,403);
  assert.equal((await route.PUT(request('PUT','investor',{},'{'))).status,400);assert.equal((await route.PUT(request('PUT','investor',{},'x'.repeat(3001)))).status,400);
  const response=await route.GET(request('GET','founder'));assert.equal(response.status,200);assert.equal((await response.json()).enabled,false);assert.match(response.headers.get('cache-control'),/no-store/);
});
sql.close();
