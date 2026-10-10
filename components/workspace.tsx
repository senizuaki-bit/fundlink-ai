"use client";
import {useEffect,useState,useSyncExternalStore} from "react";
import {Activity,BookOpen,Bookmark,BriefcaseBusiness,Calculator,Compass,Menu,Radar as RadarIcon,Settings2,Sparkles,SwitchCamera,UserRound,Watch as WatchIcon,X} from "lucide-react";
import {Role,Workspace,addSignal} from "@/lib/model";
import {Entity,catalog} from "@/lib/catalog";
import Brand from "./brand";
import {KnowledgePanel,KnowledgeWatch,SourceCollector,RadarResults} from "./knowledge";
import {KnowledgeSnapshot} from "@/lib/knowledge";
import {emptyKnowledge} from "@/lib/knowledge-adapter";
import {Badge,SectionHead} from "./ui";
import {Explore,EntityDetail} from "./explore";
import {WatchPanel} from "./intelligence";
import {ToolsPanel} from "./financial-tools";
import {AgentPanel} from "./agent-panel";
import {CapitalRadarPanel,CapitalWatchPanel} from "./capital-radar";
import {DealPanel,ProfilePanel} from "./operations";
export type AppProps={role:Role;w:Workspace;change:(fn:(w:Workspace)=>Workspace)=>Promise<void>;notify:(text:string)=>void};
export type SectionProps=AppProps&{saving:boolean;refreshWorkspace:()=>Promise<void>;knowledge:KnowledgeSnapshot;refreshKnowledge:()=>Promise<void>;open:(e:Entity)=>void;research:(e?:Pick<Entity,"id">,prompt?:string)=>void;contact:(e:Entity)=>void;navigate:(v:string)=>void};
export function withEvent(w:Workspace,title:string,detail:string){return {...w,events:[{id:crypto.randomUUID(),title,detail,time:new Date().toISOString()},...w.events].slice(0,200)}}
export function navigateHash(hash:string){
 const oldURL=window.location.href,next=new URL(oldURL);next.hash=hash;
 if(next.href===oldURL)return;
 window.history.pushState(null,"",next.href);
 window.dispatchEvent(new HashChangeEvent("hashchange",{oldURL,newURL:next.href}));
}
const nav=[["discover","发现机会",Compass],["radar","项目雷达",RadarIcon],["saved","我的收藏",Bookmark],["knowledge","证据知识库",BookOpen],["watch","机会监测",WatchIcon],["agent","我的 Agent",Sparkles],["deals","交易工作台",BriefcaseBusiness],["tools","专业工具",Calculator],["profile","我的画像与资料",UserRound]] as const;
async function fetchKnowledge(role:Role,signal?:AbortSignal):Promise<KnowledgeSnapshot>{
 const response=await fetch("/api/knowledge?role="+role,{cache:"no-store",signal});
 const data=await response.json() as KnowledgeSnapshot&{error?:string};
 if(!response.ok)throw Error(data.error||"证据库读取失败");return data;
}
function subscribeToPage(notify:()=>void){window.addEventListener("hashchange",notify);return()=>window.removeEventListener("hashchange",notify)}
function pageSnapshot(){const page=window.location.hash.split("/")[1];return page==="feedback"?"profile":nav.some(item=>item[0]===page)?page:"discover"}
export default function WorkspaceShell({role,w,change,home,notify,saving,refreshWorkspace}:AppProps&{refreshWorkspace:()=>Promise<void>;home:()=>void;saving:boolean}){
const [knowledgeState,setKnowledgeState]=useState<{role:Role;data:KnowledgeSnapshot;error:string}|null>(null);
const knowledge=knowledgeState?.role===role?knowledgeState.data:emptyKnowledge(),knowledgeError=knowledgeState?.role===role?knowledgeState.error:"";
async function refreshKnowledge(){try{const data=await fetchKnowledge(role);setKnowledgeState({role,data,error:""})}catch(error){setKnowledgeState(current=>({role,data:current?.role===role?current.data:emptyKnowledge(),error:error instanceof Error?error.message:"证据库读取失败"}))}}
useEffect(()=>{const controller=new AbortController();void fetchKnowledge(role,controller.signal).then(data=>{if(!controller.signal.aborted)setKnowledgeState({role,data,error:""})}).catch(error=>{if(!controller.signal.aborted)setKnowledgeState({role,data:emptyKnowledge(),error:error instanceof Error?error.message:"证据库读取失败"})});return()=>controller.abort()},[role]);
const page=useSyncExternalStore(subscribeToPage,pageSnapshot,()=>"discover");
const [mobile,setMobile]=useState(false),[entity,setEntity]=useState<Entity|null>(null),[request,setRequest]=useState<{id:string;entityId?:string;prompt:string}|null>(null);
function navigate(v:string){navigateHash("#"+role+"/"+v);setMobile(false);window.scrollTo(0,0)}
function research(e?:Pick<Entity,"id">,prompt="请生成深度研究报告"){setEntity(null);if(e)void change(w=>addSignal(w,e.id,"research",undefined,{mode:catalog(role).some(x=>x.id===e.id)?"simulation":"real"})).catch(()=>{});setRequest({id:crypto.randomUUID(),entityId:e?.id,prompt});navigate("agent")}
async function contact(e:Entity){setEntity(null);try{await change(w=>{const existing=w.deals.find(d=>d.entityId===e.id&&d.stage!=="已关闭");return existing?{...w,deals:[existing,...w.deals.filter(d=>d.id!==existing.id)]}:withEvent({...w,deals:[{id:crypto.randomUUID(),entityId:e.id,entitySnapshot:e,stage:"研究中",notes:"",draft:"",tasks:[{text:"核实主体与合作意愿",done:false},{text:"确认关键指标和资料口径",done:false},{text:"安排首次交流",done:false}],mutual:false},...w.deals]},"创建交易记录",e.name+(e.real?" · 未认领主体，模拟沟通":" · 模拟案例"))});navigate("deals");notify("已打开该对象的交易工作台")}catch(error){notify((error as Error).message)}}
const navLabel=(key:string,label:string)=>role==="founder"?(key==="radar"?"资本雷达":key==="watch"?"关注资本":label):label;
const props:SectionProps={role,w,saving,change,notify,refreshWorkspace,knowledge,refreshKnowledge,open:e=>{setEntity(e);void change(w=>addSignal(w,e.id,"view",undefined,{mode:e.real?"real":"simulation"})).catch(()=>{})},research,contact,navigate};
return <div className="workspace"><aside data-role={role} className={"sidebar "+(mobile?"mobile-open":"")}><div className="sidebar-brand"><Brand/><button className="quiet mobile-only" aria-label="关闭导航" onClick={()=>setMobile(false)}><X size={20}/></button></div><button className="workspace-picker" onClick={home}><span className="workspace-avatar">{role==="investor"?"投":"融"}</span><span><strong>{role==="investor"?"投资工作空间":"融资工作空间"}</strong><small>PERSONAL WORKSPACE</small></span><SwitchCamera size={15}/></button><div className="nav-label">工作台</div><nav>{nav.map(([key,label,Icon],i)=><button key={key} className={(page===key?"active ":"")+(i===4||i===8?"nav-divider":"")} onClick={()=>navigate(key)}><Icon size={18}/><span>{navLabel(key,label)}</span>{key==="saved"&&w.saved.length>0&&<small>{w.saved.length}</small>}{key==="agent"&&<span className="nav-ai">AI</span>}</button>)}</nav><div className="sidebar-bottom"><div className="mini-agent"><span className="mini-agent-icon"><Sparkles size={19}/></span><div><strong>{w.settings.name} · 专属 Agent</strong><span>研究 · 洞察 · 下一步行动</span></div></div><div className="sidebar-user"><span className="user-avatar">{w.profile.name.slice(0,1)||"我"}</span><div><strong>{w.profile.name}</strong><small>个人工作空间</small></div><button className="quiet" aria-label="编辑画像" onClick={()=>navigate("profile")}><Settings2 size={16}/></button></div></div></aside>{mobile&&<button className="mobile-scrim" aria-label="关闭导航" onClick={()=>setMobile(false)}/>}<div className="main-layout"><header className="app-header"><div className="row"><button className="quiet mobile-only" aria-label="打开导航" onClick={()=>setMobile(true)}><Menu size={21}/></button><span className="breadcrumb">工作空间 <span>/</span> <strong>{navLabel(page,nav.find(n=>n[0]===page)?.[1]||"")}</strong></span></div><div className="row"><span className="save-indicator">{saving?"正在保存…":"已同步"}</span><Badge>MVP 工作空间</Badge><button className="icon-button" aria-label="推荐偏好" onClick={()=>navigate("profile/preferences")}><Activity size={18}/></button></div></header><main className="workspace-main">{knowledgeError&&<div className="notice">证据库暂不可用：{knowledgeError}<button className="quiet" onClick={refreshKnowledge}>重试</button></div>}
{(page==="discover"||page==="saved")&&<Explore {...props} savedOnly={page==="saved"}/>}
{page==="knowledge"&&<KnowledgePanel {...props}/>}
{page==="radar"&&<><SectionHead kicker="PUBLIC DISCOVERY" title={role==="founder"?"找到与你同路的资本。":"从公开信号，发现研究机会。"} text="真实来源、采集时间和待确认主体关系，都保存在证据库。"/><SourceCollector {...props}/><RadarResults {...props}/>{role==="founder"&&<div className="subsection"><CapitalRadarPanel {...props}/></div>}</>}
{page==="watch"&&<><SectionHead kicker="OPPORTUNITY WATCH" title="跟进变化，重新核对判断。" text="对已关注的真实主体运行来源巡检，保留变化和复核记录。"/><KnowledgeWatch {...props}/>{w.watched.some(id=>catalog(role).some(e=>e.id===id)||w.scans.some(s=>s.items?.some(e=>e.id===id)))&&(role==="founder"?<CapitalWatchPanel {...props}/>:<WatchPanel {...props}/>)}</>}
{page==="agent"&&<AgentPanel {...props} request={request} consumed={()=>setRequest(null)}/>}
{page==="deals"&&<DealPanel {...props}/>}
{page==="tools"&&<ToolsPanel {...props}/>}
{page==="profile"&&<ProfilePanel {...props}/>}
</main><footer className="workspace-footer"><span>FundLink AI · 让每一次连接更有依据</span><span>示例数据不代表真实融资意愿 · 研究支持，不构成投资建议</span></footer></div>{entity&&<EntityDetail {...props} entity={entity} close={()=>setEntity(null)}/>}</div>
}



