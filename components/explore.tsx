"use client";
import {useEffect,useRef,useState,type CSSProperties,type ReactNode} from "react";
import {Bookmark,Check,FileText,Filter,Heart,RefreshCw,Search,ShieldCheck,Sparkles,Target,X,Eye,ExternalLink} from "lucide-react";
import {catalog,type Entity,evidence,funds} from "@/lib/catalog";
import {hybridRetrieve,type MatchResult,type RankedCandidate} from "@/lib/matching";
import {rankedRecommendations} from "@/lib/recommendations";
import {useRecommendations} from "./use-recommendations";
import {addSignal,type Workspace} from "@/lib/model";
import {hasLearningConsent} from "@/lib/learning";
import {entitySignalMode,hasCandidateExposure,recordCandidateExposure} from "@/lib/flywheel-tracking";
import {Badge,Empty,Modal,SectionHead,download} from "./ui";
import {SectionProps,withEvent} from "./workspace";
import {KnowledgeDetail} from "./knowledge";

const riskLabels={high:"高",medium:"中",unknown:"待评估"};
const isReal=(e:Entity)=>e.real===true||e.source==="public"||e.source==="authorized";
function moneyLabel(e:Entity,role:SectionProps["role"]){
 const unit=e.currency?"万 "+e.currency:isReal(e)?"万（币种待确认）":"万元";
 if(role==="investor"&&e.amount>0)return e.amount.toLocaleString()+" "+unit;
 return e.min>0&&e.max>=e.min?e.min.toLocaleString()+"–"+e.max.toLocaleString()+" "+unit:"金额待确认";
}
function FitSummary({match:m}:{match:MatchResult}){
 return <><div className="entity-stats" aria-label="独立双向适配分"><div><span>投资方适配{!m.eligible?" · 暂估":""}</span><strong>{m.investorFit}<small> / 100</small></strong></div><div><span>融资方适配{!m.eligible?" · 暂估":""}</span><strong>{m.founderFit}<small> / 100</small></strong></div></div><div className="tag-row" aria-label="证据与风险独立指标"><Badge>证据质量 {m.evidenceQuality}/100</Badge><Badge>新鲜度 {m.evidence.length?m.evidenceFreshness+"/100":"待确认"}</Badge><Badge tone="amber">核查优先级 {riskLabels[m.riskPriority]}</Badge></div></>;
}
export function Explore(p:SectionProps&{savedOnly:boolean}){
 const {role,w,change,notify,open,savedOnly}=p;
 const [query,setQuery]=useState(""),[queryInput,setQueryInput]=useState(""),[sector,setSector]=useState("全部行业"),[source,setSource]=useState("all"),[explore,setExplore]=useState(false);
 const [view,setView]=useState<{key:string;ids:string[]}>({key:"",ids:[]}),[savedSeen,setSavedSeen]=useState<string[]>([]),[busy,setBusy]=useState(false),[reject,setReject]=useState<Entity|null>(null),[reason,setReason]=useState("赛道不合适");
 const recommendations=useRecommendations(p,query);
 const evaluated=recommendations.feed?.evaluated||[];
 const entities=evaluated.map(item=>item.entity);
 const live=evaluated.filter(x=>!Object.prototype.hasOwnProperty.call(w.rejected,x.entity.id));
 const eligible=live.filter(x=>x.match.eligible),pending=live.filter(x=>!x.match.eligible);
 const inFilters=({entity:e,retrieval:r}:RankedCandidate)=>(sector==="全部行业"||e.sector===sector)&&(source==="all"||source==="real"&&isReal(e)||source==="demo"&&!isReal(e))&&(!query||r.matchedTerms.length>0||r.matchedConcepts.length>0);
 const ranked=recommendations.feed?rankedRecommendations(recommendations.feed):[];
 const items=(savedOnly?evaluated.filter(x=>w.saved.includes(x.entity.id)).sort((a,b)=>b.match.score-a.match.score):explore?pending.sort((a,b)=>Number(a.match.blocked.length>0)-Number(b.match.blocked.length>0)||b.retrieval.score-a.retrieval.score||b.match.score-a.match.score):ranked).filter(inFilters);
 const key=[role,savedOnly,explore,query,sector,source].join("|");
 const seen=savedOnly?savedSeen:w.seen||[],unseen=items.filter(x=>!seen.includes(x.entity.id));
 const shown=view.key===key?view.ids.flatMap(id=>{const item=items.find(x=>x.entity.id===id);return item?[item]:[]}):unseen.slice(0,4);
 const shownIds=shown.map(x=>x.entity.id),remaining=unseen.filter(x=>!shownIds.includes(x.entity.id));
 const exhausted=items.length>0&&remaining.length===0;
 const exposureGrid=useRef<HTMLDivElement>(null);
 const exposureKey=shown.map(x=>x.entity.id+":"+entitySignalMode(x.entity)).join("|");
 const exposureContext=explore?"探索候选":query?"检索结果":"推荐列表";
 useEffect(()=>{
  if(savedOnly||!hasLearningConsent(w)||!exposureGrid.current||typeof IntersectionObserver==="undefined")return;
  const candidates=shown.map(x=>x.entity).filter(entity=>!hasCandidateExposure(w,entity.id));
  if(!candidates.length)return;
  const visible=new Set<string>(),reported=new Set<string>();let timer:ReturnType<typeof setTimeout>|undefined,disposed=false;
  function schedule(){
   if(timer)clearTimeout(timer);
   if(document.visibilityState!=="visible"||!visible.size)return;
   timer=setTimeout(()=>{
    if(disposed||document.visibilityState!=="visible")return;
    const seen=candidates.filter(entity=>visible.has(entity.id)&&!reported.has(entity.id));
    if(!seen.length)return;
    seen.forEach(entity=>reported.add(entity.id));
    void change(current=>recordCandidateExposure(current,seen,exposureContext)).catch(()=>{});
   },350);
  }
  const observer=new IntersectionObserver(entries=>{
   for(const entry of entries){const id=(entry.target as HTMLElement).dataset.entityId;if(!id)continue;
    if(entry.isIntersecting&&entry.intersectionRatio>=.35)visible.add(id);else visible.delete(id);
   }
   schedule();
  },{threshold:[0,.35]});
  exposureGrid.current.querySelectorAll<HTMLElement>("[data-entity-id]").forEach(card=>{if(candidates.some(entity=>entity.id===card.dataset.entityId))observer.observe(card)});
  document.addEventListener("visibilitychange",schedule);
  return()=>{disposed=true;if(timer)clearTimeout(timer);observer.disconnect();document.removeEventListener("visibilitychange",schedule)};
 },[exposureKey,exposureContext,savedOnly,w.settings.learning,w.settings.learningConsent?.grantedAt,w.settings.learningConsent?.revokedAt,w.signals]);
 async function nextBatch(){
  if(!remaining.length||busy)return;setBusy(true);
  const nextIds=remaining.slice(0,4).map(x=>x.entity.id);
  try{
   if(savedOnly)setSavedSeen([...new Set([...savedSeen,...shownIds])]);
   else await change(current=>withEvent(shown.reduce<Workspace>((state,{entity})=>addSignal(state,entity.id,"batch","换一批：保留已展示记录",{mode:entitySignalMode(entity)}),{...current,seen:[...new Set([...(current.seen||[]),...shownIds])]}),"刷新推荐",`已展示 ${shownIds.length} 个，下一批 ${nextIds.length} 个`));
   setView({key,ids:nextIds});notify("已换一批，之前展示的对象不会自动重复");
  }finally{setBusy(false)}
 }
 async function restart(){
  if(busy)return;setBusy(true);
  try{if(savedOnly)setSavedSeen([]);else await change(current=>withEvent({...current,seen:[]},"重新浏览推荐","用户主动重置已展示历史"));setView({key,ids:items.slice(0,4).map(x=>x.entity.id)});notify("已重新开始浏览，允许再次展示之前的候选")}finally{setBusy(false)}
 }
 async function search(){
  const value=queryInput.trim();setQuery(value);if(value===query||!value)return;
  const relevant=entities.filter(e=>hybridRetrieve(e,value).score>0).slice(0,3);
  if(hasLearningConsent(w)&&relevant.length)await change(current=>relevant.reduce((state,e)=>addSignal(state,e.id,"search",value,{mode:entitySignalMode(e)}),current));
 }
 async function toggle(e:Entity){
  const removing=w.saved.includes(e.id);
  await change(current=>{const wasSaved=current.saved.includes(e.id);const updated={...current,saved:wasSaved?current.saved.filter(id=>id!==e.id):[...current.saved,e.id],signals:wasSaved?(current.signals||[]).filter(s=>s.entityId!==e.id||s.kind!=="save"):current.signals};return withEvent(wasSaved?updated:addSignal(updated,e.id,"save","收藏候选",{mode:entitySignalMode(e)}),wasSaved?"取消收藏":"收藏机会",e.name)});
  notify(removing?"已取消收藏":"已加入收藏");
 }
 return <>
  <SectionHead kicker={savedOnly?"YOUR SHORTLIST":"DISCOVERY / "+(role==="investor"?"INVESTOR":"FOUNDER")} title={savedOnly?"值得继续关注的机会":role==="investor"?"发现，下一个可能。":"找到，懂你的资本。"} text={savedOnly?"把值得深入了解的对象，留在触手可及的地方。":"先核对双方条件，再比较资金、策略与资源是否适配。"} action={<button className="secondary" onClick={()=>p.navigate("profile/preferences")}><Filter size={15}/>调整偏好</button>}/>
  {!savedOnly&&<><div className="insight-banner"><div className="insight-icon"><Sparkles size={23}/></div><div><span className="overline">YOUR AGENT BRIEFING</span><h3>{w.settings.name} 为你整理了 <em>{eligible.length}</em> 个符合已知条件的{role==="investor"?"项目":"基金"}</h3><p>{entities.filter(isReal).length} 个真实来源线索 · {catalog(role).length} 个模拟案例；条件不完整的对象保留在探索区。</p></div><button className="quiet" onClick={()=>p.research(undefined,"请整理下一步行动计划")}>查看行动计划 <FileText size={16}/></button></div><div className="metric-grid"><div><span><Target size={16}/>通过条件筛选</span><strong>{eligible.length.toString().padStart(2,"0")}<small> / {entities.length} 个候选</small></strong><p>硬条件优先于反馈学习</p></div><div><span><Bookmark size={16}/>已收藏</span><strong>{w.saved.length.toString().padStart(2,"0")}</strong><p>收藏不会改写匹配条件</p></div><div><span><Heart size={16}/>推进中的交流</span><strong>{w.deals.filter(d=>d.stage!=="已关闭").length.toString().padStart(2,"0")}</strong><p>来自你的交易工作台</p></div><div><span><ShieldCheck size={16}/>探索与待确认</span><strong>{pending.length.toString().padStart(2,"0")}</strong><p>显示条件差异和资料缺口</p></div></div></>}
  <div className="listing-header"><div className="tabs"><button className={!explore||savedOnly?"active":""} onClick={()=>setExplore(false)}>{savedOnly?"全部收藏":"为你推荐"} <small>{savedOnly?w.saved.length:eligible.length}</small></button>{!savedOnly&&<button className={explore?"active":""} onClick={()=>setExplore(true)}>探索与待确认 <small>{pending.length}</small></button>}</div><button className="quiet" disabled={busy||!remaining.length} onClick={nextBatch}><RefreshCw size={14}/>{remaining.length?"换一批":"本轮已看完"}</button></div>
  <form className="filters" onSubmit={event=>{event.preventDefault();void search()}}><label className="search"><Search size={17}/><input aria-label="搜索项目或基金" placeholder="搜索名称、技术或业务概念" value={queryInput} onChange={e=>setQueryInput(e.target.value)}/></label><button className="secondary" type="submit">搜索</button><select aria-label="行业筛选" value={sector} onChange={e=>setSector(e.target.value)}>{["全部行业",...new Set(entities.map(e=>e.sector))].map(s=><option key={s}>{s}</option>)}</select><select aria-label="数据来源筛选" value={source} onChange={e=>setSource(e.target.value)}><option value="all">全部来源</option><option value="demo">模拟案例</option><option value="real">真实来源</option></select><span className="filter-count">{items.length} 个结果</span></form>
  {query&&<p className="small-text muted">正在检索“{query}”：全文关键词与概念关联共同召回。<button className="quiet" onClick={()=>{setQuery("");setQueryInput("")}}>清除搜索</button></p>}
  {explore&&!savedOnly&&<div className="notice">这里的对象尚未通过正常推荐筛选。真实来源不等于主体或融资信息已验证；请先确认缺失条件。已知不符合条件的对象会列出具体原因。</div>}
  {recommendations.loading?<div className="panel" role="status">正在更新推荐…</div>:recommendations.error?<div className="notice" role="alert">{recommendations.error}<button className="secondary" onClick={()=>void recommendations.retry().catch(error=>notify(error.message))}>重新加载推荐</button></div>:shown.length?<div className="entity-grid" ref={exposureGrid}>{shown.map(({entity:e,match:m,retrieval:r,explorationReason})=><article className="entity-card" key={e.id} data-entity-id={e.id}>
   <div className="row spread"><span className="company-symbol" style={{"--entity-color":e.color} as CSSProperties}>{e.initial}</span><div className="row"><Badge tone={m.eligible?"cyan":"amber"}>{m.eligible?m.score+" 双向适配参考":m.blocked.length?"存在条件差异":"资料待确认"}</Badge><button className={"icon-button "+(w.saved.includes(e.id)?"saved":"")} aria-label={(w.saved.includes(e.id)?"取消收藏 ":"收藏 ")+e.name} onClick={()=>toggle(e)}><Bookmark size={18} fill={w.saved.includes(e.id)?"currentColor":"none"}/></button></div></div>
   <button className="entity-title" onClick={()=>open(e)}><h2>{e.name}</h2><span>{e.en}</span></button><div className="tag-row">{e.tags.slice(0,3).map(t=><Badge key={t}>{t}</Badge>)}<Badge tone={isReal(e)?"cyan":"subtle"}>{isReal(e)?e.source==="authorized"?"授权真实资料":"真实公开来源":"模拟案例"}</Badge></div><p className="entity-desc">{e.desc}</p>
   <div className="entity-stats"><div><span>{role==="investor"?"本轮融资":"单笔投资"}</span><strong>{moneyLabel(e,role)}</strong></div><div><span>{role==="investor"?e.metric:"资源支持"}</span><strong>{role==="investor"?e.metricValue:e.resources[0]||"待确认"}</strong></div></div>
   <FitSummary match={m}/><p className="small-text muted">{m.evidenceStatus}</p>
   <div className="match-reasons"><span><Sparkles size={13}/>{m.eligible?"为什么推荐":"已知适配线索"}</span>{m.why.slice(0,3).map(t=><p key={t}><Check size={12}/>{t}</p>)}{explorationReason&&<p className="muted">{explorationReason}</p>}{query&&r.matchedConcepts.length>0&&<p className="muted">关联概念：{r.matchedConcepts.join("、")}</p>}</div>
   {m.blocked.length>0&&<div className="notice"><strong>不满足：</strong>{m.blocked.join("；")}</div>}
   {m.uncertainties.slice(0,2).map(text=><div className="risk-inline" key={text}><span/>待核实：{text}</div>)}
   {(m.unknown.length>2||m.blocked.length>2)&&<details className="small-text muted"><summary>查看全部条件差异与资料缺口（{m.blocked.length+m.unknown.length}）</summary>{[...m.blocked,...m.unknown].map(text=><p key={text}>{text}</p>)}</details>}
   <div className="match-reasons"><span><FileText size={13}/>关键证据</span>{m.evidence.length?m.evidence.slice(0,2).map(item=><p key={item.id}>{item.url&&/^https?:\/\//.test(item.url)?<a className="external-link" href={item.url} target="_blank" rel="noreferrer">{item.name}<ExternalLink size={11}/></a>:<span>{item.name}</span>}<small> · {item.date?item.date.slice(0,10):"日期待确认"}</small></p>):<p>尚无来源记录，需先补充资料。</p>}</div>
   <p className="small-text muted"><strong>建议下一步：</strong>{m.nextStep}</p><div className="card-actions"><button className="secondary" onClick={()=>open(e)}>查看详情</button><button className="primary soft" onClick={()=>p.research(e)}><Sparkles size={14}/>深入研究</button><button className="icon-button" aria-label={"不感兴趣 "+e.name} onClick={()=>setReject(e)}><X size={16}/></button></div>
  </article>)}</div>:<Empty title={items.length?"本轮候选已浏览完":savedOnly?"当前筛选下没有收藏":"当前条件下暂无结果"} text={items.length?"已展示过的候选不会自动重复。你可以主动重新浏览。":savedOnly?"可以调整来源筛选，或在推荐中收藏项目与基金。":"调整搜索或来源筛选，也可以到探索区查看待确认的真实资料。"} action={items.length?<button className="secondary" disabled={busy} onClick={restart}>重新浏览</button>:<button className="secondary" onClick={()=>{setQuery("");setQueryInput("");setSector("全部行业");setSource("all");if(savedOnly)p.navigate("discover");else setExplore(true)}}>{savedOnly?"去发现机会":"查看探索候选"}</button>}/>}
  {exhausted&&shown.length>0&&<div className="notice row spread"><span>本轮筛选结果已看完，之前的候选不会自动重复。</span><button className="secondary" disabled={busy} onClick={restart}>重新浏览</button></div>}
  <details className="list-footnote"><summary>排序与反馈说明</summary><p>双向分数为投资方适配与融资方适配各占 50% 的演示参考；证据质量、新鲜度和核查优先级独立展示。检索采用本地全文分词、人工概念向量与同义词扩展，并非训练式 embedding。排序还会轻量考虑来源质量与候选多样性，不代表融资成功率。</p><p>{w.settings.learning?"已授权的行为信号最多改变单侧适配 6 分，且不能改变行业、阶段、金额、币种等硬条件。":"行为学习已关闭，收藏与拒绝仍可由你直接管理列表。"} 模拟案例和真实来源分别标注；真实来源中的主张仍可能未经独立验证。</p></details>
  {reject&&<Modal title="告诉 Agent，为什么不合适" close={()=>setReject(null)}><p className="muted">该对象会从推荐中移除；经授权的反馈可轻量调整排序，硬约束始终保持优先。</p><label className="field">关于 {reject.name}<select value={reason} onChange={e=>setReason(e.target.value)}>{["赛道不合适","阶段不匹配","金额不合适","存在利益冲突","资料不足","暂时不考虑"].map(x=><option key={x}>{x}</option>)}</select></label><button className="primary" onClick={async()=>{await change(current=>withEvent(addSignal({...current,rejected:{...current.rejected,[reject.id]:reason}},reject.id,"reject",reason,{mode:entitySignalMode(reject)}),"不感兴趣",reject.name+" · "+reason));setReject(null);notify("已记录反馈，该对象已从推荐中移除")}}>确认反馈</button></Modal>}
 </>;
}
export function EntityDetail(p:SectionProps&{entity:Entity;close:()=>void}){
 const recommendations=useRecommendations(p);
 const m=recommendations.feed?.evaluated.find(item=>item.entity.id===p.entity.id)?.match;
 const real=p.knowledge.entities.find(e=>e.id===p.entity.id);
 const status=<div className="notice" role={recommendations.error?"alert":"status"}>{recommendations.loading?"正在更新匹配依据…":recommendations.error||"当前推荐范围中没有此对象的匹配资料"}{recommendations.error&&<button className="quiet" onClick={()=>void recommendations.retry().catch(error=>p.notify(error.message))}>重试</button>}</div>;
 if(real)return <Modal title={real.name} close={p.close} wide>{m?<FitSummary match={m}/>:status}<KnowledgeDetail {...p} entity={real}/></Modal>;
 if(isReal(p.entity))return <Modal title={p.entity.name} close={p.close} wide><div className="notice">此真实来源主体尚未载入当前证据库，请刷新后查看资料。</div><button className="secondary" onClick={()=>p.refreshKnowledge()}>刷新证据库</button></Modal>;
 return <DemoDetail {...p} match={m} matchStatus={status}/>;
}
function DemoDetail(p:SectionProps&{entity:Entity;close:()=>void;match?:MatchResult;matchStatus:ReactNode}){const {entity:e,w,change,role}=p;const [tab,setTab]=useState("overview");const m=p.match,isFund=funds.some(x=>x.id===e.id);return <Modal title={e.name} close={p.close} wide><div className="detail-top"><span className="company-symbol large" style={{"--entity-color":e.color} as CSSProperties}>{e.initial}</span><div><p>{e.en}</p><div className="tag-row"><Badge tone="cyan">模拟注册主体</Badge><Badge>身份未验证</Badge><Badge>资料更新 2026-10-08</Badge></div></div></div><div className="tabs detail-tabs">{[["overview","主体画像"],["evidence","来源与证据"],["risk","风险核查"]].map(([id,t])=><button key={id} className={tab===id?"active":""} onClick={()=>setTab(id)}>{t}</button>)}</div>{!m&&tab!=="overview"&&p.matchStatus}{tab==="overview"?m?<><p className="detail-description">{e.desc}</p><FitSummary match={m}/><p className="small-text muted">{m.evidenceStatus}。双向参考分 {m.score}，由双方适配分各占 50% 计算。</p><div className="info-grid">{[["行业 / 地域",e.sector+" / "+e.region],["阶段",e.stages.join("、")],[isFund?"单笔额度":"融资需求",isFund?e.min+"–"+e.max+" 万元":e.amount+" 万元"],[isFund?"资源支持":"团队",isFund?e.resources.join("、"):e.team]].map(([k,v])=><div key={k}><span>{k}</span><strong>{v}</strong></div>)}</div><details className="panel inner"><summary>评分构成与反馈影响</summary><p>投资方：{m.dimensions.investor.map(d=>d.label+" "+Math.round(d.weight*100)+"% × "+d.score).join("；")}</p><p>融资方：{m.dimensions.founder.map(d=>d.label+" "+Math.round(d.weight*100)+"% × "+d.score).join("；")}</p><p>当前单侧行为调整：{m.feedbackAdjustment} 分；画像明确偏好另计。硬条件、风险与证据质量分别评估。</p>{m.feedbackReasons.map(r=><p key={r}>{r}</p>)}</details><div className="panel inner"><h3>匹配依据</h3>{m.why.map(x=><p className="reason-line" key={x}><Check size={15}/>{x}</p>)}{[...m.blocked,...m.unknown].map(x=><p className="amber" key={x}>{x}</p>)}</div><div className="detail-actions"><button className="primary" onClick={()=>p.research(e)}><Sparkles size={16}/>让 Agent 研究</button><button className="secondary" onClick={()=>p.contact(e)}>准备沟通</button><button className="secondary" onClick={async()=>{await change(w=>{const removing=w.interested.includes(e.id);const updated={...w,interested:removing?w.interested.filter(x=>x!==e.id):[...w.interested,e.id],signals:removing?(w.signals||[]).filter(s=>s.entityId!==e.id||s.kind!=="interest"):w.signals};return withEvent(removing?updated:addSignal(updated,e.id,"interest","明确感兴趣",{mode:"simulation"}),"更新兴趣",e.name)});p.notify(w.settings.learning?"已更新兴趣，后续排序将在硬条件内调整":"已更新兴趣记录；行为学习已关闭")}}><Heart size={15}/>{w.interested.includes(e.id)?"已感兴趣":"感兴趣"}</button><button className="secondary" onClick={async()=>{await change(w=>({...w,watched:w.watched.includes(e.id)?w.watched.filter(x=>x!==e.id):[...w.watched,e.id]}));p.notify(isFund?"已更新关注资本":"已更新机会监测")}}><Eye size={15}/>{w.watched.includes(e.id)?"取消关注":isFund?"关注机构":"关注动态"}</button></div></>:p.matchStatus:tab==="evidence"?<><div className="notice">{isFund?"这些是示例机构资料。真实投资策略、近期投资和可投额度尚未核实；请在正式接洽前索取原始来源。":"这些是本地模拟资料。真实公开项目线索请到项目雷达查看。"}</div>{evidence(e).map((s,i)=><div className="evidence-card" key={s.id}><div className="row spread"><h3><FileText size={17}/>[{i+1}] {s.name}</h3><Badge>{s.type}</Badge></div><p>{s.claim}</p><div className="row spread"><small className="muted">发布 {s.date} · 收集 2026-10-09 · 编号 {s.id}</small><button className="quiet" onClick={()=>download(s.id+".txt",s.name+"\n模拟案例\n"+s.claim+"\n发布日期："+s.date)}>下载资料</button></div></div>)}</>:<><div className="risk-heading"><Badge tone="amber">中 · 核查优先级</Badge><Badge>{w.risks[e.id]||"待核实"}</Badge><h3>{e.risk}</h3></div><div className="risk-evidence"><div><span>主张 / 来源 A</span><strong>{e.id==="industrialmind"?"2026 年 9 月 ARR 1,200 万元":e.metric+"："+e.metricValue}</strong><small>商业资料 · 模拟自述</small></div><div><span>对照 / 来源 B</span><strong>{e.id==="industrialmind"?"2025 年确认收入 400 万元":"外部确认材料尚不完整"}</strong><small>经营摘要 · 模拟资料</small></div></div><div className="panel inner"><h3>发现与解释假设</h3><p>{e.id==="industrialmind"?"ARR 是时点年化指标，营业收入是会计期间确认值，二者不应直接等同。这一差异不足以推断造假。可能原因：新合同集中生效、口径包含非经常性项目、确认政策不同。":isFund?"历史投资不能证明当前仍有可投额度。若已投竞品，需在共享敏感资料前核实冲突隔离。控制权、排他、回购及清算优先权仍需逐项确认。":"公开信息不足以验证所有经营主张。需要核对主体、期间及指标口径；不能仅由技术热度推断收入或商业价值。"}</p><h3>下一步核查</h3><p>{isFund?"直接确认基金主体、决策流程、可投额度及竞品清单。":"索取合同生效日期、订阅明细、收入确认政策与回款流水，并进行客户访谈。"}</p></div><label className="field">人工复核结论<select value={w.risks[e.id]||"待核实"} onChange={async ev=>{const status=ev.target.value;await change(w=>withEvent(addSignal({...w,risks:{...w.risks,[e.id]:status}},e.id,"risk_review",status,{mode:"simulation"}),"风险复核",e.name+" · "+status));p.notify("复核结果已记录")}}>{["待核实","已解释","已验证","误报","无法确认"].map(x=><option key={x}>{x}</option>)}</select></label><p className="muted small-text">复核状态为你手动记录，不代表平台完成独立验证。</p></>}</Modal>}

