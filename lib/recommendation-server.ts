import {ApiError,db} from "./server";
import {blankWorkspace,normalizeWorkspace,type Role} from "./model";
import {catalog} from "./catalog";
import {knowledgeCandidates} from "./knowledge-adapter";
import {listKnowledge} from "./knowledge-server";
import {evaluateMatch,hybridRetrieve,rankCandidates,type RankedCandidate} from "./matching";
import {ensurePlatformWorkspaceProjection,readPlatformContext,syncPlatformEvidence} from "./platform-flywheel-server";
import type {RecommendationFeed} from "./recommendations";

type WorkspaceRow={data:string;version:number};
const conflict=()=>new ApiError("工作区已更新，请刷新后重新获取推荐。",409);

/** The persisted workspace and shared event projection are the sole ranking input. */
export async function getRecommendations(user:string,role:Role,query="",expectedVersion?:number):Promise<RecommendationFeed>{
 if(role!=="investor"&&role!=="founder")throw new ApiError("请选择投资或融资身份。");
 if(typeof query!=="string"||query.length>300)throw new ApiError("检索内容不能超过 300 字。");
 if(expectedVersion!==undefined&&(!Number.isSafeInteger(expectedVersion)||expectedVersion<0))throw new ApiError("工作区版本格式不正确。");
 let row=await db().prepare("SELECT data,version FROM workspaces WHERE owner=? AND role=?").bind(user,role).first<WorkspaceRow>();
 if(!row){
  if(expectedVersion!==undefined&&expectedVersion!==0)throw conflict();
  await db().prepare("INSERT INTO workspaces(owner,role,data,version,updated_at) VALUES(?,?,?,0,?) ON CONFLICT(owner,role) DO NOTHING").bind(user,role,JSON.stringify(blankWorkspace()),new Date().toISOString()).run();
  row=await db().prepare("SELECT data,version FROM workspaces WHERE owner=? AND role=?").bind(user,role).first<WorkspaceRow>();
 }
 if(!row)throw new ApiError("工作区暂不可用，请稍后重试。",503);
 const w=normalizeWorkspace({...JSON.parse(row.data),version:row.version});
 if(expectedVersion!==undefined&&expectedVersion!==w.version)throw conflict();
 await ensurePlatformWorkspaceProjection(user,role,w,row.data);
 const knowledgeAllowed=w.settings.knowledge!==false;
 const knowledge=knowledgeAllowed?await listKnowledge(user,role):null;
 if(knowledgeAllowed)await syncPlatformEvidence(user,role);
 const context=await readPlatformContext(user,role,w.version);
 if(context.version!==w.version)throw conflict();
 // Never recover from projection failures by ranking the raw workspace signal array.
 const projected={...w,signals:context.learningSignals};
 const entities=[...catalog(role),...(knowledge?knowledgeCandidates(knowledge,role):[])];
 const uniqueEntities=[...new Map(entities.map(entity=>[entity.id,entity])).values()];
 const normalizedQuery=query.trim(),ranked=rankCandidates(uniqueEntities,projected,role,normalizedQuery);
 const orderedById=new Map(ranked.map(candidate=>[candidate.entity.id,candidate]));
 const evaluated:RankedCandidate[]=uniqueEntities.map(entity=>{
  const ordered=orderedById.get(entity.id);if(ordered)return ordered;
  const match=evaluateMatch(entity,projected,role,uniqueEntities),retrieval=hybridRetrieve(entity,normalizedQuery);
  return {entity,match,retrieval,rankScore:match.score,explorationReason:""};
 });
 // Catch opt-out, preference edits and profile changes during evidence/ranking work.
 const current=await db().prepare("SELECT version FROM workspaces WHERE owner=? AND role=?").bind(user,role).first<{version:number}>();
 if(!current||current.version!==w.version)throw conflict();
 return {role,workspaceVersion:w.version,generatedAt:new Date().toISOString(),evaluated,order:ranked.map(candidate=>({entityId:candidate.entity.id,rankScore:candidate.rankScore,explorationReason:candidate.explorationReason})),pipeline:{version:context.version,eventCount:context.events.filter(event=>knowledgeAllowed||event.stream==="workspace").length}};
}
