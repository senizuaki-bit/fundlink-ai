import assert from 'node:assert/strict';
import {test} from 'node:test';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {registerHooks} from 'node:module';
import {blankWorkspace} from '../lib/model.ts';
import {companies} from '../lib/catalog.ts';
import {orientedPair,projectWorkspaceEvents,summarizePlatformPairs} from '../lib/platform-flywheel.ts';

const sql=new DatabaseSync(':memory:');
sql.exec(readFileSync(new URL('../drizzle/0004_platform_flywheel.sql',import.meta.url),'utf8'));
sql.exec('CREATE TABLE workspaces(owner TEXT,role TEXT,data TEXT,version INTEGER,updated_at TEXT,PRIMARY KEY(owner,role)); CREATE TABLE knowledge_entities(id TEXT,owner TEXT,role TEXT); CREATE TABLE source_items(id TEXT,owner TEXT,role TEXT,entity_id TEXT,collected_at TEXT); CREATE TABLE risk_findings(id TEXT,owner TEXT,role TEXT,entity_id TEXT,review_status TEXT,created_at TEXT); CREATE TABLE relationships(id TEXT,owner TEXT,role TEXT,subject_id TEXT,object_id TEXT,type TEXT,status TEXT,created_at TEXT)');
const stmt=(query,values=[])=>({query,values,bind(...next){return stmt(query,next)},async first(){return sql.prepare(query).get(...values)??null},async all(){return {results:sql.prepare(query).all(...values)}},async run(){return {meta:{changes:Number(sql.prepare(query).run(...values).changes)}}}});
const db={prepare:query=>stmt(query),async batch(statements){sql.exec('BEGIN');try{const results=[];for(const s of statements)results.push(await s.run());sql.exec('COMMIT');return results}catch(error){sql.exec('ROLLBACK');throw error}}};
globalThis.__platformTestDB=db;
registerHooks({resolve(specifier,context,next){if((specifier==='./server'||specifier==='./server.ts')&&context.parentURL?.endsWith('/lib/platform-flywheel-server.ts'))return {url:'data:text/javascript,'+encodeURIComponent('export const db=()=>globalThis.__platformTestDB'),shortCircuit:true};return next(specifier,context)}});
const {workspaceProjectionStatements,ensurePlatformWorkspaceProjection,readPlatformContext,syncPlatformEvidence}=await import('../lib/platform-flywheel-server.ts');
const now='2026-10-09T12:00:00.000Z',grant='2026-10-09T10:00:00.000Z';
function workspace(id='subject-a'){
 const w=blankWorkspace();w.settings.learning=true;w.settings.learningConsent={version:1,grantedAt:grant};
 w.signals=[{id:'exposure',entityId:id,kind:'exposure',time:'2026-10-09T11:00:00.000Z',mode:'real'},{id:'reject',entityId:id,kind:'reject',time:'2026-10-09T11:10:00.000Z',detail:'方向不符 PRIVATE NOTE / CUSTOMER SECRET',mode:'real'}];return w;
}
function seed(owner,role,w,id='subject-a'){sql.prepare('INSERT INTO knowledge_entities VALUES(?,?,?)').run(id,owner,role);sql.prepare('INSERT INTO workspaces VALUES(?,?,?,?,?)').run(owner,role,JSON.stringify(w),w.version,now)}
async function save(owner,role,w){const text=JSON.stringify(w);const update=db.prepare('UPDATE workspaces SET data=?,version=version+1,updated_at=? WHERE owner=? AND role=? AND version=?').bind(text,now,owner,role,w.version);const projection=await workspaceProjectionStatements(owner,role,w,w.version,text,now);return db.batch([update,...projection])}

await test('both role producers share vocabulary while actor/subject keys remain scoped and notes are absent',async()=>{
 const wi=workspace(),wf=workspace('subject-f');seed('alice','investor',wi);seed('alice','founder',wf,'subject-f');
 await save('alice','investor',wi);await save('alice','founder',wf);
 const investor=await readPlatformContext('alice','investor',1),founder=await readPlatformContext('alice','founder',1);
 assert.equal(investor.learningSignals.length,2);assert.equal(founder.learningSignals.length,2);
 assert.equal(investor.learningSignals.find(s=>s.kind==='reject').detail,'方向不符');
 const left=investor.events[0],right=founder.events[0];assert.equal(left.investorKey,left.actorKey);assert.equal(right.companyKey,right.actorKey);assert.notEqual(left.actorKey,right.actorKey);
 assert.ok(!JSON.stringify(investor).includes('PRIVATE'));assert.ok(!JSON.stringify(investor).includes('CUSTOMER SECRET'));
 assert.ok(investor.pairs.every(p=>p.status==='one_sided_observation'));
 assert.equal((await readPlatformContext('bob','investor',1)).events.length,0);
 assert.equal((await readPlatformContext('alice','investor',2)).learningSignals.length,0);
});

await test('atomic version and persisted-data guards reject stale and conflicting projection writes',async()=>{
 const w=workspace();w.signals=[{id:'injected-stale',entityId:'subject-a',kind:'save',time:now,mode:'real'}];
 const stale=await save('alice','investor',w);assert.equal(stale[0].meta.changes,0);
 assert.ok(!(await readPlatformContext('alice','investor',1)).learningSignals.some(s=>s.id==='injected-stale'));
 w.version=1;const projection=await workspaceProjectionStatements('alice','investor',w,1,'different serialized data',now);
 sql.prepare('UPDATE workspaces SET version=2 WHERE owner=? AND role=?').run('alice','investor');await db.batch(projection);
 assert.equal((await readPlatformContext('alice','investor')).version,null,'stale projection is unreadable even without a caller-provided version');
});

await test('revocation deletes learning projection but retains self-reported operations and other role',async()=>{
 const w=workspace();w.version=2;w.businessFeedback=[{id:'reply-record',entityId:'subject-a',stage:'positive_reply',occurredAt:'2026-10-09T11:30:00.000Z',recordedAt:'2026-10-09T11:31:00.000Z',updatedAt:now,note:'PRIVATE SECRET OF BUSINESS',reference:'https://private.example/customer/1'}];
 w.settings.learning=false;w.settings.learningConsent.revokedAt=now;
 await save('alice','investor',w);const context=await readPlatformContext('alice','investor',3);
 assert.equal(context.learningSignals.length,0);assert.equal(context.events.length,1);assert.equal(context.events[0].provenance,'self_reported');assert.equal(context.events[0].learningEligible,false);assert.equal(context.pairs[0].status,'one_sided_report');
 assert.ok(!JSON.stringify(context).includes('private.example'));assert.ok(!JSON.stringify(context).includes('PRIVATE SECRET'));
 assert.equal((await readPlatformContext('alice','founder',1)).learningSignals.length,2);
});

await test('backfill is idempotent, rejects foreign subjects and never reinterprets old outcomes as learning consent',async()=>{
 const w=workspace('subject-b');w.signals.push({id:'foreign',entityId:'subject-a',kind:'save',time:now,mode:'real'});w.businessFeedback=[{id:'old-reply',entityId:'subject-b',stage:'positive_reply',occurredAt:'2026-10-08T11:30:00.000Z',recordedAt:'2026-10-08T11:31:00.000Z',updatedAt:now,note:'historical business detail',reference:''}];
 seed('bob','founder',w,'subject-b');await ensurePlatformWorkspaceProjection('bob','founder',w,JSON.stringify(w));const first=await readPlatformContext('bob','founder',0);
 assert.equal(first.learningSignals.length,2);assert.ok(first.learningSignals.every(s=>s.entityId==='subject-b'));assert.equal(first.events.find(e=>e.sourceType==='business_feedback').learningEligible,false);
 await ensurePlatformWorkspaceProjection('bob','founder',w,JSON.stringify(w));assert.deepEqual(await readPlatformContext('bob','founder',0),first);
});

await test('clear and consent timing cannot resurrect old behavioral events; simulation is always separated',async()=>{
 const w=workspace();w.signals.push({id:'old',entityId:'subject-a',kind:'save',time:'2026-10-08T11:00:00Z',mode:'real'},{id:'demo',entityId:companies[0].id,kind:'meeting',time:now,mode:'real'});
 const identity={actorKey:'workspace:actor',subjects:new Map([['subject-a',{id:'subject-a',key:'subject:local',simulation:false}],[companies[0].id,{id:companies[0].id,key:'demo:company',simulation:true}]])};
 const events=await projectWorkspaceEvents('test','investor',w,identity,Date.parse(now));assert.ok(!events.some(e=>e.sourceEventId==='old'));const demo=events.find(e=>e.sourceEventId==='demo');assert.equal(demo.provenance,'simulation');assert.equal(demo.isSimulation,true);
 w.settings.learning=false;w.signals=[];assert.equal((await projectWorkspaceEvents('test','investor',w,identity,Date.parse(now))).length,0);
});

await test('exact bilateral pair orientation distinguishes both self-reports from one-sided mutual simulation',()=>{
 assert.deepEqual(orientedPair('investor','fund:verified','company:verified'),orientedPair('founder','company:verified','fund:verified'));
 const make=(actorRole,provenance='self_reported',isSimulation=false,investorKey='fund:verified')=>({actorRole,stream:'workspace',companyKey:'company:verified',investorKey,type:'meeting',observedAt:now,provenance,isSimulation});
 assert.equal(summarizePlatformPairs([make('investor')])[0].status,'one_sided_report');
 assert.equal(summarizePlatformPairs([make('investor'),make('founder')])[0].status,'both_sides_reported');
 assert.equal(summarizePlatformPairs([make('investor'),make('founder','observed')])[0].status,'one_sided_report');
 const simulated=summarizePlatformPairs([make('investor'),make('founder','simulation',true)]);assert.equal(simulated.length,2);assert.ok(simulated.every(p=>p.status!=='both_sides_reported'));
 assert.equal(summarizePlatformPairs([make('investor'),make('founder','self_reported',false,'fund:other')]).length,2);
 const business={...make('investor'),owner:'alice',feedbackId:'reply',sourceType:'business_feedback'},signal={...business,sourceType:'signal'};
 assert.equal(summarizePlatformPairs([business,signal])[0].eventCount,1,'operational record and its learning signal are one outcome');
});

await test('evidence mutation stream stores collection/review enums and retracts deleted evidence without affecting signals',async()=>{
 sql.prepare('INSERT INTO source_items VALUES(?,?,?,?,?)').run('src','alice','founder','subject-f',now);
 sql.prepare('INSERT INTO risk_findings VALUES(?,?,?,?,?,?)').run('risk','alice','founder','subject-f','false_positive',now);
 sql.prepare('INSERT INTO knowledge_entities VALUES(?,?,?)').run('alias-f','alice','founder');
 sql.prepare('INSERT INTO relationships VALUES(?,?,?,?,?,?,?,?)').run('same','alice','founder','subject-f','alias-f','SAME_ENTITY_CANDIDATE','confirmed',now);
 sql.prepare('INSERT INTO source_items VALUES(?,?,?,?,?)').run('foreign-source','bob','founder','subject-b',now);
 await syncPlatformEvidence('alice','founder');let context=await readPlatformContext('alice','founder',1);
 assert.deepEqual(context.events.filter(e=>e.stream==='evidence').map(e=>e.type).sort(),['entitylink','riskreview','sourcecollected']);assert.equal(context.learningSignals.length,2);
 assert.ok(!context.events.some(e=>e.sourceEventId==='foreign-source'));
 assert.equal((await syncPlatformEvidence('alice','founder')).changed,false,'unchanged metadata does not rewrite event rows or review observation dates');
 sql.prepare('DELETE FROM source_items WHERE id=?').run('src');sql.prepare('UPDATE relationships SET status=? WHERE id=?').run('suspected','same');sql.prepare('UPDATE risk_findings SET review_status=? WHERE id=?').run('pending','risk');
 await syncPlatformEvidence('alice','founder');context=await readPlatformContext('alice','founder',1);assert.equal(context.events.filter(e=>e.stream==='evidence').length,0);assert.equal(context.learningSignals.length,2);
 sql.prepare('DELETE FROM knowledge_entities WHERE id=? AND owner=? AND role=?').run('subject-f','alice','founder');
 assert.equal((await readPlatformContext('alice','founder',1)).events.length,0,'deleted subjects cannot leave readable stale projections');
});

console.log('Platform event projection: shared contracts, transaction guards, consent lifecycle, role isolation and evidence metadata verified.');
