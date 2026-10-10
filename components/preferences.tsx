"use client";
import {useMemo,useRef,useState} from "react";
import {Check,Download,LoaderCircle,RotateCcw,ShieldCheck,Sparkles,Trash2} from "lucide-react";
import {catalog} from "@/lib/catalog";
import {knowledgeCandidates} from "@/lib/knowledge-adapter";
import {hasLearningConsent} from "@/lib/learning";
import {learningInsights,type SectorLearningInsight} from "@/lib/learning-insights";
import type {BehaviorSignal} from "@/lib/model";
import {Badge,Empty,Modal,download} from "./ui";
import {type SectionProps,withEvent} from "./workspace";
import "@/app/flywheel.css";

const signalNames:Record<BehaviorSignal["kind"],string>={exposure:"推荐展示",view:"查看",search:"搜索",batch:"换一批",save:"收藏",research:"深入研究",interest:"感兴趣",contact:"沟通意向",mutual:"双方确认",reply:"积极回复",meeting:"安排会谈",diligence:"尽职调查",terms:"条款磋商",decision:"决策记录",closed:"关闭流程",reject:"拒绝",risk_review:"风险复核"};
const dateLabel=(value:string)=>{const date=new Date(value);return Number.isFinite(date.getTime())?date.toLocaleString("zh-CN"):"时间未记录"};
const scopeName=(scope?:"demo"|"real")=>scope==="demo"?"模拟案例":scope==="real"?"真实资料":"已确认偏好";

export function PreferencesPanel(p:SectionProps){
 const {w,role,change,notify,knowledge}=p;
 const [busy,setBusy]=useState(false),[error,setError]=useState("");
 const [consentDialog,setConsentDialog]=useState<"grant"|"clear"|null>(null),[showAll,setShowAll]=useState(false),[historyTab,setHistoryTab]=useState<"signals"|"events">("signals");
 const locked=useRef(false);
 const entities=useMemo(()=>[...catalog(role),...knowledgeCandidates(knowledge,role)],[knowledge,role]);
 const entityMap=useMemo(()=>new Map(entities.map(entity=>[entity.id,entity])),[entities]);
 const insights=useMemo(()=>learningInsights(w,entities),[w,entities]);
 const signals=[...(w.signals||[])].sort((a,b)=>Date.parse(b.time)-Date.parse(a.time));
 const enabled=hasLearningConsent(w);

 async function mutate(fn:Parameters<typeof change>[0],message:string){
  if(locked.current)return false;locked.current=true;setBusy(true);setError("");
  try{await change(fn);notify(message);return true}catch(error){setError(error instanceof Error?error.message:"保存失败，请重试");return false}finally{locked.current=false;setBusy(false)}
 }
 async function updateConsent(action:"grant"|"revoke"|"clear"){
  const message=action==="grant"?"已授权，仅从现在开始记录新行为":action==="clear"?"行为记录已清除，个性化学习已关闭":"已撤回个性化学习授权";
  if(await mutate(state=>({...state,settings:{...state.settings,learningRequest:action}}),message))setConsentDialog(null);
 }
 async function confirmSuggestion(suggestion:SectorLearningInsight){
  await mutate(state=>withEvent({...state,previousPreference:state.preference,previousPreferenceScope:state.preferenceScope,preference:suggestion.sector,preferenceScope:suggestion.scope,ignoredSuggestion:"",ignoredSuggestionScope:undefined},"确认画像建议",suggestion.sector+" · "+scopeName(suggestion.scope)),"已确认偏好，后续推荐会优先参考这一方向");
 }
 async function restore(id:string){
  await mutate(state=>{const rejected={...state.rejected};delete rejected[id];return withEvent({...state,rejected,seen:(state.seen||[]).filter(value=>value!==id),signals:(state.signals||[]).filter(signal=>signal.entityId!==id||signal.kind!=="reject")},"恢复推荐",entityMap.get(id)?.name||id)},"已恢复该对象，推荐仍会核对你的筛选条件");
 }
 function exportRecords(){
  download(`FundLink-${role}-我的使用记录.json`,JSON.stringify({exportedAt:new Date().toISOString(),role,authorization:w.settings.learningConsent||null,learningEnabled:enabled,preference:{sector:w.preference,scope:w.preferenceScope||null},behaviorRecords:signals,activities:w.events},null,2));
 }
 const historyCount=historyTab==="signals"?signals.length:w.events.length;

 return <div className="customer-feedback" data-role={role}>
  {error&&<p className="inline-error" role="alert">{error}</p>}
  <section className="panel preference-consent">
   <div className="feedback-heading"><h2><ShieldCheck size={20}/> 推荐个性化</h2><Badge tone={enabled?"cyan":""}>{enabled?"已开启":"默认关闭"}</Badge></div>
   <p>让后续推荐参考你的查看、收藏、研究和实际沟通反馈。你的行业、阶段、金额等明确条件始终优先。</p>
   <label className="preference-toggle"><span><strong>使用我的行为改进推荐</strong><small>{enabled?"仅使用本次授权之后的新记录":"需要你主动授权才会开始"}</small></span><input aria-label="行为学习授权" type="checkbox" checked={enabled} disabled={busy} onChange={event=>event.target.checked?setConsentDialog("grant"):void updateConsent("revoke")}/></label>
   <div className="preference-promises"><span><Check size={14}/>随时撤回授权或清除记录</span><span><Check size={14}/>模拟体验不影响真实机会的推荐</span><span><Check size={14}/>你的私有资料不会公开给其他用户</span></div>
   <p className="feedback-caption">{w.settings.learningConsent?`最近授权：${dateLabel(w.settings.learningConsent.grantedAt)}${w.settings.learningConsent.revokedAt?" · 已撤回":""}`:"尚未授权。授权前的记录不会自动用于推荐个性化。"}</p>
  </section>
  <section className="panel feedback-section">
   <div className="feedback-heading"><h2><Sparkles size={20}/> 推荐偏好</h2><Badge>由你确认</Badge></div>
   <p>你的使用反馈可能形成新的方向建议。确认之后才会更新明确偏好；你也可以忽略或撤销。</p>
   <div className="preference-current"><span>当前偏好</span><strong>{w.preference||"尚未确认"}</strong>{w.preference&&<Badge>{scopeName(w.preferenceScope)}</Badge>}<button className="quiet" disabled={!w.preference||busy} onClick={()=>mutate(state=>withEvent({...state,preference:state.previousPreference,preferenceScope:state.previousPreferenceScope,previousPreference:"",previousPreferenceScope:undefined},"撤销画像建议","已恢复上次明确偏好及其适用范围"),"已撤销本次偏好更新")}><RotateCcw size={14}/>撤销更新</button></div>
   {insights.suggestions.length?<div className="preference-suggestions">{insights.suggestions.slice(0,3).map(suggestion=><article key={suggestion.id}><div className="feedback-heading"><h3>{suggestion.sector}</h3><Badge tone={suggestion.scope==="real"?"cyan":"amber"}>{scopeName(suggestion.scope)}</Badge></div><p>你对这个方向的 {suggestion.entityIds.length} 个不同对象表达了持续兴趣。</p><details><summary>查看建议依据</summary><ul>{suggestion.entityIds.map(id=><li key={id}>{entityMap.get(id)?.name||id}：{insights.signals.filter(signal=>signal.entityId===id&&suggestion.supportingSignalIds.includes(signal.id)).map(signal=>signalNames[signal.kind]).join("、")}</li>)}</ul><p>只参考近期已授权的反馈；重复查看不会累积成更强的偏好。确认后仅影响相同资料范围内、符合筛选条件的推荐。</p></details><div className="row"><button className="primary" disabled={busy} onClick={()=>confirmSuggestion(suggestion)}>确认建议</button><button className="quiet" disabled={busy} onClick={()=>mutate(state=>withEvent({...state,ignoredSuggestion:suggestion.sector,ignoredSuggestionScope:suggestion.scope},"忽略画像建议",suggestion.sector+" · "+scopeName(suggestion.scope)),"已忽略这条偏好建议")}>忽略</button></div></article>)}</div>:<div className="preference-empty"><Sparkles size={22}/><div><strong>{enabled?"暂时没有需要确认的新建议":"开启个性化后，建议会出现在这里"}</strong><p>{enabled?"在不同对象上积累收藏、研究或实际沟通反馈后，再判断是否调整偏好。":"现有推荐仍依据你主动填写的画像和筛选条件。"}</p></div></div>}
  </section>
  {Object.keys(w.rejected).length>0&&<section className="panel feedback-section"><h2>已排除的推荐</h2><p>改变想法后，可以让这些对象重新参加条件筛选。</p>{Object.entries(w.rejected).map(([id,reason])=><div className="history-line" key={id}><span>{entityMap.get(id)?.name||id}</span><span>{reason}</span><button className="quiet" disabled={busy} onClick={()=>restore(id)}>恢复推荐</button></div>)}</section>}
  <section className="panel feedback-section">
   <div className="feedback-heading"><h2>我的使用记录</h2><button className="secondary" onClick={exportRecords}><Download size={15}/>导出记录</button></div><p>查看当前身份保留的使用记录。清除行为记录会同时关闭个性化学习，已确认偏好、收藏和业务记录会保留。</p>
   <div className="tabs detail-tabs">{([["signals","行为记录"],["events","活动记录"]] as const).map(([key,label])=><button key={key} className={historyTab===key?"active":""} onClick={()=>{setHistoryTab(key);setShowAll(false)}}>{label}</button>)}</div>
   {historyTab==="signals"&&(signals.length?signals.slice(0,showAll?signals.length:10).map(signal=><div className="event-line" key={signal.id}><span className="event-marker"/><div><strong>{signalNames[signal.kind]} · {entityMap.get(signal.entityId)?.name||signal.entityId}</strong><p>{signal.detail||"已记录"}{signal.mode==="simulation"?" · 模拟体验":""}</p></div><time>{dateLabel(signal.time)}</time></div>):<Empty title="还没有已授权的行为记录" text="授权后产生的新记录会保存在这里。"/>)}
   {historyTab==="events"&&(w.events.length?w.events.slice(0,showAll?w.events.length:10).map(event=><div className="event-line" key={event.id}><span className="event-marker"/><div><strong>{event.title}</strong><p>{event.detail}</p></div><time>{dateLabel(event.time)}</time></div>):<Empty title="还没有活动记录" text="画像、研究和业务进展更新会留下操作记录。"/>)}
   <div className="feedback-actions">{historyCount>10&&<button className="quiet" onClick={()=>setShowAll(!showAll)}>{showAll?"收起记录":`查看全部 ${historyCount} 条记录`}</button>}<button className="quiet danger" disabled={busy} onClick={()=>setConsentDialog("clear")}><Trash2 size={14}/>清除行为记录</button></div>
  </section>
  {consentDialog&&<Modal title={consentDialog==="grant"?"开启推荐个性化":"清除行为记录"} close={()=>{if(!locked.current)setConsentDialog(null)}}><p>{consentDialog==="grant"?"同意从现在起记录当前身份的推荐展示、查看、搜索、收藏、研究、兴趣和业务进展，用于改进符合你筛选条件的推荐。授权前的记录不会自动用于学习。":"这会删除当前身份的行为记录及其派生的推荐分析，并关闭个性化学习。清除后无法恢复；收藏、画像、已确认偏好和实际业务反馈会保留。"}</p><p className="muted feedback-modal-copy">模拟体验与真实业务分别处理。你可以随时撤回授权，私有资料不会用于其他用户的模型训练。</p><div className="feedback-modal-actions"><button className="secondary" disabled={busy} onClick={()=>setConsentDialog(null)}>取消</button><button className="primary" disabled={busy} onClick={()=>updateConsent(consentDialog)}>{busy&&<LoaderCircle size={14} className="spin"/>}{consentDialog==="grant"?"同意并开启":"确认清除"}</button></div></Modal>}
 </div>;
}
