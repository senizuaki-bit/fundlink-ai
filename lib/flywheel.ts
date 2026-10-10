import type {Role,Workspace} from "./model";
import type {KnowledgeSnapshot} from "./knowledge";
import {catalog,rankCandidates} from "./catalog";
import {evaluateMatch} from "./matching";
import {knowledgeCandidates} from "./knowledge-adapter";
import {learningInsights} from "./learning-insights";
import {consentedSignals} from "./learning";
export type FlywheelMetric={key:string;label:string;numerator:number;denominator:number|null;value:number|null;unit:"count"|"percent";definition:string};
export type FlywheelStage={key:string;title:string;count:number;detail:string;page:string};
export type FlywheelQueueItem={id:string;entityId:string;name:string;kind:"risk"|"coverage"|"identity"|"freshness";priority:"high"|"medium"|"low";reason:string;nextAction:string;page:string};
export type FlywheelComparisonRow={entityId:string;name:string;simulation:boolean;beforeRank:number;afterRank:number;beforeScore:number;afterScore:number;adjustment:number};
export type FlywheelSnapshot={id?:string;createdAt:string;policyVersion:string;role:Role;workspaceVersion:number;metrics:FlywheelMetric[];stages:FlywheelStage[];comparison:{rows:FlywheelComparisonRow[];eligibleCount:number;movedCount:number;adjustedCount:number;guardedCount:number;realCount:number;simulationCount:number};queue:FlywheelQueueItem[];signals:{authorized:boolean;records:number;realRecords:number;simulationRecords:number;exposed:number;engaged:number};limitations:string[]};
export type FlywheelReport={current:FlywheelSnapshot;history:FlywheelSnapshot[]};

const DAY=86_400_000;
export function buildFlywheel(w:Workspace,k:KnowledgeSnapshot,role:Role,now=Date.now()):FlywheelSnapshot {
 const entities=[...catalog(role),...knowledgeCandidates(k,role)],byId=new Map(entities.map(e=>[e.id,e]));
 const insights=learningInsights(w,entities,now);
 const businessKinds=new Set(["contact","mutual","reply","meeting","diligence","terms","decision","closed"]);
 const observed=consentedSignals(w,now).filter(s=>byId.has(s.entityId)&&Date.parse(s.time)>=now-90*DAY&&Date.parse(s.time)<=now);
 const realSignals=observed.filter(s=>byId.get(s.entityId)?.real&&s.mode!=="simulation"&&(!businessKinds.has(s.kind)||s.mode==="real"));
 const realSignalIds=new Set(realSignals.map(s=>s.id)),demoSignals=observed.filter(s=>!realSignalIds.has(s.id));
 const exposed=new Map<string,number>();
 for(const s of realSignals.filter(s=>s.kind==="exposure"))exposed.set(s.entityId,Math.min(exposed.get(s.entityId)??Infinity,Date.parse(s.time)));
 const eventTime=(s:typeof realSignals[number])=>s.feedbackId?Date.parse(w.businessFeedback?.find(f=>f.id===s.feedbackId)?.occurredAt||""):Date.parse(s.time);
 const engaged=new Set(realSignals.filter(s=>["save","research","interest","reply","meeting","diligence","terms","decision"].includes(s.kind)&&exposed.has(s.entityId)&&eventTime(s)>=exposed.get(s.entityId)!).map(s=>s.entityId));
 const feedback=(w.businessFeedback||[]).filter(f=>byId.get(f.entityId)?.real&&Date.parse(f.occurredAt)<=now&&Date.parse(f.occurredAt)>=now-90*DAY);
 const cohort=(stages:string[])=>new Set(feedback.filter(f=>stages.includes(f.stage)&&exposed.has(f.entityId)&&Date.parse(f.occurredAt)>=exposed.get(f.entityId)!).map(f=>f.entityId)).size;
 const sourceIds=new Set(k.sources.map(s=>s.id)),covered=new Set(k.sources.map(s=>s.entityId));
 const reviewed=k.findings.filter(f=>["verified","explained","false_positive"].includes(f.reviewStatus));
 const identity=k.relationships.filter(r=>r.type==="SAME_ENTITY_CANDIDATE"),dated=k.sources.filter(s=>Number.isFinite(Date.parse(s.collectedAt))&&Date.parse(s.collectedAt)<=now);
 const metric=(key:string,label:string,numerator:number,denominator:number|null,definition:string):FlywheelMetric=>({key,label,numerator,denominator,value:denominator===null?numerator:denominator?Math.round(numerator/denominator*1000)/10:null,unit:denominator===null?"count":"percent",definition});
 const metrics=[
  metric("coverage","资料覆盖",k.entities.filter(e=>covered.has(e.id)).length,k.entities.length,"至少有一条可追溯来源的主体 / 当前知识库主体；包括授权私有资料，不等于事实已核验。"),
  metric("traceability","主张可追溯",k.claims.filter(c=>sourceIds.has(c.sourceId)).length,k.claims.length,"能解析到当前身份可见来源的主张 / 当前主张。"),
  metric("identity","主体关联确认",identity.filter(r=>r.status==="confirmed").length,identity.length,"人工确认同一主体关系 / 待确认及已确认同一主体关系；不是独立审计的对齐准确率。"),
  metric("false_positive","复核误报占比",reviewed.filter(f=>f.reviewStatus==="false_positive").length,reviewed.length,"被标注误报 / 已证实、已解释或误报的提示；待复核与无法确认不进入分母，存在选择偏差。"),
  metric("freshness","近 30 天来源",dated.filter(s=>now-Date.parse(s.collectedAt)<=30*DAY).length,dated.length,"采集时间在近 30 天的来源 / 时间有效的来源；采集新不代表内容新。"),
  metric("engagement","曝光后互动率",engaged.size,exposed.size,"近 90 天且当前授权后，真实来源候选曝光后发生收藏、研究、兴趣或业务反馈的对象 / 真实曝光对象；按主体去重，仅覆盖留存事件。"),
  metric("positive_reply","自报正向回复率",cohort(["positive_reply"]),exposed.size,"当前曝光队列中，曝光后手工登记实际正向回复的对象 / 真实曝光对象；用户自报，未独立核验，不推算跳过的阶段。"),
  metric("meeting","自报会谈转化",cohort(["meeting"]),exposed.size,"当前曝光队列中，曝光后手工登记实际会谈的对象 / 真实曝光对象；不包含模拟交易阶段。"),
  metric("diligence","自报尽调转化",cohort(["diligence"]),exposed.size,"当前曝光队列中，曝光后手工登记实际进入尽调的对象 / 真实曝光对象；不代表融资完成。"),
  metric("outcomes","近 90 天实际反馈",feedback.length,null,"当前身份手工登记的实际业务反馈记录；用户自报，不作为机构承诺或已核验事实。")
 ];
 // Keep the explicit preference identical: the comparison isolates only authorized behavior.
 const baseline=rankCandidates(entities,{...w,settings:{...w.settings,learning:false}},role),current=rankCandidates(entities,w,role);
 const before=new Map(baseline.map((x,i)=>[x.entity.id,{rank:i+1,score:x.match.score}]));
 const rows=current.map((x,i)=>({entityId:x.entity.id,name:x.entity.name,simulation:!x.entity.real||x.entity.source==="demo",beforeRank:before.get(x.entity.id)!.rank,afterRank:i+1,beforeScore:before.get(x.entity.id)!.score,afterScore:x.match.score,adjustment:x.match.feedbackAdjustment}));
 const queue:FlywheelQueueItem[]=[];
 for(const f of k.findings.filter(f=>["pending","inconclusive","verified"].includes(f.reviewStatus))){
  if(f.comparison==="consistent"&&f.reviewStatus==="verified")continue;
  const entity=k.entities.find(e=>e.id===f.entityId);if(!entity)continue;
  queue.push({id:f.id,entityId:entity.id,name:entity.name,kind:"risk",priority:f.reviewStatus==="verified"?"high":f.priority,reason:f.title+(f.reviewStatus==="verified"?" · 人工标注已证实":f.reviewStatus==="inconclusive"?" · 尚无法确认":" · 待复核"),nextAction:f.nextAction,page:"knowledge"});
 }
 for(const relation of identity.filter(r=>r.status==="suspected")){
  const e=k.entities.find(e=>e.id===relation.subjectId);if(e)queue.push({id:relation.id,entityId:e.id,name:e.name,kind:"identity",priority:"medium",reason:"疑似同一主体，尚不能联合研究",nextAction:"查看双方原始来源，确认或撤回主体关联。",page:"knowledge"});
 }
 for(const e of k.entities){
  const sources=k.sources.filter(s=>s.entityId===e.id),candidate=byId.get(e.id);
  if(!sources.length)queue.push({id:"coverage:"+e.id,entityId:e.id,name:e.name,kind:"coverage",priority:"medium",reason:"缺少来源，无法建立可靠画像",nextAction:"采集主体官网或上传你有权使用的原始资料。",page:"radar"});
  else if(candidate){const match=evaluateMatch(candidate,w,role,entities);if(match.unknown.length)queue.push({id:"profile:"+e.id,entityId:e.id,name:e.name,kind:"coverage",priority:"medium",reason:match.unknown.slice(0,3).join("；"),nextAction:"核实缺失条件；不能仅凭反馈将待核实对象提升为合格推荐。",page:"knowledge"})}
  const last=Math.max(...sources.filter(s=>s.visibility==="public").map(s=>Date.parse(s.collectedAt)).filter(Number.isFinite));
  if(sources.some(s=>s.visibility==="public")&&Number.isFinite(last)&&now-last>30*DAY)queue.push({id:"freshness:"+e.id,entityId:e.id,name:e.name,kind:"freshness",priority:"low",reason:"最近一次采集已超过 30 天",nextAction:"关注该主体，巡检公开来源并重新研究发生变化的资料。",page:"watch"});
 }
 const priority={high:0,medium:1,low:2};queue.sort((a,b)=>priority[a.priority]-priority[b.priority]||a.id.localeCompare(b.id));
 return {createdAt:new Date(now).toISOString(),policyVersion:insights.policyVersion,role,workspaceVersion:w.version,metrics,
  stages:[
   {key:"collect",title:"积累资料",count:k.sources.length,detail:`${k.entities.length} 个主体 · 原始来源可回溯`,page:"radar"},
   {key:"profile",title:"完善画像",count:k.claims.length,detail:`${identity.filter(r=>r.status==="confirmed").length} 条同主体关联已确认`,page:"knowledge"},
   {key:"recommend",title:"发现与研究",count:current.length,detail:`${rows.filter(r=>!r.simulation).length} 个真实候选符合全部条件`,page:"discover"},
   {key:"feedback",title:"积累反馈",count:observed.length,detail:`${feedback.length} 条实际业务自报 · ${demoSignals.length} 条模拟信号`,page:"feedback"},
   {key:"improve",title:"改进下一轮",count:queue.length,detail:`${insights.suggestions.length} 条待确认偏好 · 风险与资料待办`,page:"knowledge"}
  ],comparison:{rows:rows.slice(0,30),eligibleCount:rows.length,movedCount:rows.filter(r=>r.beforeRank!==r.afterRank).length,adjustedCount:rows.filter(r=>r.beforeScore!==r.afterScore).length,guardedCount:entities.filter(e=>!w.rejected[e.id]&&!evaluateMatch(e,w,role,entities).eligible).length,realCount:rows.filter(r=>!r.simulation).length,simulationCount:rows.filter(r=>r.simulation).length},queue:queue.slice(0,30),signals:{authorized:insights.enabled,records:observed.length,realRecords:realSignals.length,simulationRecords:demoSignals.length,exposed:exposed.size,engaged:engaged.size},limitations:[
   "指标限当前账户与身份：最近 250 个主体、1,000 个来源、3,000 条主张、1,000 条关系/发现；行为最多留存 500 条、使用本次授权后近 90 天记录，不能视为全站指标。",
   "曝光按实际进入视口的推荐对象记录，同一对象每天去重；曝光分母与后续互动均按主体去重。旧版本没有曝光记录，不回填或推算。",
   "排序对照使用同一候选、硬条件和已确认偏好，只开关行为调整；名次变化不是推荐质量提高的证明，也不是模型训练或因果实验。",
   "实际业务反馈由用户手工登记并标注自报；模拟流程独立统计，真实回复与成交尚未连接外部系统。",
   "复核为已解释或误报的提示退出当前待办；保留证据与复核记录，新的来源变化仍可能产生新的待核查结论。"
  ]};
}
