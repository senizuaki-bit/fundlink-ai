"use client";
import {useMemo,useRef,useState} from "react";
import {ArrowRight,LoaderCircle,MessageSquarePlus,Trash2} from "lucide-react";
import {knowledgeCandidates} from "@/lib/knowledge-adapter";
import type {BusinessFeedback} from "@/lib/model";
import {Badge,Empty,Modal} from "./ui";
import {type SectionProps,withEvent} from "./workspace";
import "@/app/flywheel.css";

const outcomeNames:Record<BusinessFeedback["stage"],string>={positive_reply:"积极回复",meeting:"已发生会谈",diligence:"进入尽调",terms:"条款磋商",won:"合作达成",lost:"终止合作"};
const dateLabel=(value:string)=>new Date(value).toLocaleString("zh-CN");
const localTime=(value=new Date().toISOString())=>{const date=new Date(value);return new Date(date.getTime()-date.getTimezoneOffset()*60_000).toISOString().slice(0,16)};
type OutcomeDraft={id?:string;entityId:string;stage:BusinessFeedback["stage"];occurredAt:string;note:string;reference:string;confirmed:boolean};

export function BusinessFeedbackPanel(p:SectionProps){
 const {w,role,change,notify,knowledge}=p;
 const [busy,setBusy]=useState(false),[error,setError]=useState("");
 const [showAll,setShowAll]=useState(false),[draft,setDraft]=useState<OutcomeDraft|null>(null),[formError,setFormError]=useState(""),[deleteOutcome,setDeleteOutcome]=useState<BusinessFeedback|null>(null);
 const locked=useRef(false);
 const realCandidates=useMemo(()=>knowledgeCandidates(knowledge,role).filter(entity=>entity.real),[knowledge,role]);
 const entityMap=useMemo(()=>new Map(realCandidates.map(entity=>[entity.id,entity])),[realCandidates]);
 const outcomes=[...(w.businessFeedback||[])].sort((a,b)=>Date.parse(b.occurredAt)-Date.parse(a.occurredAt));
 async function mutate(fn:Parameters<typeof change>[0],message:string){
  if(locked.current)return false;locked.current=true;setBusy(true);setError("");
  try{await change(fn);notify(message);return true}catch(error){const message=error instanceof Error?error.message:"保存失败，请重试";setError(message);setFormError(message);return false}finally{locked.current=false;setBusy(false)}
 }
 function openOutcome(outcome?:BusinessFeedback){
  setFormError("");setDraft(outcome?{...outcome,occurredAt:localTime(outcome.occurredAt),confirmed:false}:{entityId:realCandidates[0]?.id||"",stage:"positive_reply",occurredAt:localTime(),note:"",reference:"",confirmed:false});
 }
 async function saveOutcome(){
  if(!draft||locked.current)return;
  const time=new Date(draft.occurredAt).getTime(),reference=draft.reference.trim(),note=draft.note.trim();
  if(!entityMap.has(draft.entityId)){setFormError("请选择当前身份资料库中的真实对象。");return}
  if(!Number.isFinite(time)||time>Date.now()){setFormError("请选择已经发生的日期和时间，不能填写未来进展。");return}
  if(note.length<12){setFormError("请用至少 12 个字说明实际发生的反馈。");return}
  if(reference){try{const url=new URL(reference);if(!["http:","https:"].includes(url.protocol)||url.username||url.password)throw Error()}catch{setFormError("参考链接须为不含账号密码的 http 或 https 地址；没有链接可留空。");return}}
  if(!draft.confirmed){setFormError("请先确认这是实际发生的业务反馈。");return}
  const record:BusinessFeedback={id:draft.id||crypto.randomUUID(),entityId:draft.entityId,stage:draft.stage,occurredAt:new Date(time).toISOString(),note,reference,recordedAt:"",updatedAt:""};
  if(await mutate(state=>withEvent({...state,businessFeedback:[record,...(state.businessFeedback||[]).filter(item=>item.id!==record.id)]},draft.id?"修订实际业务反馈":"记录实际业务反馈",outcomeNames[record.stage]+" · 用户自述"),"业务反馈已保存并标记为用户自述"))setDraft(null);
 }

 return <div className="customer-feedback" data-role={role}><section className="panel">
  <div className="feedback-heading"><h2><MessageSquarePlus size={20}/> 实际业务反馈</h2><button className="primary" onClick={()=>openOutcome()} disabled={busy||!realCandidates.length}><MessageSquarePlus size={15}/>记录反馈</button></div>
  <p>记录已发生的回复、会谈、尽调或合作结果，为后续跟进留下依据。</p><div className="notice">这里保存你的实际业务记录，并标记为用户自述。沟通与尽调中的模拟操作不会自动生成真实业务反馈。</div>
  {error&&<p className="inline-error" role="alert">{error}</p>}
  {outcomes.length?<div className="business-feedback-list">{outcomes.slice(0,showAll?outcomes.length:12).map(outcome=><article key={outcome.id}><div className="business-feedback-icon"><MessageSquarePlus size={17}/></div><div><strong>{entityMap.get(outcome.entityId)?.name||outcome.entityId}</strong><div className="business-feedback-badges"><Badge>{outcomeNames[outcome.stage]}</Badge><Badge tone="amber">用户自述 · 未独立核验</Badge><time>{dateLabel(outcome.occurredAt)}</time></div><p>{outcome.note}</p>{outcome.reference&&<a href={outcome.reference} target="_blank" rel="noopener noreferrer">查看参考链接 ↗</a>}</div><div className="business-feedback-actions"><button className="quiet" disabled={busy||!entityMap.has(outcome.entityId)} onClick={()=>openOutcome(outcome)}>编辑</button><button className="icon-button" aria-label={`删除 ${outcomeNames[outcome.stage]} 记录`} disabled={busy} onClick={()=>setDeleteOutcome(outcome)}><Trash2 size={14}/></button></div></article>)}</div>:<Empty title={realCandidates.length?"还没有记录实际业务反馈":"先添加一个真实业务对象"} text={realCandidates.length?"与对方沟通后，在这里记录结果、时间和下一步。关闭推荐个性化也可以正常保存业务记录。":"从雷达或证据知识库添加真实主体后，即可记录与它相关的实际业务进展。"} action={!realCandidates.length?<button className="secondary" onClick={()=>p.navigate("radar")}>添加真实对象 <ArrowRight size={14}/></button>:undefined}/>}
  {outcomes.length>12&&<button className="quiet" onClick={()=>setShowAll(!showAll)}>{showAll?"收起反馈":`查看全部 ${outcomes.length} 条反馈`}</button>}
  <p className="feedback-caption">业务反馈保持私有。仅在你已授权且符合授权时间范围时，才会用于改进推荐。</p>
 </section>
 {draft&&<Modal title={draft.id?"编辑实际业务反馈":"记录实际业务反馈"} close={()=>{if(!locked.current)setDraft(null)}}><p className="muted">记录已经发生的事实。保存后标记为用户自述，不代表平台或对方已独立核验。</p><form onSubmit={event=>{event.preventDefault();void saveOutcome()}}><label className="field">真实资料对象<select required disabled={Boolean(draft.id)||busy} value={draft.entityId} onChange={event=>setDraft({...draft,entityId:event.target.value})}>{realCandidates.map(entity=><option value={entity.id} key={entity.id}>{entity.name}</option>)}</select></label><div className="feedback-form-grid"><label className="field">实际进展<select disabled={busy} value={draft.stage} onChange={event=>setDraft({...draft,stage:event.target.value as BusinessFeedback["stage"]})}>{Object.entries(outcomeNames).map(([value,label])=><option value={value} key={value}>{label}</option>)}</select></label><label className="field">发生时间<input required disabled={busy} type="datetime-local" max={localTime()} value={draft.occurredAt} onChange={event=>setDraft({...draft,occurredAt:event.target.value})}/></label></div><label className="field">事实说明<textarea required disabled={busy} minLength={12} maxLength={2000} value={draft.note} onChange={event=>setDraft({...draft,note:event.target.value})} placeholder="请说明何时、与谁发生了什么，以及已确认的下一步（至少 12 字）"/></label><label className="field">参考链接（可选）<input type="url" disabled={busy} maxLength={1000} value={draft.reference} onChange={event=>setDraft({...draft,reference:event.target.value})} placeholder="https://…"/></label><label className="check-field"><input type="checkbox" disabled={busy} checked={draft.confirmed} onChange={event=>setDraft({...draft,confirmed:event.target.checked})}/>我确认这是实际发生的业务反馈</label>{formError&&<p className="inline-error" role="alert">{formError}</p>}<div className="feedback-modal-actions"><button className="secondary" type="button" disabled={busy} onClick={()=>setDraft(null)}>取消</button><button className="primary" type="submit" disabled={busy||!draft.confirmed}>{busy&&<LoaderCircle size={14} className="spin"/>}保存业务反馈</button></div></form></Modal>}
 {deleteOutcome&&<Modal title="删除这条业务反馈" close={()=>{if(!locked.current)setDeleteOutcome(null)}}><p>删除「{entityMap.get(deleteOutcome.entityId)?.name||deleteOutcome.entityId}」在 {dateLabel(deleteOutcome.occurredAt)} 的{outcomeNames[deleteOutcome.stage]}记录。对应的推荐学习记录也会移除。</p><div className="feedback-modal-actions"><button className="secondary" disabled={busy} onClick={()=>setDeleteOutcome(null)}>取消</button><button className="primary danger" disabled={busy} onClick={async()=>{if(await mutate(state=>withEvent({...state,businessFeedback:(state.businessFeedback||[]).filter(item=>item.id!==deleteOutcome.id)},"删除实际业务反馈",outcomeNames[deleteOutcome.stage]),"业务反馈已删除"))setDeleteOutcome(null)}}>{busy&&<LoaderCircle size={14} className="spin"/>}确认删除</button></div></Modal>}
 </div>;
}
