import {ApiError,db,runtimeEnv} from "./server";
import type {Role} from "./model";
import {allowedSource,canonicalUrl,classifySourceChange,confirmedIdentityIds,deriveFindings,latestPublicSources,researchScope,retrieveEvidence,type ClaimType,type DiscoveryInput,type DiscoveryItem,type EvidenceClaim,type KnowledgeEntity,type KnowledgeRelationship,type KnowledgeRun,type KnowledgeSnapshot,type ReviewStatus,type RiskFinding,type SourceItem,type WatchEvent} from "./knowledge";
import {collectPublicSources,PublicSourceError,type PublicRecord} from "./public-sources";
import {extractEvidence,ruleExtraction,type ExtractionResult} from "./evidence-extraction";

const now=()=>new Date().toISOString();
const uid=(prefix:string)=>prefix+"_"+crypto.randomUUID();
const json=<T>(value:unknown,fallback:T):T=>{try{return JSON.parse(String(value)) as T}catch{return fallback}};
const txt=(value:unknown,max=500)=>String(value??"").trim().slice(0,max);
const sourceFrom=(r:Record<string,unknown>):SourceItem=>({id:String(r.id),entityId:String(r.entity_id),type:String(r.type),title:String(r.title),url:String(r.url),canonicalUrl:String(r.canonical_url),excerpt:String(r.excerpt),publishedAt:r.published_at?String(r.published_at):null,collectedAt:String(r.collected_at),visibility:r.visibility as SourceItem["visibility"],claimType:r.claim_type as ClaimType,contentHash:String(r.content_hash),lineageKey:String(r.lineage_key),documentId:r.document_id?String(r.document_id):null,extractionMode:r.extraction_mode as SourceItem["extractionMode"],extractionNote:String(r.extraction_note)});
const entityFrom=(r:Record<string,unknown>):KnowledgeEntity=>({id:String(r.id),name:String(r.name),kind:r.kind as KnowledgeEntity["kind"],canonicalUrl:String(r.canonical_url),status:r.status as KnowledgeEntity["status"],summary:String(r.summary),profile:json(r.profile,{}),createdAt:String(r.created_at),updatedAt:String(r.updated_at)});
const claimFrom=(r:Record<string,unknown>):EvidenceClaim=>({id:String(r.id),subjectId:String(r.subject_id),metric:String(r.metric),value:String(r.value),unit:String(r.unit),currency:String(r.currency),period:String(r.period),scope:String(r.scope),sourceId:String(r.source_id),excerpt:String(r.excerpt),publishedAt:r.published_at?String(r.published_at):null,collectedAt:String(r.collected_at),claimType:r.claim_type as ClaimType,status:r.status as EvidenceClaim["status"],visibility:r.visibility as EvidenceClaim["visibility"],confidence:r.confidence as EvidenceClaim["confidence"]});
const relationshipFrom=(r:Record<string,unknown>):KnowledgeRelationship=>({id:String(r.id),subjectId:String(r.subject_id),objectId:String(r.object_id),type:String(r.type),status:r.status as KnowledgeRelationship["status"],sourceId:r.source_id?String(r.source_id):null,note:String(r.note),createdAt:String(r.created_at)});
const findingFrom=(r:Record<string,unknown>):RiskFinding=>({id:String(r.id),entityId:String(r.entity_id),title:String(r.title),finding:String(r.finding),category:r.category as RiskFinding["category"],priority:r.priority as RiskFinding["priority"],comparison:r.comparison as RiskFinding["comparison"],claimIds:json(r.claim_ids,[]),sourceIds:json(r.source_ids,[]),hypotheses:json(r.hypotheses,[]),nextAction:String(r.next_action),reviewStatus:r.review_status as ReviewStatus,reviewNote:String(r.review_note),createdAt:String(r.created_at)});
const runFrom=(r:Record<string,unknown>):KnowledgeRun=>({id:String(r.id),action:String(r.action),status:r.status as KnowledgeRun["status"],query:String(r.query),source:String(r.source),entityIds:json(r.entity_ids,[]),sourceIds:json(r.source_ids,[]),message:String(r.message),createdAt:String(r.created_at)});
async function hash(text:string){const bytes=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(text));return [...new Uint8Array(bytes)].map(x=>x.toString(16).padStart(2,"0")).join("")}
async function getEntity(user:string,role:Role,id:string){const row=await db().prepare("SELECT * FROM knowledge_entities WHERE id=? AND owner=? AND role=?").bind(id,user,role).first<Record<string,unknown>>();if(!row)throw new ApiError("主体不存在或不属于当前账户与身份。",404);return entityFrom(row)}
async function getSource(user:string,role:Role,id:string){const row=await db().prepare("SELECT * FROM source_items WHERE id=? AND owner=? AND role=?").bind(id,user,role).first<Record<string,unknown>>();if(!row)throw new ApiError("来源不存在或无访问权限。",404);return sourceFrom(row)}
async function logRun(user:string,role:Role,input:Omit<KnowledgeRun,"id"|"createdAt">){const run={...input,id:uid("run"),createdAt:now()};await db().prepare("INSERT INTO knowledge_runs(id,owner,role,action,status,query,source,entity_ids,source_ids,message,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)").bind(run.id,user,role,run.action,run.status,run.query,run.source,JSON.stringify(run.entityIds),JSON.stringify(run.sourceIds),run.message,run.createdAt).run();return run}

export async function listKnowledge(user:string,role:Role):Promise<KnowledgeSnapshot>{
  const database=db();
  // Even sources marked public stay scoped to their collector's workspace. Visibility never widens this query.
  const [entities,sources,claims,relationships,findings,runs]=await Promise.all([
    database.prepare("SELECT * FROM knowledge_entities WHERE owner=? AND role=? ORDER BY updated_at DESC LIMIT 250").bind(user,role).all<Record<string,unknown>>(),
    database.prepare("SELECT * FROM source_items WHERE owner=? AND role=? ORDER BY collected_at DESC LIMIT 1000").bind(user,role).all<Record<string,unknown>>(),
    database.prepare("SELECT * FROM claims WHERE owner=? AND role=? ORDER BY collected_at DESC LIMIT 3000").bind(user,role).all<Record<string,unknown>>(),
    database.prepare("SELECT * FROM relationships WHERE owner=? AND role=? ORDER BY created_at DESC LIMIT 1000").bind(user,role).all<Record<string,unknown>>(),
    database.prepare("SELECT * FROM risk_findings WHERE owner=? AND role=? ORDER BY created_at DESC LIMIT 1000").bind(user,role).all<Record<string,unknown>>(),
    database.prepare("SELECT * FROM knowledge_runs WHERE owner=? AND role=? ORDER BY created_at DESC LIMIT 60").bind(user,role).all<Record<string,unknown>>()
  ]);
  return {entities:entities.results.map(entityFrom),sources:sources.results.map(sourceFrom),claims:claims.results.map(claimFrom),relationships:relationships.results.map(relationshipFrom),findings:findings.results.map(findingFrom),runs:runs.results.map(runFrom)};
}
async function identitySnapshot(user:string,role:Role,entityId:string):Promise<KnowledgeSnapshot>{
  // A selected subject must not disappear behind the overview's recency limits.
  // UNION terminates cycles, and every edge and returned record stays owner/role scoped.
  const prefix="WITH RECURSIVE identity(id) AS (SELECT id FROM knowledge_entities WHERE id=? AND owner=? AND role=? UNION SELECT CASE WHEN r.subject_id=i.id THEN r.object_id ELSE r.subject_id END FROM relationships r JOIN identity i ON r.subject_id=i.id OR r.object_id=i.id WHERE r.owner=? AND r.role=? AND r.type='SAME_ENTITY_CANDIDATE' AND r.status='confirmed') ";
  const query=(table:string,field:string)=>db().prepare(prefix+"SELECT t.* FROM "+table+" t WHERE t.owner=? AND t.role=? AND "+field+" ORDER BY t.id").bind(entityId,user,role,user,role,user,role).all<Record<string,unknown>>();
  const [entities,sources,claims,relationships,findings]=await Promise.all([query("knowledge_entities","t.id IN (SELECT id FROM identity)"),query("source_items","t.entity_id IN (SELECT id FROM identity)"),query("claims","t.subject_id IN (SELECT id FROM identity)"),query("relationships","(t.subject_id IN (SELECT id FROM identity) OR t.object_id IN (SELECT id FROM identity))"),query("risk_findings","t.entity_id IN (SELECT id FROM identity)")]);
  return {entities:entities.results.map(entityFrom),sources:sources.results.map(sourceFrom),claims:claims.results.map(claimFrom),relationships:relationships.results.map(relationshipFrom),findings:findings.results.map(findingFrom),runs:[]};
}
async function ensureEntity(user:string,role:Role,input:{id?:string;name:string;kind:KnowledgeEntity["kind"];url:string;status?:KnowledgeEntity["status"]}){
  if(input.id)return getEntity(user,role,input.id);
  const canonical=canonicalUrl(input.url),existing=await db().prepare("SELECT * FROM knowledge_entities WHERE owner=? AND role=? AND canonical_url=?").bind(user,role,canonical).first<Record<string,unknown>>();if(existing)return entityFrom(existing);
  const entity:KnowledgeEntity={id:uid("entity"),name:input.name.slice(0,180),kind:input.kind,canonicalUrl:canonical,status:input.status??"discovered",summary:"",profile:{},createdAt:now(),updatedAt:now()};
  await db().prepare("INSERT OR IGNORE INTO knowledge_entities(id,owner,role,name,kind,canonical_url,status,summary,profile,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)").bind(entity.id,user,role,entity.name,entity.kind,entity.canonicalUrl,entity.status,entity.summary,"{}",entity.createdAt,entity.updatedAt).run();
  // Resolve a concurrent ingest using the database unique identity, never a name match.
  const stored=await db().prepare("SELECT * FROM knowledge_entities WHERE owner=? AND role=? AND canonical_url=?").bind(user,role,canonical).first<Record<string,unknown>>();return stored?entityFrom(stored):entity;
}
type IngestTextInput={entityId?:string;name:string;kind:KnowledgeEntity["kind"];url:string;type:string;text:string;publishedAt?:string|null;claimType:ClaimType;visibility:"public"|"private";documentId?:string;lineageKey?:string;extraction?:ExtractionResult};
async function ingestText(user:string,role:Role,input:IngestTextInput){
  const entity=await ensureEntity(user,role,{id:input.entityId,name:input.name,kind:input.kind,url:input.url,status:input.visibility==="private"?"user_provided":"discovered"});
  const canonical=canonicalUrl(input.url),contentHash=await hash(input.text);
  const existing=await db().prepare("SELECT * FROM source_items WHERE owner=? AND role=? AND entity_id=? AND canonical_url=? AND content_hash=?").bind(user,role,entity.id,canonical,contentHash).first<Record<string,unknown>>();if(existing)return {entity,source:sourceFrom(existing),changed:false};
  const extraction=input.extraction??await extractEvidence(input.text,entity,{title:input.name,url:input.url,claimType:input.claimType},runtimeEnv);
  const source:SourceItem={id:uid("source"),entityId:entity.id,type:input.type,title:input.name,url:input.url,canonicalUrl:canonical,excerpt:input.text.slice(0,50000),publishedAt:input.publishedAt??null,collectedAt:now(),visibility:input.visibility,claimType:input.claimType,contentHash,lineageKey:input.lineageKey??canonical,documentId:input.documentId??null,extractionMode:extraction.mode,extractionNote:extraction.note};
  const statements=[db().prepare("INSERT INTO source_items(id,owner,role,entity_id,type,title,url,canonical_url,excerpt,published_at,collected_at,visibility,claim_type,content_hash,lineage_key,document_id,extraction_mode,extraction_note) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)").bind(source.id,user,role,entity.id,source.type,source.title,source.url,source.canonicalUrl,source.excerpt,source.publishedAt,source.collectedAt,source.visibility,source.claimType,source.contentHash,source.lineageKey,source.documentId,source.extractionMode,source.extractionNote)];
  for(const claim of extraction.claims){statements.push(db().prepare("INSERT INTO claims(id,owner,role,subject_id,metric,value,unit,currency,period,scope,source_id,excerpt,published_at,collected_at,claim_type,status,visibility,confidence) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)").bind(uid("claim"),user,role,entity.id,claim.metric,claim.value,claim.unit,claim.currency,claim.period,claim.scope,source.id,claim.excerpt,source.publishedAt,source.collectedAt,source.claimType,"unverified",source.visibility,"low"));}
  statements.push(db().prepare("UPDATE knowledge_entities SET summary=?,profile=?,updated_at=? WHERE id=? AND owner=? AND role=?").bind(extraction.summary,JSON.stringify({...entity.profile,...extraction.profile}),source.collectedAt,entity.id,user,role));
  try{await db().batch(statements)}catch(error){const concurrent=await db().prepare("SELECT * FROM source_items WHERE owner=? AND role=? AND entity_id=? AND canonical_url=? AND content_hash=?").bind(user,role,entity.id,canonical,contentHash).first<Record<string,unknown>>();if(concurrent)return {entity,source:sourceFrom(concurrent),changed:false};throw error;}
  return {entity:{...entity,summary:extraction.summary,profile:{...entity.profile,...extraction.profile},updatedAt:source.collectedAt},source,changed:true};
}
async function ingestRecord(user:string,role:Role,record:PublicRecord,entityId?:string){
  let extraction:ExtractionResult|undefined;
  if(record.structuredClaims)extraction={summary:record.description,profile:{},claims:record.structuredClaims.map(c=>({...c,currency:""})),mode:"rules",note:"公开 API 结构化字段；平台活动指标不代表商业化或独立验证。"};
  return ingestText(user,role,{entityId,name:record.name,kind:record.kind,url:record.url,type:record.type,text:record.text,publishedAt:record.publishedAt,claimType:record.claimType,visibility:"public",lineageKey:record.lineageKey,extraction});
}

export async function discoverKnowledge(user:string,role:Role,input:DiscoveryInput){
  if(!allowedSource(role,input.source))throw new ApiError("融资身份请采集基金官网、企业官网或公开投资新闻。",403);
  if(input.entityId&&(!input.url||!["website","fund"].includes(input.source)))throw new ApiError("只有单个明确的企业或基金网址可以附加至已有主体；批量搜索结果须分别建立线索并人工确认关联。");
  if(input.entityId)await getEntity(user,role,input.entityId);
  const items:DiscoveryItem[]=[],entityIds:string[]=[],sourceIds:string[]=[];let changed=0;
  try{
    const result=await collectPublicSources(input,runtimeEnv);
    // External model requests are bounded to at most three sources per search; further API records use transparent rule extraction.
    for(const [index,record] of result.records.entries()){
      let stored;
      if(index>=3&&!record.structuredClaims)stored=await ingestText(user,role,{entityId:input.entityId,name:record.name,kind:record.kind,url:record.url,type:record.type,text:record.text,publishedAt:record.publishedAt,claimType:record.claimType,visibility:"public",lineageKey:record.lineageKey,extraction:ruleExtraction(record.text)});
      else stored=await ingestRecord(user,role,record,input.entityId);
      const {entity,source}=stored;changed+=stored.changed?1:0;entityIds.push(entity.id);sourceIds.push(source.id);
      items.push({id:entity.id,entityId:entity.id,sourceId:source.id,name:entity.name,description:entity.summary||record.description,url:record.url,metric:record.metric,updated:record.publishedAt,collected:source.collectedAt,source:record.type,claimed:false});
    }
    await suggestIdentityRelationships(user,role);
    for(const id of [...new Set(entityIds)])await refreshIdentityResearch(user,role,id);
    const run=await logRun(user,role,{action:"discover",status:"success",query:input.query??input.url??"",source:input.source,entityIds,sourceIds,message:`采集 ${items.length} 条，新增或变化 ${changed} 条。${result.notice}`});
    return {items,source:input.source,time:run.createdAt,query:input.query??input.url??"",notice:result.notice,changed,run};
  }catch(error){const message=error instanceof PublicSourceError?error.message:"采集未完成，已成功入库的来源仍可查看。";await logRun(user,role,{action:"discover",status:items.length?"partial":"failed",query:input.query??input.url??"",source:input.source,entityIds,sourceIds,message});if(error instanceof PublicSourceError)throw new ApiError(error.message,error.status);throw error;}
}

export async function ingestDocumentEvidence(user:string,role:Role,input:{documentId:string;name:string;text:string;entityId?:string;entityName?:string}){
  // Defense in depth: a caller cannot attach text to another owner's or another role's document.
  const document=await db().prepare("SELECT id FROM documents WHERE id=? AND owner=? AND role=?").bind(input.documentId,user,role).first();if(!document)throw new ApiError("文件不存在或无访问权限。",404);
  const result=await ingestText(user,role,{entityId:input.entityId,name:input.entityName||input.name,kind:role==="founder"?"company":"company",url:"document://"+input.documentId,type:"document",text:input.text.slice(0,80000),claimType:"self_disclosed",visibility:"private",documentId:input.documentId,lineageKey:"document:"+input.documentId});
  const research=await refreshIdentityResearch(user,role,result.entity.id);await logRun(user,role,{action:"document-ingest",status:"success",query:input.name,source:"document",entityIds:[result.entity.id],sourceIds:[result.source.id],message:result.source.extractionNote});return {...result,...research};
}

export async function researchKnowledge(user:string,role:Role,entityId:string){
  const entity=await getEntity(user,role,entityId),snapshot=await identitySnapshot(user,role,entityId);
  const scope=researchScope(snapshot,entityId),scopeIds=new Set(scope.entityIds);
  const claims=snapshot.claims.filter(c=>scopeIds.has(c.subjectId)),sources=snapshot.sources.filter(s=>scopeIds.has(s.entityId)),relationships=snapshot.relationships.filter(r=>scopeIds.has(r.subjectId)||scopeIds.has(r.objectId));
  const drafts=deriveFindings(entity,claims,sources,relationships),findings:RiskFinding[]=[];
  const statements=[];
  for(const draft of drafts){const id="risk_"+(await hash(user+"\0"+role+"\0"+entityId+"\0"+draft.title+"\0"+draft.claimIds.slice().sort().join(","))).slice(0,32);const previous=snapshot.findings.find(f=>f.id===id);const finding:RiskFinding={...draft,claimIds:draft.claimIds.slice().sort(),sourceIds:draft.sourceIds.slice().sort(),id,createdAt:previous?.createdAt??now(),reviewStatus:"pending",reviewNote:""};findings.push(finding);
    // Compare and reset atomically against the stored row, so a concurrent unchanged refresh
    // cannot overwrite a newer human review with the status from an old snapshot.
    const changed="risk_findings.claim_ids<>excluded.claim_ids OR risk_findings.source_ids<>excluded.source_ids OR risk_findings.finding<>excluded.finding OR risk_findings.comparison<>excluded.comparison";
    statements.push(db().prepare("INSERT INTO risk_findings(id,owner,role,entity_id,title,finding,category,priority,comparison,claim_ids,source_ids,hypotheses,next_action,review_status,review_note,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET title=excluded.title,finding=excluded.finding,category=excluded.category,priority=excluded.priority,comparison=excluded.comparison,claim_ids=excluded.claim_ids,source_ids=excluded.source_ids,hypotheses=excluded.hypotheses,next_action=excluded.next_action,review_status=CASE WHEN "+changed+" THEN 'pending' ELSE risk_findings.review_status END,review_note=CASE WHEN "+changed+" THEN '' ELSE risk_findings.review_note END").bind(id,user,role,entityId,finding.title,finding.finding,finding.category,finding.priority,finding.comparison,JSON.stringify(finding.claimIds),JSON.stringify(finding.sourceIds),JSON.stringify(finding.hypotheses),finding.nextAction,finding.reviewStatus,finding.reviewNote,finding.createdAt));
  }
  if(statements.length)await db().batch(statements);
  // Retire obsolete findings, including deleted source references, while preserving active review decisions.
  const retained=new Set(findings.map(f=>f.id));const obsolete=snapshot.findings.filter(f=>f.entityId===entityId&&!retained.has(f.id));if(obsolete.length)await db().batch(obsolete.map(f=>db().prepare("DELETE FROM risk_findings WHERE id=? AND owner=? AND role=?").bind(f.id,user,role)));
  const stored=await db().prepare("SELECT * FROM risk_findings WHERE entity_id=? AND owner=? AND role=? ORDER BY created_at DESC").bind(entityId,user,role).all<Record<string,unknown>>(),currentFindings=stored.results.map(findingFrom);
  const reopened=currentFindings.filter(f=>f.reviewStatus==="pending"&&snapshot.findings.some(old=>old.id===f.id&&old.reviewStatus!=="pending"));
  for(const finding of reopened){const previous=snapshot.findings.find(f=>f.id===finding.id)!;await logRun(user,role,{action:"risk-refresh",status:"success",query:finding.id,source:"evidence",entityIds:[entityId],sourceIds:finding.sourceIds,message:"支持证据或发现已变化，复核状态已恢复为待核实。原状态："+previous.reviewStatus+"；原复核记录："+previous.reviewNote.slice(0,1000)});}
  return {entity,sources,claims,relationships,scope,findings:currentFindings};
}
async function refreshIdentityResearch(user:string,role:Role,entityId:string){
  const snapshot=await identitySnapshot(user,role,entityId);
  for(const id of confirmedIdentityIds(entityId,snapshot.relationships))if(id!==entityId)await researchKnowledge(user,role,id);
  return researchKnowledge(user,role,entityId);
}
export async function retrieveKnowledge(user:string,role:Role,query:string,entityId?:string){if(entityId)await getEntity(user,role,entityId);const snapshot=entityId?await identitySnapshot(user,role,entityId):await listKnowledge(user,role);return retrieveEvidence(snapshot,query,entityId)}

export async function addManualClaim(user:string,role:Role,input:Record<string,unknown>){
  const metric=txt(input.metric,120),value=txt(input.value,400),excerpt=txt(input.excerpt,3000);if(!metric||!value||!excerpt)throw new ApiError("请填写指标、数值或主张，以及原文/自述依据。");
  if(!excerpt.toLowerCase().includes(value.toLowerCase()))throw new ApiError("数值或主张须逐字出现在提供的原文中。");
  const identifier=uid("manual"),entityId=txt(input.entityId,100)||undefined,entityName=txt(input.entityName,180)||"手工资料主体";
  const sourceId=txt(input.sourceId,100);let source:SourceItem|undefined;if(sourceId){source=await getSource(user,role,sourceId);if(!source.excerpt.replace(/\s+/g," ").includes(excerpt.replace(/\s+/g," ")))throw new ApiError("引用内容未出现在所选来源原文中。");if(entityId&&source.entityId!==entityId)throw new ApiError("来源与主体不一致，请先确认关联。");}
  const result=await ingestText(user,role,{entityId:source?.entityId??entityId,name:entityName,kind:role==="founder"?"fund":"company",url:"manual://"+identifier,type:"manual",text:excerpt,claimType:"self_disclosed",visibility:"private",lineageKey:source?.lineageKey??"manual:"+identifier,extraction:{summary:excerpt.slice(0,450),profile:{},claims:[{metric,value,unit:txt(input.unit,30),currency:txt(input.currency,12).toUpperCase(),period:txt(input.period,120),scope:txt(input.scope,120),excerpt}],mode:"rules",note:source?"用户手工整理；引用已有来源 "+source.id:"用户手工提供的私有自述，尚未独立核实。"}});
  await logRun(user,role,{action:"manual-claim",status:"success",query:metric,source:"manual",entityIds:[result.entity.id],sourceIds:[result.source.id],message:"手工主张已保存为私有、未验证。"});return refreshIdentityResearch(user,role,result.entity.id);
}
export async function relateKnowledge(user:string,role:Role,input:Record<string,unknown>){
  const subjectId=txt(input.subjectId,100),objectId=txt(input.objectId,100);if(!subjectId||!objectId||subjectId===objectId)throw new ApiError("请选择两个不同的主体。");await Promise.all([getEntity(user,role,subjectId),getEntity(user,role,objectId)]);
  const sourceId=txt(input.sourceId,100)||null;if(sourceId){const source=await getSource(user,role,sourceId);if(source.entityId!==subjectId&&source.entityId!==objectId)throw new ApiError("关联依据必须来自其中一个主体的资料。");}
  const allowed=["REPO_MAINTAINED_BY","COMPANY_OWNS_PRODUCT","FUND_INVESTED_IN_COMPANY","SAME_ENTITY_CANDIDATE","RELATED_TO"];const type=txt(input.type,80);if(!allowed.includes(type))throw new ApiError("不支持该关系类型。");
  const status=input.status==="confirmed"?"confirmed":"suspected",note=txt(input.note,1000);if(status==="confirmed"&&!note)throw new ApiError("确认关系时请记录人工核验依据。");
  const [before,other]=await Promise.all([identitySnapshot(user,role,subjectId),identitySnapshot(user,role,objectId)]),affected=new Set([...confirmedIdentityIds(subjectId,before.relationships),...confirmedIdentityIds(objectId,other.relationships)]);
  const reverse=before.relationships.find(r=>r.type===type&&r.subjectId===objectId&&r.objectId===subjectId);
  const relationship:KnowledgeRelationship={id:uid("rel"),subjectId:reverse&&type==="SAME_ENTITY_CANDIDATE"?objectId:subjectId,objectId:reverse&&type==="SAME_ENTITY_CANDIDATE"?subjectId:objectId,type,status,sourceId,note,createdAt:now()};
  await db().prepare("INSERT INTO relationships(id,owner,role,subject_id,object_id,type,status,source_id,note,created_at) VALUES(?,?,?,?,?,?,?,?,?,?) ON CONFLICT(owner,role,subject_id,object_id,type) DO UPDATE SET status=excluded.status,source_id=excluded.source_id,note=excluded.note").bind(relationship.id,user,role,relationship.subjectId,relationship.objectId,type,status,sourceId,note,relationship.createdAt).run();
  if(type==="SAME_ENTITY_CANDIDATE")await db().prepare("UPDATE relationships SET status=?,source_id=?,note=? WHERE owner=? AND role=? AND type='SAME_ENTITY_CANDIDATE' AND ((subject_id=? AND object_id=?) OR (subject_id=? AND object_id=?))").bind(status,sourceId,note,user,role,subjectId,objectId,objectId,subjectId).run();
  await logRun(user,role,{action:"relate",status:"success",query:type,source:"human",entityIds:[subjectId,objectId],sourceIds:sourceId?[sourceId]:[],message:status==="confirmed"?"用户已记录人工核验并确认关系。":"已记录疑似关联，尚未合并主体。"});for(const id of affected)await researchKnowledge(user,role,id);return {ok:true,status};
}
export async function reviewFinding(user:string,role:Role,id:string,status:ReviewStatus,note:string){
  if(!["pending","explained","verified","false_positive","inconclusive"].includes(status))throw new ApiError("无效的复核状态。");if(status!=="pending"&&!note.trim())throw new ApiError("请填写复核依据，避免无记录地改变结论。");
  const result=await db().prepare("UPDATE risk_findings SET review_status=?,review_note=? WHERE id=? AND owner=? AND role=?").bind(status,note.slice(0,2000),id,user,role).run();if(!result.meta.changes)throw new ApiError("风险项不存在或无访问权限。",404);
  await logRun(user,role,{action:"review",status:"success",query:id,source:"human",entityIds:[],sourceIds:[],message:"人工复核状态："+status});return {ok:true};
}
export async function deleteKnowledge(user:string,role:Role,input:{id:string;kind?:string}){
  const subjectId=input.kind==="source"?(await getSource(user,role,input.id)).entityId:input.id,before=await identitySnapshot(user,role,subjectId),affected=confirmedIdentityIds(subjectId,before.relationships);
  if(input.kind==="source"){const source=await getSource(user,role,input.id);await db().batch([db().prepare("DELETE FROM claims WHERE source_id=? AND owner=? AND role=?").bind(source.id,user,role),db().prepare("UPDATE relationships SET source_id=NULL,status='suspected' WHERE source_id=? AND owner=? AND role=?").bind(source.id,user,role),db().prepare("DELETE FROM source_items WHERE id=? AND owner=? AND role=?").bind(source.id,user,role),db().prepare("UPDATE knowledge_entities SET summary=COALESCE((SELECT substr(excerpt,1,450) FROM source_items WHERE entity_id=? AND owner=? AND role=? ORDER BY collected_at DESC LIMIT 1),''),profile='{}',updated_at=? WHERE id=? AND owner=? AND role=?").bind(source.entityId,user,role,now(),source.entityId,user,role)]);await researchKnowledge(user,role,source.entityId);}
  else {await getEntity(user,role,input.id);await db().batch([db().prepare("DELETE FROM risk_findings WHERE entity_id=? AND owner=? AND role=?").bind(input.id,user,role),db().prepare("DELETE FROM relationships WHERE (subject_id=? OR object_id=?) AND owner=? AND role=?").bind(input.id,input.id,user,role),db().prepare("DELETE FROM claims WHERE subject_id=? AND owner=? AND role=?").bind(input.id,user,role),db().prepare("DELETE FROM source_items WHERE entity_id=? AND owner=? AND role=?").bind(input.id,user,role),db().prepare("DELETE FROM knowledge_entities WHERE id=? AND owner=? AND role=?").bind(input.id,user,role)]);}
  for(const id of affected)if(input.kind==="source"||id!==input.id)await researchKnowledge(user,role,id);
  return {ok:true};
}
export async function removeDocumentEvidence(user:string,role:Role,documentId:string){const rows=await db().prepare("SELECT id FROM source_items WHERE document_id=? AND owner=? AND role=?").bind(documentId,user,role).all<{id:string}>();for(const row of rows.results)await deleteKnowledge(user,role,{id:row.id,kind:"source"});}

/** Exact shared public URLs are candidate clues only. Name/domain similarity never establishes identity. */
export async function suggestIdentityRelationships(user:string,role:Role){
  const snapshot=await listKnowledge(user,role),byUrl=new Map<string,SourceItem[]>();let suggested=0;
  for(const source of latestPublicSources(snapshot.sources)){const entity=snapshot.entities.find(e=>e.id===source.entityId);if(!entity||!["company","fund","organization"].includes(entity.kind))continue;const group=byUrl.get(source.canonicalUrl)??[];group.push(source);byUrl.set(source.canonicalUrl,group);}
  for(const [url,group] of byUrl)for(let i=0;i<group.length&&suggested<20;i++)for(let j=i+1;j<group.length&&suggested<20;j++){
    const a=group[i],b=group[j];if(a.entityId===b.entityId||snapshot.entities.find(e=>e.id===a.entityId)?.kind!==snapshot.entities.find(e=>e.id===b.entityId)?.kind)continue;
    if(snapshot.relationships.some(r=>r.type==="SAME_ENTITY_CANDIDATE"&&((r.subjectId===a.entityId&&r.objectId===b.entityId)||(r.subjectId===b.entityId&&r.objectId===a.entityId))))continue;
    await db().prepare("INSERT OR IGNORE INTO relationships(id,owner,role,subject_id,object_id,type,status,source_id,note,created_at) VALUES(?,?,?,?,?,'SAME_ENTITY_CANDIDATE','suspected',?,?,?)").bind(uid("rel"),user,role,a.entityId,b.entityId,a.id,"系统线索：两个同类主体都记录了同一个完整公开网址 "+url+"。这可能是重复资料，也可能是共同被提及；须人工查证，不作为同一主体事实。",now()).run();suggested++;
  }
  if(suggested)await logRun(user,role,{action:"identity-suggest",status:"success",query:"完整公开网址相同",source:"evidence",entityIds:[],sourceIds:[],message:`发现 ${suggested} 条待人工核验的同主体候选；未扩展研究范围。`});return {suggested};
}

export async function watchKnowledge(user:string,role:Role,entityIds?:string[],options:{cursor?:string;limit?:number}={}){
  const snapshot=await listKnowledge(user,role),targets=[...new Set(entityIds??snapshot.entities.slice(0,4).map(e=>e.id))].sort();if(targets.length>6)throw new ApiError("每次巡检最多选择 6 个主体，请分批选择。");
  const entities=await Promise.all(targets.map(id=>getEntity(user,role,id)));
  const events:WatchEvent[]=[];
  // Query the selected subjects directly: snapshot display limits must never silently limit watch coverage.
  const rows=targets.length?await db().prepare("SELECT * FROM source_items WHERE owner=? AND role=? AND visibility='public' AND entity_id IN ("+targets.map(()=>"?").join(",")+") ORDER BY collected_at DESC").bind(user,role,...targets).all<Record<string,unknown>>():{results:[]};
  const latest=latestPublicSources(rows.results.map(sourceFrom)),groups=new Map<string,SourceItem[]>();
  for(const source of latest){const group=groups.get(source.canonicalUrl)??[];group.push(source);groups.set(source.canonicalUrl,group)}
  const urls=[...groups.keys()].sort();let last="";
  if(options.cursor){try{const cursor=JSON.parse(options.cursor) as {targets:string[];last:string};if(JSON.stringify(cursor.targets)!==JSON.stringify(targets)||typeof cursor.last!=="string"||!urls.includes(cursor.last))throw Error();last=cursor.last}catch{throw new ApiError("巡检范围已变化或续检游标无效，请重新开始本轮巡检。");}}
  const offset=last?urls.indexOf(last)+1:0,limit=Math.max(1,Math.min(12,Math.trunc(options.limit??12)||12)),selectedUrls=urls.slice(offset,offset+limit);
  if(!last)for(const entity of entities)if(!latest.some(s=>s.entityId===entity.id))events.push({entityId:entity.id,name:entity.name,changed:false,status:"skipped",categories:[],message:"无可重读的公开来源；私有资料未对外发送。"});
  for(const url of selectedUrls){const sources=groups.get(url)!;const sample=sources[0];
    try{
      const original=new URL(sample.url),path=original.pathname.replace(/^\/+|\/+$/g,"");
      const request:DiscoveryInput=sample.type==="github"&&original.hostname==="github.com"?{source:"github",query:"repo:"+path}:sample.type==="huggingface"&&original.hostname==="huggingface.co"?{source:"huggingface",query:path}:{source:sample.type==="fund"?"fund":"website",url:sample.url.replace(/^http:\/\//,"https://")};
      const result=await collectPublicSources(request,runtimeEnv),expected=canonicalUrl(request.url??sample.url);
      const record=result.records.find(r=>canonicalUrl(r.url)===expected);if(!record)throw new PublicSourceError("原始公开网址未在当前响应中找到；未替换为其他项目。",404);
      for(const source of sources){const entity=entities.find(e=>e.id===source.entityId)!;
        const extracted=record.structuredClaims?{summary:record.description,profile:{},claims:record.structuredClaims.map(c=>({...c,currency:""})),mode:"rules" as const,note:"公开 API 结构化字段；活动指标不代表商业化。"}:ruleExtraction(record.text);
        const stored=await ingestText(user,role,{entityId:entity.id,name:record.name,kind:entity.kind,url:source.url,type:source.type,text:record.text,publishedAt:record.publishedAt,claimType:record.claimType,visibility:"public",lineageKey:record.lineageKey,extraction:extracted});
        const changed=stored.source.contentHash!==source.contentHash,classification=changed?classifySourceChange(source.excerpt,record.text):{categories:[],evidence:[]};
        if(changed&&!stored.changed)await db().batch([db().prepare("UPDATE source_items SET collected_at=? WHERE id=? AND owner=? AND role=?").bind(now(),stored.source.id,user,role),db().prepare("UPDATE knowledge_entities SET updated_at=? WHERE id=? AND owner=? AND role=?").bind(now(),entity.id,user,role)]);
        if(changed){await refreshIdentityResearch(user,role,entity.id);await logRun(user,role,{action:"watch-change",status:"success",query:source.url,source:"watch",entityIds:[entity.id],sourceIds:[source.id,stored.source.id],message:"公开原文出现变化；分类仅按变化文本关键词，不代表业务事件已确认。主题："+classification.categories.join("、")+"；新增或修改片段："+(classification.evidence.join(" / ")||"原文有删除或结构调整，请比对版本。")});}
        events.push({entityId:entity.id,name:entity.name,changed,status:changed?"changed":"unchanged",sourceId:stored.source.id,previousSourceId:source.id,url:source.url,...classification,message:changed?"来源内容变化，已保留前后版本并重新核查；尚未认定业务状态改变。":"来源内容未变化。"});
      }
    }catch(error){for(const source of sources)events.push({entityId:source.entityId,name:entities.find(e=>e.id===source.entityId)!.name,changed:false,status:"failed",sourceId:source.id,url:source.url,categories:[],message:error instanceof PublicSourceError?error.message:"公开来源读取或保存失败，请稍后重试。"});}
  }
  const processed=offset+selectedUrls.length,remaining=urls.length-processed,nextCursor=remaining?JSON.stringify({targets,last:selectedUrls.at(-1)}):null;
  const failed=events.filter(e=>e.status==="failed").length,changed=events.filter(e=>e.changed).length;
  const run=await logRun(user,role,{action:"watch-check",status:failed||remaining?"partial":"success",query:"按需动态巡检",source:"watch",entityIds:targets,sourceIds:[...new Set(events.flatMap(e=>e.sourceId?[e.sourceId]:[]))],message:`本页检查 ${selectedUrls.length} 个公开网址，本轮累计 ${processed}/${urls.length} 个，剩余 ${remaining} 个；${changed} 条主体来源变化，${failed} 条读取失败。`});
  return {events,progress:{total:urls.length,processed,remaining,nextCursor},run,time:run.createdAt};
}
