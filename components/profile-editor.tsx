"use client";
import {useState} from "react";
import {CheckCircle2,LoaderCircle,Save,ShieldCheck} from "lucide-react";
import {questions,type FieldOrigin,type Profile} from "@/lib/model";
import {originLabels,professionalProfileGroups,profileFieldLabel,profileFieldOrigin} from "@/lib/profile-fields";
import {type SectionProps,withEvent} from "./workspace";
import {Badge,Modal} from "./ui";

type SourceEditor={key:string;origin:FieldOrigin;quote:string;mode:"origin"|"verify"|"retract";reference:string;documentId:string;reviewNote:string;confirmed:boolean};
type ProfileDocument={id:string;name:string};

export function ProfileEditor(p:SectionProps){
  const {w,role,change,notify}=p;
  const [draft,setDraft]=useState<Profile|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState("");
  const [source,setSource]=useState<SourceEditor|null>(null),[documents,setDocuments]=useState<ProfileDocument[]>([]),[documentsError,setDocumentsError]=useState("");
  const profile=draft||w.profile,dirty=draft!==null,groups=professionalProfileGroups[role];
  const count=groups.flatMap(g=>g.fields).filter(f=>profile.answers[f.key]?.trim()).length,total=groups.reduce((n,g)=>n+g.fields.length,0);
  function editValue(key:string,value:string){
    setDraft({...profile,...(key==="name"?{name:value}:{answers:{...profile.answers,[key]:value}}),provenance:{...profile.provenance,[key]:{origin:profileFieldOrigin(key),time:new Date().toISOString()}}});
  }
  async function save(){
    setBusy(true);setError("");
    try{await change(current=>withEvent({...current,profile},"更新专业画像","保存明确条件、专业材料与字段来源"));setDraft(null);notify("画像已保存，字段来源与修改历史已更新")}
    catch(e){setError(e instanceof Error?e.message:"画像保存失败，请重试")}
    finally{setBusy(false)}
  }
  async function openSource(key:string){
    const meta=profile.provenance?.[key];
    setSource({key,origin:meta?.origin||profileFieldOrigin(key),quote:meta?.quote||"",mode:"origin",reference:meta?.reference?.startsWith("http")?meta.reference:"",documentId:"",reviewNote:"",confirmed:false});
    setError("");setDocumentsError("");
    try{const response=await fetch("/api/files?role="+role,{cache:"no-store"});const data=await response.json();if(!response.ok||!Array.isArray(data))throw Error("资料列表暂不可用，可先填写公开来源网址。");setDocuments(data)}catch(e){setDocumentsError(e instanceof Error?e.message:"资料列表读取失败")}
  }
  function applyOrigin(){
    if(!source||source.origin==="verified")return;
    setDraft({...profile,provenance:{...profile.provenance,[source.key]:{origin:source.origin,time:new Date().toISOString(),...(source.quote.trim()?{quote:source.quote.trim().slice(0,1000)}:{})}}});
    setSource(null);
  }
  async function review(){
    if(!source||dirty)return;
    setBusy(true);setError("");
    try{
      const response=await fetch("/api/profile-review?role="+role,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({key:source.key,value:source.key==="name"?w.profile.name:w.profile.answers[source.key]||"",action:source.mode,confirmed:source.confirmed,version:w.version,reference:source.reference,documentId:source.documentId||undefined,reviewNote:source.reviewNote})});
      const result=await response.json() as {error?:string};if(!response.ok)throw Error(result.error||"核验未保存");
      await p.refreshWorkspace();setDraft(null);setSource(null);notify(source.mode==="verify"?"已记录你的人工核验和来源":"已撤销核验，字段恢复为声明或待核实自述");
    }catch(e){setError(e instanceof Error?e.message:"核验未保存，请重试")}
    finally{setBusy(false)}
  }
  function sourceButton(key:string){
    const origin=profile.provenance?.[key]?.origin||profileFieldOrigin(key);
    return <button type="button" className="quiet small-text" aria-label={"编辑"+profileFieldLabel(role,key)+"的来源"} onClick={()=>void openSource(key)}><Badge tone={origin==="verified"?"cyan":origin==="inferred"?"amber":"subtle"}>{originLabels[origin]}</Badge></button>;
  }
  function field(key:string,title:string,hint:string,multiline=false){
    const value=key==="name"?profile.name:profile.answers[key]||"";
    return <div className="field" key={key}><label htmlFor={"profile-"+key}>{title}</label>{multiline?<textarea id={"profile-"+key} rows={3} maxLength={12000} value={value} placeholder={hint} onChange={e=>editValue(key,e.target.value)}/>:<input id={"profile-"+key} maxLength={key==="name"?300:12000} value={value} placeholder={hint} onChange={e=>editValue(key,e.target.value)}/>}<div className="row spread">{sourceButton(key)}</div></div>;
  }
  const selectedMeta=source?profile.provenance?.[source.key]:undefined;
  const selectedValue=source?(source.key==="name"?profile.name:profile.answers[source.key]||""):"";
  return <div className="panel profile-form">
    <div className="row spread"><div><h2>{role==="investor"?"投资画像":"融资画像"}</h2><p className="muted small-text">专业材料已填写 {count} / {total} 项，可按实际进展逐步补充。</p></div><Badge tone="purple">默认仅当前身份可见</Badge></div>
    <div className="notice">基础条件用于推荐筛选；专业详情为研究与沟通提供背景。{role==="investor"?"正式基金授权和个人研究兴趣分开保存；新增授权详情与基础条件冲突时，请同步修正基础条件。":"经营数据请注明时间、币种和口径；上传资料请在下方记录文件名或页码。"}</div>
    {field("name","机构 / 企业名称","对外使用的名称")}
    <h3 className="subsection">基础条件</h3>
    <div className="profile-form-grid">{questions[role].map(q=>field(q.key,q.title,q.hint))}</div>
    <h3 className="subsection">渐进完善专业画像</h3>
    {groups.map((group,index)=><details className="evidence-card subsection" key={group.key} open={index===0||undefined}><summary><strong>{group.title}</strong> <span className="muted small-text">{group.fields.filter(f=>profile.answers[f.key]?.trim()).length} / {group.fields.length} 已填写</span></summary><p className="muted small-text">{group.description}</p><div className="profile-form-grid">{group.fields.map(f=>field(f.key,f.title,f.hint,f.multiline))}</div></details>)}
    <div className="notice subsection">用户声明、自述事实、AI 推断和人工核验分别保存。人工核验需你逐项对照来源并确认；修改已核验内容会撤销旧核验。此处不改变资料共享权限。</div>
    {error&&!source&&<p className="inline-error">{error}</p>}
    <div className="detail-actions"><button className="primary" disabled={busy||!dirty} onClick={()=>void save()}>{busy?<LoaderCircle className="spin" size={15}/>:<Save size={15}/>}保存画像</button>{dirty&&<button className="secondary" disabled={busy} onClick={()=>setDraft(null)}>放弃未保存修改</button>}<span className="muted small-text">{dirty?"有未保存的修改":"所有修改已保存"}</span></div>
    <details className="subsection"><summary>字段来源与修改历史（{w.profile.history?.length||0}）</summary>{w.profile.history?.map(h=><div className="evidence-card" key={h.id}><div className="row spread"><strong>{profileFieldLabel(role,h.key)}</strong><Badge>{originLabels[h.origin]}</Badge></div><p>{h.before===h.after?"内容未变，已更新来源状态":"内容："+(h.before||"未填写")+" → "+(h.after||"已清空")}</p>{h.quote&&<p>原文：{h.quote}</p>}{h.reference&&<p>核验来源：{h.reference}</p>}{h.reviewNote&&<p>核验说明：{h.reviewNote}</p>}<small>{new Date(h.time).toLocaleString("zh-CN")}</small>{h.before!==h.after&&<button className="quiet" onClick={()=>editValue(h.key,h.before)}>填回上一值（需保存并重新核验）</button>}</div>)}</details>
    {source&&<Modal title={profileFieldLabel(role,source.key)+" · 字段来源"} close={()=>{if(!busy){setSource(null);setError("")}}}>
      <div className="evidence-card"><p style={{whiteSpace:"pre-wrap"}}>{selectedValue||"尚未填写"}</p><Badge tone={selectedMeta?.origin==="verified"?"cyan":"subtle"}>{originLabels[selectedMeta?.origin||profileFieldOrigin(source.key)]}</Badge>{selectedMeta?.time&&<p className="small-text">记录时间：{new Date(selectedMeta.time).toLocaleString("zh-CN")}</p>}{selectedMeta?.reference&&<p>核验来源：{selectedMeta.reference}</p>}{selectedMeta?.reviewNote&&<p>核验说明：{selectedMeta.reviewNote}</p>}</div>
      {source.mode==="origin"?<>
        {selectedMeta?.origin!=="verified"?<><label className="field subsection">信息属性<select value={source.origin} onChange={e=>setSource({...source,origin:e.target.value as FieldOrigin})}><option value="declared">用户明确声明（偏好、目标、边界）</option><option value="self_reported">用户自述事实（待验证）</option><option value="inferred">AI 推断（尚未确认）</option></select></label><label className="field">原始表述 / 推断依据<textarea value={source.quote} maxLength={1000} onChange={e=>setSource({...source,quote:e.target.value})} placeholder="可记录原文；推断不会自动升级为事实"/></label><button className="secondary" onClick={applyOrigin}>应用来源标记（需保存画像）</button></>:<div className="notice subsection">这是你已确认的人工核验。资料或结论变化时，可先撤销核验；编辑字段内容也会自动使旧核验失效。</div>}
        <div className="subsection"><h3>对照证据进行人工核验</h3><p className="muted small-text">记录你的核对结论、资料与时间，不代表平台已独立认证。</p>{dirty&&<p className="inline-error">请先保存画像，再对照最新内容进行核验。</p>}<div className="detail-actions"><button className="primary" disabled={dirty||!selectedValue.trim()} onClick={()=>setSource({...source,mode:"verify",reviewNote:"",confirmed:false})}><ShieldCheck size={16}/>记录人工核验</button>{selectedMeta?.origin==="verified"&&<button className="secondary" disabled={dirty} onClick={()=>setSource({...source,mode:"retract",reviewNote:"",confirmed:false})}>撤销核验</button>}</div></div>
      </>:<>
        <div className="notice subsection">{source.mode==="verify"?"请实际打开并核对来源。填写资料位置、对应日期与核对口径，再明确确认当前内容。":"说明为何不再采用之前的核验结论；记录将保留在历史中。"}</div>
        {source.mode==="verify"&&<><label className="field">核验使用的私有资料<select value={source.documentId} onChange={e=>setSource({...source,documentId:e.target.value})}><option value="">使用公开来源网址</option>{documents.map(d=><option key={d.id} value={d.id}>{d.name}</option>)}</select></label>{documentsError&&<p className="muted small-text">{documentsError}</p>}{source.documentId?<a className="quiet" target="_blank" rel="noreferrer" href={"/api/files?role="+role+"&id="+encodeURIComponent(source.documentId)}>下载核对该资料</a>:<label className="field">公开来源网址<input type="url" value={source.reference} onChange={e=>setSource({...source,reference:e.target.value})} placeholder="https://…"/></label>}</>}
        <label className="field subsection">{source.mode==="verify"?"核对说明（至少 12 字）":"撤销原因（至少 12 字）"}<textarea rows={4} maxLength={2000} value={source.reviewNote} onChange={e=>setSource({...source,reviewNote:e.target.value})} placeholder="例如：核对 2026 年 9 月财报第 3 页，金额与期间一致，口径为确认收入。"/></label>
        <label className="check-field"><input type="checkbox" checked={source.confirmed} onChange={e=>setSource({...source,confirmed:e.target.checked})}/>{source.mode==="verify"?"我已人工核对来源，确认其支持上方当前内容。":"我确认撤销此字段的核验状态并保留审计记录。"}</label>
        <div className="detail-actions"><button className="primary" disabled={busy||!source.confirmed||source.reviewNote.trim().length<12||(source.mode==="verify"&&!source.documentId&&!source.reference.trim())} onClick={()=>void review()}>{busy?<LoaderCircle className="spin" size={16}/>:<CheckCircle2 size={16}/>}确认并保存{source.mode==="verify"?"核验":"撤销"}</button><button className="secondary" disabled={busy} onClick={()=>setSource({...source,mode:"origin"})}>返回</button></div>
      </>}{error&&<p className="inline-error">{error}</p>}
    </Modal>}
  </div>;
}
