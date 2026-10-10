import {normalizeWorkspace, type Workspace, type FieldOrigin} from "./model";
import {profileFieldOrigin} from "./profile-fields";
export const dealStages=["研究中","意向沟通","双方确认","安排会谈","尽职调查","条款磋商","决策记录","已关闭"];
export function prepareWorkspace(input:Workspace,previous:Workspace,now=new Date().toISOString()):Workspace {
  const p=normalizeWorkspace(input), old=normalizeWorkspace(previous);
  if(typeof p.profile.name!=="string"||!p.profile.answers||Object.values(p.profile.answers).some(v=>typeof v!=="string"))throw Error("画像字段必须是文本。");
  if(p.profile.name.length>300||Object.keys(p.profile.answers).length>100||Object.entries(p.profile.answers).some(([key,value])=>!/^[a-zA-Z][a-zA-Z0-9_]{0,79}$/.test(key)||["constructor","prototype","__proto__"].includes(key)||value.length>12000))throw Error("画像字段名称或长度不符合要求。");
  const history=[...(old.profile.history||[])],provenance={...old.profile.provenance};
  for(const key of new Set([...Object.keys(old.profile.answers),...Object.keys(p.profile.answers),"name"])){
    const before=key==="name"?old.profile.name:old.profile.answers[key]||"",after=key==="name"?p.profile.name:p.profile.answers[key]||"";
    const previousSource=old.profile.provenance?.[key],proposedSource=p.profile.provenance?.[key];
    const allowedOrigin=proposedSource&&["declared","self_reported","inferred"].includes(proposedSource.origin)?proposedSource.origin:undefined;
    const proposedQuote=typeof proposedSource?.quote==="string"?proposedSource.quote:undefined;
    // Only the dedicated, evidence-backed human review endpoint can create verified metadata.
    // An unchanged verified value retains its existing review, even if the client sends metadata.
    const originEdited=before===after&&previousSource?.origin!=="verified"&&allowedOrigin&&allowedOrigin!==previousSource?.origin;
    const quoteEdited=before===after&&previousSource?.origin!=="verified"&&allowedOrigin&&proposedQuote!==previousSource?.quote&&proposedQuote&&(allowedOrigin==="inferred"||proposedQuote.includes(after));
    if(before===after&&!originEdited&&!quoteEdited)continue;
    const freshInference=allowedOrigin==="inferred"&&(proposedSource?.time!==previousSource?.time||proposedSource?.quote!==previousSource?.quote);
    const origin:FieldOrigin=allowedOrigin==="inferred"?(freshInference||originEdited?"inferred":profileFieldOrigin(key)):allowedOrigin||profileFieldOrigin(key);
    const quote=proposedQuote&&(originEdited||proposedQuote!==previousSource?.quote)&&(origin==="inferred"||proposedQuote.includes(after))?proposedQuote.slice(0,1000):undefined;
    provenance[key]={origin,time:now,...(quote?{quote}:{})};
    history.unshift({id:crypto.randomUUID(),key,before,after,origin,time:now,...(quote?{quote}:{})});
  }
  p.profile={...p.profile,provenance,history:history.slice(0,200)};
  if(new Set(p.deals.map(d=>d.id)).size!==p.deals.length)throw Error("交易记录 ID 重复。");
  p.deals=p.deals.map(d=>{
    const prev=old.deals.find(x=>x.id===d.id);
    if(typeof d.mutual!=="boolean"||!Array.isArray(d.tasks))throw Error("交易意向和任务格式不正确。");
    if(!prev&&(d.stage!=="研究中"||d.mutual))throw Error("新交易必须从未确认双方意向的研究阶段开始。");
    if(prev&&d.entityId!==prev.entityId)throw Error("交易主体不能直接替换，请新建交易记录。");
    if(!dealStages.includes(d.stage))throw Error("无效的交易阶段。");
    if(!d.mutual&&dealStages.indexOf(d.stage)>=2&&d.stage!=="已关闭")throw Error("双方意向尚未确认，不能进入后续阶段。");
    if(d.stage==="已关闭"&&!d.closeReason?.trim())throw Error("关闭交易前需记录原因。");
    if(prev?.stage==="已关闭"&&d.stage!=="已关闭")throw Error("已关闭记录需新建交易后再推进。");
    const transitions=[...(prev?.history||[])];
    if(prev&&prev.stage!==d.stage){
      if(d.stage!=="已关闭"&&dealStages.indexOf(d.stage)>dealStages.indexOf(prev.stage)+1&&!(d.stage==="双方确认"&&d.mutual&&!prev.mutual))throw Error("请按交易流程逐步推进，或直接关闭并记录原因。");
      transitions.unshift({time:now,from:prev.stage,to:d.stage,note:d.stage==="已关闭"?d.closeReason!:"用户确认 · 演示流程"});
    }
    return {...d,history:transitions.slice(0,100),tasks:d.tasks.slice(0,100),approvals:(d.approvals||[]).slice(0,100)};
  });
  p.events=p.events.slice(0,200);p.messages=p.messages.slice(-50);p.scans=p.scans.slice(0,30);p.capitalSearches=(p.capitalSearches||[]).slice(0,20);p.signals=(p.signals||[]).slice(0,500);p.seen=(p.seen||[]).slice(-1000);
  return p;
}
