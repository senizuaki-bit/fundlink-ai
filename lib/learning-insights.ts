import type {Entity} from "./catalog";
import type {BehaviorSignal,Workspace} from "./model";
import {consentedSignals,hasLearningConsent} from "./learning";

export type LearningScope="demo"|"real";
export type LearningTier="exposure"|"weak"|"medium"|"strong"|"negative";
export type WeightedLearningSignal={
 id:string;entityId:string;kind:BehaviorSignal["kind"];time:string;detail?:string;
 scope:LearningScope;sector:string;tier:LearningTier;baseWeight:number;decay:number;weight:number;
};
export type SectorLearningInsight={
 id:string;scope:LearningScope;sector:string;supportingSignalIds:string[];entityIds:string[];
 counts:{weak:number;medium:number;strong:number;exposure:number;negative:number};
 mediumEntityCount:number;strongEntityCount:number;exposureEntityCount:number;
 positiveWeight:number;negativeWeight:number;normalizedWeight:number;
 exposureCoverage:number;eligible:boolean;reason:string;
};
export type LearningInsights={
 enabled:boolean;windowDays:90;policyVersion:"consent-exposure-v1";
 signals:WeightedLearningSignal[];sectors:SectorLearningInsight[];suggestions:SectorLearningInsight[];
 excludedCount:number;summary:string;
};

const DAY=86_400_000;
const clamp=(n:number,min:number,max:number)=>Math.max(min,Math.min(max,n));
const round=(n:number)=>Math.round(n*1000)/1000;
const BUSINESS=new Set<BehaviorSignal["kind"]>(["contact","mutual","reply","meeting","diligence","terms","decision","closed"]);
export const learningScope=(entity:Entity):LearningScope=>entity.source==="demo"||entity.real===false?"demo":"real";

function signalValue(signal:BehaviorSignal):{tier:LearningTier;weight:number}|null {
 switch(signal.kind){
  case "exposure":return {tier:"exposure",weight:0};
  case "view":case "search":return {tier:"weak",weight:.15};
  case "batch":return {tier:"weak",weight:/跳过/.test(signal.detail||"")?-.05:0};
  case "save":return {tier:"medium",weight:1};
  case "research":return {tier:"medium",weight:1.5};
  case "interest":return {tier:"strong",weight:2};
  case "contact":return {tier:"strong",weight:2};
  case "mutual":case "reply":case "meeting":return {tier:"strong",weight:3};
  case "diligence":return {tier:"strong",weight:4};
  case "terms":return {tier:"strong",weight:4.5};
  // Only server-stamped, explicitly self-reported completion is positive evidence.
  // A decision screen or simulation says nothing about the actual business outcome.
  case "decision":return signal.mode==="real"&&signal.feedbackId&&signal.outcome==="won"?{tier:"strong",weight:5}:null;
  // A lost deal can reflect timing, price, or other circumstances. It does not by
  // itself mean the entire sector is unsuitable; explicit rejection is separate.
  case "closed":case "risk_review":return null;
  case "reject":return /行业|方向|阶段|不符|金额|资源/.test(signal.detail||"")?{tier:"negative",weight:-1}:null;
  default:return null;
 }
}

/** Derived, user-local statistics. No private data is used to train a shared model. */
export function learningInsights(w:Workspace,entities:Entity[],now=Date.now()):LearningInsights {
 const enabled=hasLearningConsent(w,now),empty:LearningInsights={enabled,windowDays:90,policyVersion:"consent-exposure-v1",signals:[],sectors:[],suggestions:[],excludedCount:0,summary:"行为学习未授权，不使用历史行为生成建议。"};
 if(!enabled)return empty;
 const entityMap=new Map(entities.map(e=>[e.id,e])),seen=new Set<string>(),signals:WeightedLearningSignal[]=[];
 const consented=consentedSignals(w,now);
 for(const signal of [...consented].sort((a,b)=>Date.parse(b.time)-Date.parse(a.time)||a.id.localeCompare(b.id))){
  const entity=entityMap.get(signal.entityId),age=(now-Date.parse(signal.time))/DAY;
  if(!entity||!Number.isFinite(age)||age<0||age>90)continue;
  const scope=learningScope(entity);
  // Old deal transitions were explicitly a simulation. A simulated workflow on a real
  // source must never improve the real recommendation model.
  const simulated=signal.mode==="simulation"||(BUSINESS.has(signal.kind)&&signal.mode!=="real");
  if(scope==="real"&&simulated||scope==="demo"&&signal.mode==="real")continue;
  const value=signalValue(signal);if(!value)continue;
  const key=signal.entityId+":"+signal.kind;
  // Latest event per object and type; repeated refreshes and clicks do not add weight.
  if(seen.has(key))continue;seen.add(key);
  const decay=Math.pow(.5,Math.max(0,age)/30);
  signals.push({id:signal.id,entityId:signal.entityId,kind:signal.kind,time:signal.time,detail:signal.detail,scope,sector:entity.sector,tier:value.tier,baseWeight:value.weight,decay:round(decay),weight:round(value.weight*decay)});
 }
 const groups=new Map<string,WeightedLearningSignal[]>();
 for(const signal of signals){
  if(!signal.sector||signal.sector==="待确认")continue;
  const key=signal.scope+":"+signal.sector,group=groups.get(key)||[];group.push(signal);groups.set(key,group);
 }
 const sectors:SectorLearningInsight[]=[];
 for(const [id,group] of groups){
  const scope=group[0].scope,sector=group[0].sector;
  const medium=group.filter(s=>s.tier==="medium"),strong=group.filter(s=>s.tier==="strong"),support=group.filter(s=>s.tier==="medium"||s.tier==="strong"||s.tier==="negative");
  const exposed=new Set(group.filter(s=>s.tier==="exposure").map(s=>s.entityId));
  const supported=new Set([...medium,...strong].map(s=>s.entityId)),observed=new Set([...exposed,...support.map(s=>s.entityId)]);
  const perEntity=new Map<string,number>();
  for(const s of [...medium,...strong])perEntity.set(s.entityId,(perEntity.get(s.entityId)||0)+s.weight);
  const positiveWeight=round([...perEntity.values()].reduce((sum,weight)=>sum+Math.min(6,weight),0));
  const negativeWeight=round(group.filter(s=>s.tier==="negative").reduce((sum,s)=>sum+s.weight,0));
  // Normalizing by distinct observed objects prevents a frequently exposed sector
  // winning on total clicks alone. A three-object prior dampens sparse samples.
  // Missing exposure never invents a conversion denominator or a negative label.
  const normalizedWeight=round((positiveWeight+negativeWeight)/(observed.size+3));
  const mediumEntityCount=new Set(medium.map(s=>s.entityId)).size,strongEntityCount=new Set(strong.map(s=>s.entityId)).size;
  const enough=supported.size>=3&&strongEntityCount>=2||supported.size>=4&&medium.length>=6;
  const threshold=enough&&positiveWeight+negativeWeight>=5&&normalizedWeight>=.25;
  const samePreference=w.preference===sector&&(!w.preferenceScope||w.preferenceScope===scope);
  const ignored=w.ignoredSuggestion===sector&&(!w.ignoredSuggestionScope||w.ignoredSuggestionScope===scope);
  const eligible=threshold&&!samePreference&&!ignored;
  const counts={weak:group.filter(s=>s.tier==="weak").length,medium:medium.length,strong:strong.length,exposure:exposed.size,negative:group.filter(s=>s.tier==="negative").length};
  const exposureCoverage=supported.size?round([...supported].filter(entityId=>exposed.has(entityId)).length/supported.size):0;
  let reason=!enough?"需要至少 3 个对象且其中 2 个有强兴趣/业务信号，或 4 个对象的至少 6 条去重中兴趣信号；浏览、搜索和换批不能触发画像建议。":!threshold?"证据经 90 天窗口、时间衰减和曝光归一化后不足，继续观察。":samePreference?"这一方向已是当前明确偏好。":ignored?"你已忽略这一方向的建议，不再重复提示。":"多个独立对象的中强反馈达到建议门槛；可确认轻量排序偏好，硬条件保持不变。";
  reason+=exposed.size?` 已按 ${observed.size} 个有曝光或有效反馈的对象归一化。`:" 尚无曝光记录，使用保守先验；不能据此计算转化率。";
  if(scope==="demo")reason+=" 这些是模拟案例的反馈，仅作用于模拟推荐。";
  sectors.push({id,scope,sector,supportingSignalIds:support.map(s=>s.id),entityIds:[...supported],counts,mediumEntityCount,strongEntityCount,exposureEntityCount:exposed.size,positiveWeight,negativeWeight,normalizedWeight,exposureCoverage,eligible,reason});
 }
 sectors.sort((a,b)=>b.normalizedWeight-a.normalizedWeight||b.positiveWeight-a.positiveWeight||a.id.localeCompare(b.id));
 const suggestions=sectors.filter(s=>s.eligible);
 return {...empty,signals,sectors,suggestions,excludedCount:(w.signals||[]).length-signals.length,summary:`当前授权周期内，近 90 天有 ${signals.length} 类去重信号、${suggestions.length} 条待确认建议；模拟与真实资料分开学习。`};
}

/** Capped directional adjustment; this never modifies a hard matching constraint. */
export function behaviorAdjustment(entity:Entity,w:Workspace,entities:Entity[],now=Date.now()):{adjustment:number;reasons:string[]} {
 if(!hasLearningConsent(w,now))return {adjustment:0,reasons:[]};
 const all=entities.some(e=>e.id===entity.id)?entities:[...entities,entity];
 const insight=learningInsights(w,all,now),scope=learningScope(entity);
 const direct=insight.signals.filter(s=>s.entityId===entity.id&&s.scope===scope);
 const weak=clamp(direct.filter(s=>s.tier==="weak").reduce((n,s)=>n+s.weight,0),-.15,.35);
 const directEvidence=direct.filter(s=>["medium","strong","negative"].includes(s.tier));
 const own=clamp(directEvidence.reduce((n,s)=>n+s.weight,0),-3,6);
 // Compute peer statistics without the current object so its evidence isn't counted twice.
 const peerW={...w,signals:(w.signals||[]).filter(s=>s.entityId!==entity.id)};
 const sector=learningInsights(peerW,all,now).sectors.find(s=>s.scope===scope&&s.sector===entity.sector);
 const peer=sector?clamp(sector.normalizedWeight*.5,-1.5,2):0;
 const adjustment=round(clamp(weak+own+peer,-3,6));
 const used=direct.filter(s=>s.weight!==0).length+(sector?.supportingSignalIds.length||0);
 return {adjustment,reasons:used?[`已授权：${used} 类去重反馈，30 天半衰减、90 天窗口；同类反馈按曝光归一化，弱信号单对象最多 +0.35 分。`,scope==="demo"?"模拟案例仅影响模拟推荐；风险复核不改变适配度。":"仅当前身份的真实资料反馈；模拟交易与风险复核不改变真实适配度。"]:[]};
}
