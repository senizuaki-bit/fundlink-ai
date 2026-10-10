"use client";
import {useState} from "react";
import {Activity,LoaderCircle,RefreshCw} from "lucide-react";
import {entityById,type Entity} from "@/lib/catalog";
import type {LegacyLead} from "@/lib/model";
import {SectionProps,withEvent} from "./workspace";
import {Badge,Empty,SectionHead} from "./ui";
import {knowledgeAction} from "./knowledge";
export function WatchPanel(p:SectionProps){
 const [busy,setBusy]=useState(false),[error,setError]=useState("");
 const leads=p.w.scans.flatMap(s=>s.items),items=p.w.watched.map(id=>entityById(id)||leads.find(e=>e.id===id)).filter((e):e is Entity|LegacyLead=>Boolean(e));
 function lead(e:Entity|LegacyLead):e is LegacyLead{return 'url' in e;}
 async function refresh(){setBusy(true);setError("");try{const targets=p.w.scans.filter(s=>s.items.some(e=>p.w.watched.includes(e.id)));const seen=new Set<string>();let count=0;for(const target of targets){const key=target.source+target.query;if(seen.has(key)||count>=4)continue;seen.add(key);await knowledgeAction(p.role,{action:"search",source:target.source,query:target.query});count++;}await p.refreshKnowledge();if(count)await p.change(w=>withEvent(w,"重读历史关注来源",count+" 个来源已导入证据库，请确认新主体并关注"));p.notify(count?"已重读历史来源，请到证据库确认主体并关注":"模拟案例没有真实动态接口，请从雷达添加公开来源")}catch(e){setError((e as Error).message)}finally{setBusy(false)}}
 return <><SectionHead kicker="SAVED WATCHLIST" title="示例与历史关注记录" text="保留原有关注清单。历史公开线索可重读到新的证据库。" action={<button className="secondary" disabled={busy} onClick={refresh}>{busy?<LoaderCircle className="spin" size={15}/>:<RefreshCw size={15}/>}重读历史来源</button>}/>{error&&<p className="inline-error">{error}</p>}{items.length?<div className="watch-list">{items.map(e=><div className="panel watch-item" key={e.id}><div className="row spread"><h3>{e.name}</h3><button className="quiet" onClick={()=>p.change(w=>({...w,watched:w.watched.filter(id=>id!==e.id)}))}>取消关注</button></div><Badge tone={lead(e)?"cyan":"subtle"}>{lead(e)?"历史公开线索":"模拟案例"}</Badge><p>{lead(e)?e.description:e.desc}</p><div className="watch-event"><Activity size={17}/><div><strong>{lead(e)?"采集记录":"示例研究提醒"}</strong><span>{lead(e)?e.collected||"日期待核实":"模拟资料不会产生真实业务动态"}</span></div></div><button className="secondary" onClick={()=>p.research(e)}>重新研究</button></div>)}</div>:<Empty title="尚无历史关注" text="可从雷达或证据库关注真实对象。"/>}</>;
}
