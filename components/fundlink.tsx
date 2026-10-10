"use client";
import {useEffect,useRef,useState} from "react";
import {Activity,Check,Fingerprint,Globe2,Layers3,LoaderCircle,ShieldCheck,TrendingUp,X} from "lucide-react";
import {Role,Workspace,blankWorkspace,type Profile,type Deal} from "@/lib/model";
import Brand from "./brand";
import Onboarding from "./onboarding";
import WorkspaceShell,{navigateHash} from "./workspace";
type WorkspaceReply=Workspace&{error?:string};
type SaveReply={version:number;provenance:Profile["provenance"];history:Profile["history"];deals?:Deal[];settings?:Workspace["settings"];signals?:Workspace["signals"];events?:Workspace["events"];businessFeedback?:Workspace["businessFeedback"];error?:string};
export default function FundLink(){
 const [role,setRole]=useState<Role|null>(null),[w,setW]=useState<Workspace>(blankWorkspace),[view,setView]=useState("landing"),[busy,setBusy]=useState(false),[error,setError]=useState(""),[saving,setSaving]=useState(false),[toast,setToast]=useState("");
 const latest=useRef(w),version=useRef(0),queue=useRef(Promise.resolve()),activeRole=useRef<Role|null>(null);
 useEffect(()=>{if(!toast)return;const t=setTimeout(()=>setToast(""),4200);return()=>clearTimeout(t)},[toast]);
 async function enter(r:Role){setBusy(true);setError("");try{await queue.current;const res=await fetch("/api/state?role="+r);const data=await res.json() as WorkspaceReply;if(!res.ok)throw Error(data.error||"工作区读取失败");activeRole.current=r;setRole(r);setW(data);latest.current=data;version.current=data.version;setView(data.profile.completed?"workspace":"onboarding");navigateHash("#"+(data.profile.completed?(window.location.hash.startsWith("#"+r+"/")?window.location.hash.slice(1):r+"/discover"):r+"/onboarding"))}catch(e){setError((e as Error).message)}finally{setBusy(false)}}
 function save(next:Workspace){latest.current=next;setW(next);setSaving(true);const r=activeRole.current;const task=queue.current.catch(()=>{}).then(async()=>{const res=await fetch("/api/state?role="+r,{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({...next,version:version.current})});const data=await res.json() as SaveReply;if(!res.ok)throw Error(data.error||"工作区保存失败");version.current=data.version;if(r===activeRole.current){latest.current={...latest.current,version:data.version,...(data.settings?{settings:{...latest.current.settings,learning:data.settings.learning,learningConsent:data.settings.learningConsent,learningRequest:undefined}}:{}),...(queue.current===task?{signals:data.signals||[],businessFeedback:data.businessFeedback||[],events:data.events||latest.current.events}:{}),profile:{...latest.current.profile,provenance:data.provenance,history:data.history},deals:latest.current.deals.map(d=>({...d,history:data.deals?.find(x=>x.id===d.id)?.history||d.history}))};setW(latest.current)}setError("")});queue.current=task;task.catch(e=>setError(e.message)).finally(()=>{if(queue.current===task)setSaving(false)});return task}
 function change(fn:(w:Workspace)=>Workspace,expectedRole:Role|null=activeRole.current){if(expectedRole!==activeRole.current)return Promise.reject(new Error("身份已切换，请在当前身份重新执行任务。"));return save(fn(latest.current))}
 async function refreshWorkspace(){
  const expectedRole=activeRole.current;await queue.current;
  if(!expectedRole)return;
  const response=await fetch("/api/state?role="+expectedRole,{cache:"no-store"});
  const data=await response.json() as WorkspaceReply;
  if(!response.ok)throw Error(data.error||"工作区读取失败");
  if(activeRole.current!==expectedRole)return;
  latest.current=data;version.current=data.version;setW(data);
 }
 function home(){setView("landing");navigateHash("#")}
 useEffect(()=>{
  const initialRole=window.location.hash.split("/")[0].replace("#","");
  if(initialRole!=="investor"&&initialRole!=="founder")return;
  // Restoring a browser route is a one-time external navigation event after mount.
  const timer=window.setTimeout(()=>{void enter(initialRole)},0);
  return()=>window.clearTimeout(timer);
 },[]);
 return <>{view==="workspace"&&role?<WorkspaceShell refreshWorkspace={refreshWorkspace} role={role} w={w} change={fn=>change(fn,role)} home={home} notify={setToast} saving={saving}/>:<div className="entry"><header className="entry-header"><Brand/><div className="header-note"><span className="status-light"/>创新与资本，在此连接</div><span className="quiet"><Globe2 size={16}/>简体中文</span></header>{view==="onboarding"&&role?<Onboarding role={role} w={w} change={fn=>change(fn,role)} home={home} complete={()=>{setView("workspace");navigateHash("#"+role+"/discover")}}/>:<><main className="entry-main"><div className="eyebrow"><span/> THE INTELLIGENT CAPITAL NETWORK</div><h1>让好项目，遇见<span>对的资本。</span></h1><p className="entry-intro">从发现机会到建立连接。你的投融资旅程，由此开始。</p><div className="role-grid">{(["investor","founder"] as Role[]).map((r,i)=><button className={"role-card "+r} key={r} disabled={busy} onClick={()=>enter(r)}><span className="role-top"><span className="role-icon">{busy?<LoaderCircle className="spin" size={30}/>:i?<Layers3 size={30}/>:<TrendingUp size={30}/>}</span><span className="role-number">{i?"02 / FOUNDER":"01 / INVESTOR"}</span></span><h2>{i?"我要融资":"我要投资"}</h2><p>{i?"寻找懂你的事业、适合你的资本":"发现下一家值得相信的企业"}</p><div className="role-features">{(i?["双向匹配适合的基金","梳理融资策略与材料","专属融资 Agent"]:["智能发现优质项目","证据驱动的投资研究","专属投资 Agent"]).map(t=><span key={t}><Check size={14}/>{t}</span>)}</div><span className="role-action">{i?"进入融资工作台":"进入投资工作台"}<span className="keycap">↵</span></span></button>)}</div><div className="entry-assurance"><span><ShieldCheck size={16}/>资料权限由你掌握</span><i/><span><Fingerprint size={16}/>重要行动由你确认</span><i/><span><Activity size={16}/>每项判断都有依据</span></div></main><footer className="entry-footer"><span>© 2026 FundLink AI</span><span>DISCOVER · UNDERSTAND · CONNECT</span><span>研究支持，不构成投资建议</span></footer></>}</div>}{error&&<div className="error-banner" role="alert"><span>{error}</span>{role&&<button onClick={()=>save(latest.current)}>重试保存</button>}<button onClick={()=>location.reload()}>重新加载</button><button aria-label="关闭提示" onClick={()=>setError("")}><X size={16}/></button></div>}{toast&&<div className="toast" role="status"><Check size={17}/>{toast}</div>}</>
}




