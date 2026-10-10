"use client";
import {useEffect,useRef,useState} from "react";
import {Check,LoaderCircle,Sparkles,X} from "lucide-react";
import {questions} from "@/lib/model";
import type {Role,Workspace} from "@/lib/model";
import {interviewFollowUp,nextUnanswered,onboardingConcept,uncertainAnswer} from "@/lib/onboarding";
import type {InterviewFollowUp} from "@/lib/onboarding";
import type {ProfileSuggestion} from "@/lib/profile-extraction";
import {sampleProfile} from "@/lib/catalog";
import VoiceInput from "./voice-input";

type Props={role:Role;w:Workspace;change:(fn:(w:Workspace)=>Workspace)=>Promise<void>;home:()=>void;complete:()=>void};
type Extraction={suggestions:ProfileSuggestion[];mode:"model"|"demo";provider?:string;model?:string};
const kindLabel={declared:"原文声明 · 待确认",self_reported:"自述事实 · 待验证",inferred:"AI 探索建议 · 待确认"};

export default function Onboarding({role,w,change,home,complete}:Props){
  const initial=nextUnanswered(role,w.profile.answers);
  const [step,setStep]=useState(initial),[answers,setAnswers]=useState(w.profile.answers),[value,setValue]=useState(w.profile.answers[questions[role][initial]?.key]||"");
  const [name,setName]=useState(w.profile.name),[busy,setBusy]=useState(false),[extracting,setExtracting]=useState(false),[voiceActive,setVoiceActive]=useState(false),[error,setError]=useState("");
  const [extraction,setExtraction]=useState<Extraction|null>(null),[selected,setSelected]=useState<Record<string,boolean>>({}),[reviewedText,setReviewedText]=useState("");
  const [followUp,setFollowUp]=useState<InterviewFollowUp|null>(null),[followed,setFollowed]=useState<Record<string,boolean>>({}),[followUpValue,setFollowUpValue]=useState("");
  const [notice,setNotice]=useState("");
  const controller=useRef<AbortController|null>(null),mounted=useRef(true);
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;controller.current?.abort()}},[]);
  const q=questions[role][step],locked=busy||extracting||voiceActive;
  const count=questions[role].filter(question=>!!answers[question.key]).length;

  function resetDraft(text:string){setValue(text);setExtraction(null);setSelected({});setReviewedText("");setFollowUp(null);setFollowUpValue("");setError("")}
  function go(index:number){setStep(index);resetDraft(answers[questions[role][index]?.key]||"");setNotice("")}

  async function extract():Promise<Extraction|null>{
    if(!q||value.trim().length<2||locked)return null;
    setExtracting(true);setError("");setNotice("");
    const abort=new AbortController();controller.current=abort;
    const timeout=setTimeout(()=>abort.abort(),65000);
    try{
      const response=await fetch("/api/profile-extract?role="+role,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({text:value,questionKey:q.key}),signal:abort.signal});
      const data=await response.json() as Extraction&{error?:string};
      if(!response.ok)throw new Error(data.error||"资料提取未完成，请重试。");
      if(!Array.isArray(data.suggestions))throw new Error("AI 建议格式不完整，请重试。");
      if(!mounted.current)return null;
      // Keep the user's direct answer to this question; review only the additional dimensions.
      const result={...data,suggestions:data.suggestions.filter(s=>s.key!==q.key&&questions[role].some(question=>question.key===s.key))};
      setExtraction(result);setSelected({});setReviewedText(value);
      return result;
    }catch(cause){if(mounted.current)setError(cause instanceof Error&&cause.name==="AbortError"?"AI 整理超时，输入已保留。可重试或直接保存当前回答。":cause instanceof Error?cause.message:"AI 整理失败，输入已保留。")}
    finally{clearTimeout(timeout);if(mounted.current)setExtracting(false)}
    return null;
  }

  async function saveAnswer(text:string,includeSuggestions=false){
    if(!q)return;
    const additions=includeSuggestions&&extraction?Object.fromEntries(extraction.suggestions.filter(s=>selected[s.key]).map(s=>[s.key,s.value])):{};
    const nextAnswers={...answers,...additions,[q.key]:text.trim()||"暂不确定"};
    const nextStep=nextUnanswered(role,nextAnswers,step+1);
    setBusy(true);setError("");
    try{
      await change(current=>{
        const provenance={...current.profile.provenance};
        for(const suggestion of includeSuggestions?extraction?.suggestions||[]:[]){
          if(selected[suggestion.key])provenance[suggestion.key]={origin:suggestion.kind,time:new Date().toISOString(),quote:suggestion.quote};
        }
        provenance[q.key]={origin:role==="founder"&&q.key==="traction"?"self_reported":"declared",time:new Date().toISOString(),quote:text.slice(0,1000)};
        return {...current,profile:{...current.profile,answers:nextAnswers,provenance}};
      });
      if(!mounted.current)return;
      setAnswers(nextAnswers);setStep(nextStep);resetDraft(nextAnswers[questions[role][nextStep]?.key]||"");
      setNotice(Object.keys(additions).length?"已保存你确认的 "+Object.keys(additions).length+" 个其他维度，后续会跳过重复提问。":"");
    }catch(cause){setError(cause instanceof Error?cause.message:"保存失败，回答已保留，请重试。")}finally{if(mounted.current)setBusy(false)}
  }

  async function next(skip=false,direct=false){
    if(!q||locked)return;
    if(skip){await saveAnswer("暂不确定");return}
    const extra=interviewFollowUp(role,q.key,value);
    if(extra&&!followed[q.key]){setFollowUp(extra);setFollowed({...followed,[q.key]:true});return}
    if(followUp){await saveAnswer([value,followUpValue].filter(Boolean).join("；"),!direct&&reviewedText===value);return}
    const preset=value.split("、").every(option=>q.options.includes(option));
    if(!direct&&!preset&&value.trim().length>=12&&reviewedText!==value){
      const result=await extract();
      if(!result)return;
      if(result.suggestions.length)return;
      await saveAnswer(value);return;
    }
    await saveAnswer(value,!direct&&reviewedText===value);
  }

  async function finish(sample=false){
    if(locked)return;
    setBusy(true);setError("");
    try{
      const profile=sample?sampleProfile(role):{name:name.trim()||(role==="investor"?"我的投资团队":"我的创业项目"),answers,completed:true};
      await change(current=>({...current,profile:{...current.profile,...profile,...(sample?{provenance:{}}:{})},settings:{...current.settings,goals:role==="investor"?(profile.answers.goals||current.settings.goals):"梳理融资需求、寻找适配资本、准备沟通；资本协同目标："+(profile.answers.goals||"待完善")},events:[{id:crypto.randomUUID(),title:sample?"使用示例画像":"完成引导建档",detail:sample?"示例内容可在我的画像中随时修改":"已确认个人声明与偏好；自述事实仍待验证",time:new Date().toISOString()},...current.events]}));
      if(mounted.current)complete();
    }catch(cause){setError(cause instanceof Error?cause.message:"保存失败，画像已保留，请重试。")}finally{if(mounted.current)setBusy(false)}
  }

  return <main className="onboard">
    <div className="row spread"><button className="quiet" disabled={locked} onClick={home}><X size={16}/>返回身份选择</button><button className="quiet sample-link" disabled={locked} onClick={()=>finish(true)}>使用示例画像体验</button></div>
    <div className="onboard-kicker"><Sparkles size={18}/>认识你的专属{role==="investor"?"投资":"融资"} Agent</div>
    <div className="progress-track" aria-label={"画像完成 "+count+" / "+questions[role].length}><div style={{width:count/questions[role].length*100+"%"}}/></div>
    <span className="muted">建立你的画像 · 已记录 {count} / {questions[role].length} 个维度</span>
    {notice&&<div className="notice" role="status">{notice}</div>}
    {error&&<div className="notice danger" role="alert" style={{flexWrap:"wrap"}}><span>{error}</span>{q&&<button className="quiet" disabled={locked} onClick={()=>next(false,true)}>直接保存当前回答</button>}</div>}
    {q?<>
      <h1>{q.title}</h1><p>{q.hint}</p>
      <details style={{margin:"16px 0"}}><summary className="muted" style={{cursor:"pointer"}}>解释一下这个概念</summary><p className="notice">{onboardingConcept(role,q.key)}</p></details>
      <div className="option-grid">{q.options.map(option=><button key={option} disabled={locked} aria-pressed={value.split("、").includes(option)} className={"option "+(value.split("、").includes(option)?"selected":"")} onClick={()=>resetDraft(value.split("、").includes(option)?value.split("、").filter(item=>item!==option).join("、"):value?value+"、"+option:option)}>{option}{value.split("、").includes(option)&&<Check size={16}/>}</button>)}</div>
      <label className="field">其他 / 用自己的话回答<textarea aria-label="回答" disabled={locked} maxLength={12000} placeholder="可一次描述多个方面，例如业务、阶段、地域和计划金额…" value={value} onChange={event=>resetDraft(event.target.value)}/></label>
      <VoiceInput key={q.key} disabled={busy||extracting} onActive={setVoiceActive} onCommit={text=>resetDraft(value?value+"；"+text:text)}/>
      <div className="row" style={{flexWrap:"wrap",margin:"16px 0"}}><button className="secondary" disabled={locked||value.trim().length<2} onClick={()=>void extract()}>{extracting?<LoaderCircle size={15} className="spin"/>:<Sparkles size={15}/>} {extracting?"正在整理原文…":"AI 整理这段描述"}</button><small className="muted">只生成待确认建议，不会自动改写画像。</small></div>
      {followUp&&<div className="panel" style={{margin:"20px 0"}} aria-live="polite">
        <span className="badge">补充一个问题 · 可以跳过</span><h3 style={{marginTop:12}}>{followUp.question}</h3><p>{followUp.explanation}</p>
        <div className="tag-row">{followUp.options.map(option=><button className={followUpValue===option?"primary":"secondary"} disabled={locked} key={option} onClick={()=>setFollowUpValue(option)}>{option}</button>)}</div>
        <label className="field">补充说明（选填）<input disabled={locked} maxLength={700} value={followUpValue} placeholder="也可以自行补充" onChange={event=>setFollowUpValue(event.target.value)}/></label>
        <button className="quiet" disabled={locked} onClick={()=>saveAnswer(value)}>不补充，保留当前回答</button>
      </div>}
      {extraction&&<div className="panel" style={{margin:"20px 0"}} aria-live="polite">
        <h3>{extraction.suggestions.length?"发现其他画像信息，请逐项确认":"没有发现可补充的其他维度"}</h3>
        <span className="badge">{extraction.mode==="model"?(extraction.provider||"AI")+" · 原文提取":"基础规则整理 · 当前未连接模型"}</span>
        <p>当前回答将保留原文。勾选的其他维度会保存并跳过重复提问；未勾选的建议不会写入。</p>
        {extraction.suggestions.map(s=><div key={s.key} style={{borderTop:"1px solid var(--line)",padding:"14px 0"}}>
          <label className="check-field"><input type="checkbox" disabled={locked} checked={!!selected[s.key]} onChange={event=>setSelected({...selected,[s.key]:event.target.checked})}/><span>{questions[role].find(question=>question.key===s.key)?.title}<br/><strong style={{color:"var(--text)"}}>{s.value}</strong></span></label>
          <span className={"badge "+(s.kind==="inferred"?"amber":"")}>{kindLabel[s.kind]}</span>
          <p style={{overflowWrap:"anywhere"}}>原文依据：“{s.quote}”</p>
          {answers[s.key]&&<small className="amber">已有回答：{answers[s.key]}。勾选后将替换为本次确认内容。</small>}
        </div>)}
      </div>}
      <div className="row spread" style={{flexWrap:"wrap"}}><button className="quiet" disabled={!step||locked} onClick={()=>go(step-1)}>上一步</button><div className="row" style={{flexWrap:"wrap"}}><button className="quiet" disabled={locked} onClick={()=>next(true)}>暂不确定，跳过</button><button className="primary" disabled={locked} onClick={()=>next()}>{busy?"正在保存…":extracting?"正在整理…":followUp?"确认并继续":extraction?.suggestions.length?"确认勾选并继续":"继续"}</button></div></div>
    </>:<>
      <h1>把你的方向，变成下一步行动。</h1><p>确认金额、阶段、地域和限制条件，稍后仍可修改。</p>
      <label className="field">你的机构 / 企业名称<input value={name} disabled={locked} maxLength={120} placeholder={role==="investor"?"例如：远景投资":"例如：IndustrialMind AI"} onChange={event=>setName(event.target.value)}/></label>
      <div className="profile-review">{questions[role].map((question,index)=><div key={question.key}><span>{question.title}{["amount","stage","region","constraints"].includes(question.key)&&<small className="amber"> · 重点确认</small>}</span><button className="quiet" disabled={locked} onClick={()=>go(index)} style={{overflowWrap:"anywhere",textAlign:"left"}}>{answers[question.key]||"暂不确定"}{uncertainAnswer.test(answers[question.key]||"")&&<span className="badge amber">待完善</span>}</button></div>)}</div>
      <div className="notice"><Check size={16}/>以上为你的声明或自述，未代替主体或投资资格验证。AI 建议需你确认，自述事实仍可补充证据验证。</div>
      <button className="primary" disabled={locked} onClick={()=>finish()}>{busy?"保存中…":"确认画像，进入工作台"}</button>
    </>}
  </main>;
}
