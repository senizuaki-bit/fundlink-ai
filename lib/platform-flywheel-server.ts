import {db} from "./server";
import {companies,funds} from "./catalog";
import type {Role,Workspace} from "./model";
import {opaquePlatformKey,orientedPair,platformLearningSignals,projectWorkspaceEvents,summarizePlatformPairs,type PlatformEvent,type PlatformIdentityContext} from "./platform-flywheel";

type ScopedEntity={id:string};
const nowIso=(now:string|number)=>typeof now==="number"?new Date(now).toISOString():now;
/** No name or website guess can claim the user's identity. A real shared-deal identity service can replace this resolver later. */
async function identityContext(user:string,role:Role):Promise<PlatformIdentityContext>{
 const result=await db().prepare("SELECT id FROM knowledge_entities WHERE owner=? AND role=?").bind(user,role).all<ScopedEntity>();
 const subjects=new Map<string,{id:string;key:string;simulation:boolean}>();
 for(const e of result.results)subjects.set(e.id,{id:e.id,key:await opaquePlatformKey("subject",user,role,e.id),simulation:false});
 for(const e of role==="investor"?companies:funds)subjects.set(e.id,{id:e.id,key:await opaquePlatformKey("demo",role,e.id),simulation:true});
 return {actorKey:await opaquePlatformKey("workspace",user,role),subjects};
}

function insertEvents(events:PlatformEvent[],guard:string,bindings:unknown[]){
 return db().prepare(`INSERT INTO platform_events(id,owner,actor_role,stream,event_type,entity_id,company_key,investor_key,subject_key,source_event_id,source_type,observed_at,is_simulation,provenance,learning_eligible,data)
 SELECT json_extract(j.value,'$.id'),json_extract(j.value,'$.owner'),json_extract(j.value,'$.actorRole'),json_extract(j.value,'$.stream'),json_extract(j.value,'$.type'),json_extract(j.value,'$.entityId'),json_extract(j.value,'$.companyKey'),json_extract(j.value,'$.investorKey'),json_extract(j.value,'$.subjectKey'),json_extract(j.value,'$.sourceEventId'),json_extract(j.value,'$.sourceType'),json_extract(j.value,'$.observedAt'),json_extract(j.value,'$.isSimulation'),json_extract(j.value,'$.provenance'),json_extract(j.value,'$.learningEligible'),j.value FROM json_each(?) j WHERE ${guard}`).bind(JSON.stringify(events),...bindings);
}
async function guardedWorkspaceStatements(user:string,role:Role,w:Workspace,persistedVersion:number,serializedState:string,now:string){
 const events=await projectWorkspaceEvents(user,role,w,await identityContext(user,role),Date.parse(now));
 const guard="EXISTS (SELECT 1 FROM workspaces WHERE owner=? AND role=? AND version=? AND data=?)",bindings=[user,role,persistedVersion,serializedState];
 return [
  db().prepare(`INSERT INTO platform_projection_sync(owner,actor_role,stream,version,sync_token,updated_at) SELECT ?,?,'workspace',?,'',? WHERE ${guard} ON CONFLICT(owner,actor_role,stream) DO UPDATE SET version=excluded.version,updated_at=excluded.updated_at`).bind(user,role,persistedVersion,now,...bindings),
  db().prepare(`DELETE FROM platform_events WHERE owner=? AND actor_role=? AND stream='workspace' AND ${guard}`).bind(user,role,...bindings),
  insertEvents(events,guard,bindings)
 ];
}

/** Must be appended to the same D1 batch immediately after the guarded workspace UPDATE. */
export async function workspaceProjectionStatements(user:string,role:Role,w:Workspace,expectedVersion:number,serializedState:string,now:string|number=Date.now()){
 return guardedWorkspaceStatements(user,role,w,expectedVersion+1,serializedState,nowIso(now));
}

/** Idempotent migration/backfill on a normal service request; guarded against concurrent edits and opt-out. */
export async function ensurePlatformWorkspaceProjection(user:string,role:Role,w:Workspace,persistedData:string){
 const current=await db().prepare("SELECT version FROM platform_projection_sync WHERE owner=? AND actor_role=? AND stream='workspace'").bind(user,role).first<{version:number}>();
 if(current?.version===w.version)return;
 await db().batch(await guardedWorkspaceStatements(user,role,w,w.version,persistedData,new Date().toISOString()));
}

export async function readPlatformContext(user:string,role:Role,workspaceVersion?:number){
 const sync=await db().prepare("SELECT s.version FROM platform_projection_sync s JOIN workspaces w ON w.owner=s.owner AND w.role=s.actor_role AND w.version=s.version WHERE s.owner=? AND s.actor_role=? AND s.stream='workspace'").bind(user,role).first<{version:number}>();
 // A stale generation must not revive signals after revocation or overwrite a new preference decision.
 if(!sync||workspaceVersion!==undefined&&sync.version!==workspaceVersion)return {version:sync?.version??null,learningSignals:[],events:[],pairs:[]};
 const rows=await db().prepare("SELECT e.data FROM platform_events e WHERE e.owner=? AND e.actor_role=? AND EXISTS (SELECT 1 FROM workspaces w WHERE w.owner=e.owner AND w.role=e.actor_role AND w.version=?) AND (e.is_simulation=1 OR EXISTS (SELECT 1 FROM knowledge_entities k WHERE k.id=e.entity_id AND k.owner=e.owner AND k.role=e.actor_role)) ORDER BY e.observed_at DESC,e.id").bind(user,role,sync.version).all<{data:string}>();
 const events=rows.results.map(r=>JSON.parse(r.data) as PlatformEvent);
 return {version:sync.version,learningSignals:platformLearningSignals(events),events,pairs:summarizePlatformPairs(events)};
}

/** Metadata-only collection/review stream, refreshed by either side's mutation hooks. */
export async function syncPlatformEvidence(user:string,role:Role){
 const token=crypto.randomUUID(),now=new Date().toISOString();
 await db().prepare("INSERT INTO platform_projection_sync(owner,actor_role,stream,version,sync_token,updated_at) VALUES(?,?,'evidence',0,?,?) ON CONFLICT(owner,actor_role,stream) DO UPDATE SET version=version+1,sync_token=excluded.sync_token,updated_at=excluded.updated_at").bind(user,role,token,now).run();
 const identity=await identityContext(user,role);
 const [sources,reviews,links,existing]=await Promise.all([
  db().prepare("SELECT id,entity_id,collected_at FROM source_items WHERE owner=? AND role=?").bind(user,role).all<{id:string;entity_id:string;collected_at:string}>(),
  db().prepare("SELECT id,entity_id,review_status,created_at FROM risk_findings WHERE owner=? AND role=? AND review_status<>'pending'").bind(user,role).all<{id:string;entity_id:string;review_status:string;created_at:string}>(),
  db().prepare("SELECT id,subject_id,object_id,created_at FROM relationships WHERE owner=? AND role=? AND type='SAME_ENTITY_CANDIDATE' AND status='confirmed'").bind(user,role).all<{id:string;subject_id:string;object_id:string;created_at:string}>(),
  db().prepare("SELECT data FROM platform_events WHERE owner=? AND actor_role=? AND stream='evidence'").bind(user,role).all<{data:string}>()
 ]);
 const previous=existing.results.map(r=>JSON.parse(r.data) as PlatformEvent),byId=new Map(previous.map(e=>[e.id,e]));
 const events:PlatformEvent[]=[];
 const append=async(id:string,entityId:string,sourceType:PlatformEvent["sourceType"],sourceKind:string,type:PlatformEvent["type"],observedAt:string,provenance:PlatformEvent["provenance"])=>{
  const subject=identity.subjects.get(entityId);if(!subject)return;
  const eventId=await opaquePlatformKey("event",user,role,sourceType,id),old=byId.get(eventId);
  const time=sourceType!=="source"&&old?.sourceKind===sourceKind&&old.entityId===entityId?old.observedAt:observedAt;
  events.push({id:eventId,owner:user,actorRole:role,actorKey:identity.actorKey,...orientedPair(role,identity.actorKey,subject.key),subjectKey:subject.key,entityId,stream:"evidence",sourceEventId:id,sourceType,sourceKind,type,observedAt:time,isSimulation:false,provenance,learningEligible:false,reasonCode:null,feedbackId:null,outcome:null});
 };
 for(const s of sources.results)await append(s.id,s.entity_id,"source","collected","sourcecollected",s.collected_at,"observed");
 // Existing records have no review timestamp. Retain the first observation of the current status instead of inventing a historical review date.
 for(const r of reviews.results)if(["explained","verified","false_positive","inconclusive"].includes(r.review_status))await append(r.id,r.entity_id,"risk_review",r.review_status,"riskreview",now,"self_reported");
 for(const l of links.results)if(identity.subjects.has(l.object_id))await append(l.id,l.subject_id,"entity_link","same_entity_confirmed","entitylink",now,"self_reported");
 const signature=(items:PlatformEvent[])=>JSON.stringify([...items].sort((a,b)=>a.id.localeCompare(b.id)));
 if(signature(previous)===signature(events))return {events:events.length,changed:false};
 const guard="EXISTS (SELECT 1 FROM platform_projection_sync WHERE owner=? AND actor_role=? AND stream='evidence' AND sync_token=?)",bindings=[user,role,token];
 await db().batch([
  db().prepare(`DELETE FROM platform_events WHERE owner=? AND actor_role=? AND stream='evidence' AND ${guard}`).bind(user,role,...bindings),
  insertEvents(events,guard,bindings)
 ]);
 return {events:events.length,changed:true};
}
