import {hasLearningConsent} from "./learning";
import type {Workspace,BusinessFeedback,BehaviorSignal} from "./model";
import {companies,funds} from "./catalog";

const stages=["positive_reply","meeting","diligence","terms","won","lost"];
const businessKinds=new Set(["contact","mutual","reply","meeting","diligence","terms","decision","closed"]);
const kinds=new Set(["exposure","view","search","batch","save","research","interest","reject","risk_review",...businessKinds]);
const demoIds=new Set([...companies,...funds].map(e=>e.id));
const kindByStage:Record<BusinessFeedback["stage"],BehaviorSignal["kind"]>={positive_reply:"reply",meeting:"meeting",diligence:"diligence",terms:"terms",won:"decision",lost:"closed"};
const stageLabel:Record<BusinessFeedback["stage"],string>={positive_reply:"正向回复",meeting:"实际会谈",diligence:"进入尽调",terms:"条款磋商",won:"已成交（用户自报）",lost:"终止接洽"};
export function changedBusinessEntities(input:Workspace,previous:Workspace):string[]{
 return [...new Set((input.businessFeedback||[]).filter(f=>!previous.businessFeedback?.some(p=>p.id===f.id&&p.entityId===f.entityId)).map(f=>f.entityId))];
}
/** Server-issued dates/modes; a client cannot turn a simulated deal signal into real business evidence. */
export function prepareFlywheelState(input:Workspace,previous:Workspace,now=new Date().toISOString(),clear=false):Workspace {
 const raw=input.businessFeedback??previous.businessFeedback??[];
 if(!Array.isArray(raw)||raw.length>200)throw Error("实际业务反馈最多保留 200 条，请导出后整理。");
 const ids=new Set<string>(),changed:BusinessFeedback[]=[];
 const businessFeedback=raw.map((f):BusinessFeedback=>{
  if(!f||typeof f.id!=="string"||f.id.length>100||!f.id||ids.has(f.id))throw Error("业务反馈 ID 无效或重复。");ids.add(f.id);
  if(typeof f.entityId!=="string"||f.entityId.length>150||!f.entityId||demoIds.has(f.entityId))throw Error("实际业务反馈必须关联当前身份的真实来源主体。");
  if(!stages.includes(f.stage)||typeof f.note!=="string"||f.note.trim().length<12||f.note.length>2000)throw Error("请选择业务阶段并填写至少 12 字的实际情况。");
  const occurred=Date.parse(f.occurredAt);if(!Number.isFinite(occurred)||occurred>Date.parse(now)||occurred<Date.parse("2000-01-01"))throw Error("业务发生时间无效，不能填写未来时间。");
  if(typeof f.reference!=="string"||f.reference.length>1000)throw Error("参考链接格式不正确。");
  const reference=f.reference.trim();if(reference){try{const u=new URL(reference);if(!["http:","https:"].includes(u.protocol)||u.username||u.password)throw Error()}catch{throw Error("参考链接需为不含登录凭据的 HTTP 或 HTTPS 地址。")}}
  const old=previous.businessFeedback?.find(p=>p.id===f.id);
  if(old&&old.entityId!==f.entityId)throw Error("业务反馈不能改换主体，请删除后重新登记。");
  const next={id:f.id,entityId:f.entityId,stage:f.stage,occurredAt:new Date(occurred).toISOString(),note:f.note.trim(),reference,recordedAt:old?.recordedAt||now,updatedAt:now};
  const edited=!old||["stage","occurredAt","note","reference"].some(key=>next[key as keyof BusinessFeedback]!==old[key as keyof BusinessFeedback]);
  if(edited)changed.push(next);else next.updatedAt=old.updatedAt;
  return next;
 });
 for(const key of ["preferenceScope","previousPreferenceScope","ignoredSuggestionScope"] as const)if(input[key]!==undefined&&input[key]!=="real"&&input[key]!=="demo")throw Error("偏好适用范围无效。");
 const oldSignals=new Map((previous.signals||[]).map(s=>[s.id,s])),seen=new Set<string>();
 const enabled=hasLearningConsent(input),grant=Date.parse(input.settings.learningConsent?.grantedAt||"");
 if(!Array.isArray(input.signals??[]))throw Error("行为信号格式不正确。");
 let signals:BehaviorSignal[]=[];
 for(const s of input.signals||[]){
  if(!s||typeof s.id!=="string"||s.id.length>100||!s.id||seen.has(s.id))continue;seen.add(s.id);
  const prior=oldSignals.get(s.id);
  if(prior){if(prior.feedbackId&&!businessFeedback.some(f=>f.id===prior.feedbackId))continue;signals.push(prior);continue}
  if(!enabled||!kinds.has(s.kind)||typeof s.entityId!=="string"||!s.entityId||s.entityId.length>150||s.feedbackId)continue;
  // Body-supplied timestamps, business authenticity and feedback IDs are not authoritative.
  const mode=demoIds.has(s.entityId)||businessKinds.has(s.kind)?"simulation":"real";
  signals.push({id:s.id,entityId:s.entityId,kind:s.kind,time:now,mode,detail:typeof s.detail==="string"?s.detail.slice(0,1000):undefined});
 }
 if(!clear&&input.settings.learningRequest!=="clear")for(const s of previous.signals||[]){
  if(s.feedbackId&&businessFeedback.some(f=>f.id===s.feedbackId)&&!signals.some(n=>n.id===s.id))signals.push(s);
 }
 for(const f of changed){
  signals=signals.filter(s=>s.feedbackId!==f.id);
  // Registering old business history remains useful, but is never retrospective learning consent.
  if(enabled&&Date.parse(f.recordedAt)>=grant&&Date.parse(f.occurredAt)>=grant)signals.unshift({id:"feedback:"+f.id+":"+f.updatedAt,entityId:f.entityId,kind:kindByStage[f.stage],time:now,mode:"real",feedbackId:f.id,outcome:f.stage,detail:stageLabel[f.stage]+" · 用户自报 · "+f.note});
 }
 // Preserve the earliest observed timestamp per object/day so conversion ordering stays truthful.
 signals.sort((a,b)=>Date.parse(a.time)-Date.parse(b.time));
 const daily=new Set<string>();signals=signals.filter(s=>{if(s.kind!=="exposure")return true;const key=s.entityId+":"+s.time.slice(0,10)+":"+(Date.parse(s.time)>=grant?"current":"previous");if(daily.has(key))return false;daily.add(key);return true});
 signals.sort((a,b)=>Date.parse(b.time)-Date.parse(a.time));
 return {...input,businessFeedback,signals:signals.slice(0,500)};
}
