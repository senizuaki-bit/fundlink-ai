import type {Entity} from "./catalog";
import type {KnowledgeEntity,KnowledgeSnapshot} from "./knowledge";
import type {Role} from "./model";
export const emptyKnowledge=():KnowledgeSnapshot=>({entities:[],sources:[],claims:[],relationships:[],findings:[],runs:[]});
export function knowledgeEntity(e:KnowledgeEntity,k:KnowledgeSnapshot):Entity{
 const p=e.profile,sources=k.sources.filter(s=>s.entityId===e.id),claims=k.claims.filter(c=>c.subjectId===e.id);
 const value=(key:string)=>p[key]||claims.find(c=>c.metric===key)?.value||"";
 const list=(key:string)=>value(key).split(/[、,，;]/).filter(Boolean);
 const amount=Number(value("amount")),min=Number(value("min")),max=Number(value("max"));
 const numeric=(n:number)=>Number.isFinite(n)&&n>0?n:0;
 const unknownFields=[...(!value("amount")&&!value("min")?["amount"]:[]),...(!value("stage")?["stage"]:[]),...(!value("region")?["region"]:[]),...(!value("currency")?["currency"]:[]),"identity","paid","conflict"];
 return {id:e.id,name:e.name,en:e.kind==="fund"?"公开资本线索":"公开研究线索",initial:e.name.slice(0,2).toUpperCase(),sector:value("sector")||"待确认",tags:[e.kind,"来源可追溯"],stage:value("stage")||"待确认",stages:list("stage"),region:value("region")||"待确认",amount:numeric(amount),min:numeric(min),max:numeric(max),desc:e.summary||"待补充主体信息",metric:"可追溯来源",metricValue:sources.length+" 条",team:value("team")||"待确认",resources:list("resources"),risk:k.findings.find(f=>f.entityId===e.id&&f.reviewStatus==="pending")?.title||"主体与合作意愿待核实",color:"#74bca6",paid:false,competitor:false,real:true,source:sources.some(s=>s.visibility==="private")?"authorized":"public",currency:value("currency")||undefined,verifiedIdentity:false,authorized:false,paidKnown:false,conflictKnown:false,unknownFields,
 evidenceRecords:sources.map(s=>({id:s.id,name:s.title,date:s.publishedAt||s.collectedAt,type:s.type,claim:s.excerpt.slice(0,500),url:s.url||undefined,status:s.claimType==="human_verified"?"verified":s.claimType==="self_disclosed"?"self-reported":"public"}))};
}
export function knowledgeCandidates(k:KnowledgeSnapshot,role:Role){return k.entities.filter(e=>role==="founder"?e.kind==="fund":["company","repository","model","organization"].includes(e.kind)).map(e=>knowledgeEntity(e,k));}
