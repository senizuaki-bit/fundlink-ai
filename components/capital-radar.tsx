"use client";
import { useState, type CSSProperties } from "react";
import { Building2, Check, Filter, History, LoaderCircle, Search, Sparkles, Watch } from "lucide-react";
import { funds, matchEntity, type Entity } from "@/lib/catalog";
import { capitalFilterError, capitalFiltersForProfile, capitalResources, capitalSectors, capitalStages, emptyCapitalFilters, findCapital, type CapitalFilters } from "@/lib/capital";
import { Badge, Empty, SectionHead } from "./ui";
import { withEvent, type SectionProps } from "./workspace";

function CapitalCard({ fund, p }: { fund: Entity; p: SectionProps }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const match = matchEntity(fund, p.w, "founder");
  const watched = p.w.watched.includes(fund.id);
  async function toggleWatch() {
    setBusy(true); setError("");
    try {
      await p.change(w => withEvent({ ...w, watched: w.watched.includes(fund.id) ? w.watched.filter(id => id !== fund.id) : [...w.watched, fund.id] }, watched ? "取消关注资本" : "关注资本", fund.name + " · 示例机构"));
      p.notify(watched ? "已取消关注" : "已加入资本关注列表");
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  return <article className="entity-card capital-card">
    <div className="row spread">
      <span className="company-symbol" style={{ "--entity-color": fund.color } as CSSProperties}>{fund.initial}</span>
      <Badge tone="subtle">示例机构</Badge>
    </div>
    <button className="entity-title" onClick={() => p.open(fund)}><h2>{fund.name}</h2><span>{fund.en}</span></button>
    <div className="tag-row"><Badge>{fund.sector}</Badge><Badge>{fund.region}</Badge><Badge>{fund.tags.at(-1)}</Badge></div>
    <p className="entity-desc">{fund.desc}</p>
    <div className="entity-stats"><div><span>单笔投资 · 人民币万元</span><strong>{fund.min.toLocaleString()}–{fund.max.toLocaleString()}</strong></div><div><span>投资阶段</span><strong className="capital-stage-label">{fund.stages.join(" / ")}</strong></div></div>
    <div className="capital-resources"><span>资源支持</span><div className="tag-row">{fund.resources.map(resource => <Badge key={resource}>{resource}</Badge>)}</div></div>
    <div className="match-reasons"><span><Check size={14} />与你的融资画像{match.eligible ? "具备进一步研究基础" : "仍有条件待核对"}</span>{match.why.slice(0, 2).map(reason => <p key={reason}>{reason}</p>)}{[...match.blocked, ...match.unknown].map(reason => <p className="amber" key={reason}>{reason}</p>)}</div>
    <div className="risk-inline"><span />待核实：{fund.risk}</div>
    {error && <div className="inline-error" role="alert">{error}</div>}
    <div className="capital-card-actions">
      <button className="secondary" onClick={() => p.open(fund)}>机构详情</button>
      <button className="primary soft" onClick={() => p.research(fund, "从融资方视角分析这家基金的投资方向、阶段、单笔金额和产业资源，列出可投额度、近期投资记录与竞品冲突的待核实问题；不要虚构投资动态。 ")}><Sparkles size={14} />研究资本</button>
      <button className="secondary" disabled={busy} onClick={toggleWatch}>{busy ? <LoaderCircle className="spin" size={14} /> : <Watch size={14} />}{watched ? "取消关注" : "关注机构"}</button>
    </div>
  </article>;
}

export function CapitalRadarPanel(p: SectionProps) {
  const previous = p.w.capitalSearches?.[0];
  const initial = previous?.filters || capitalFiltersForProfile(p.w.profile);
  const [filters, setFilters] = useState<CapitalFilters>(initial);
  const [draft, setDraft] = useState<CapitalFilters>(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const results = findCapital(filters, p.w);
  const history = p.w.capitalSearches || [];
  function update<K extends keyof CapitalFilters>(key: K, value: CapitalFilters[K]) { setDraft(d => ({ ...d, [key]: value })); }
  async function search() {
    const problem = capitalFilterError(draft);
    if (problem) { setError(problem); return; }
    setBusy(true); setError("");
    try {
      const found = findCapital(draft, p.w);
      const record = { id: crypto.randomUUID(), time: new Date().toISOString(), filters: { ...draft }, ids: found.map(x => x.fund.id) };
      await p.change(w => withEvent({ ...w, capitalSearches: [record, ...(w.capitalSearches || [])].slice(0, 20) }, "资本雷达筛选", `${found.length} 家示例机构 · ${draft.sector || "全部行业"} · ${draft.stage || "全部阶段"}`));
      setFilters({ ...draft });
      p.notify(`已找到 ${found.length} 家示例机构，筛选条件已保存`);
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  const select = (key: "sector" | "stage" | "region" | "resource" | "type", title: string, options: string[]) => <label className="field">{title}<select value={draft[key]} onChange={e => update(key, e.target.value)}><option value="">不限</option>{options.map(item => <option key={item}>{item}</option>)}</select></label>;
  return <>
    <SectionHead kicker="CAPITAL RADAR" title="示例机构筛选与流程体验。" text="从投资方向、阶段与资源出发，建立你的融资目标机构清单。" action={<Badge tone="amber">站内示例机构库</Badge>} />
    <div className="capital-radar-layout">
      <form className="panel capital-filter-panel" onSubmit={e => { e.preventDefault(); void search(); }}>
        <div className="row"><span className="radar-symbol"><Building2 size={27} /></span><div><h2>筛选投资机构</h2><p>先明确资本条件，再准备交流。</p></div></div>
        <label className="field">机构名称或关键词<input value={draft.query} onChange={e => update("query", e.target.value)} placeholder="例如：工业 AI、产业客户、基金名称" maxLength={80} /></label>
        <div className="capital-filter-grid">
          {select("sector", "投资行业", capitalSectors)}
          {select("stage", "投资阶段", capitalStages)}
          {select("region", "投资地域", ["中国", "东南亚", "美国", "全球"])}
          {select("type", "资本类型", ["VC 基金", "产业资本"])}
          <label className="field">期望单家出资 · 人民币万元<input type="number" min="0.01" step="any" value={draft.ticket} onChange={e => update("ticket", e.target.value)} placeholder="选填，例如 1,000" /></label>
          {select("resource", "期望资源支持", capitalResources)}
        </div>
        <p className="small-text muted">单家出资额可小于本轮总融资额；地域筛选同时包含覆盖全球的机构。</p>
        <label className="check-field"><input type="checkbox" checked={draft.eligibleOnly} onChange={e => update("eligibleOnly", e.target.checked)} />仅显示通过当前画像约束的机构</label>
        {error && <div className="inline-error" role="alert">{error}</div>}
        <div className="capital-filter-actions"><button className="primary" disabled={busy}>{busy ? <LoaderCircle className="spin" size={16} /> : <Search size={16} />}{busy ? "保存筛选中…" : "筛选机构"}</button><button type="button" className="secondary" disabled={busy} onClick={() => { setDraft(capitalFiltersForProfile(p.w.profile)); setError(""); }}>使用我的画像</button><button type="button" className="quiet" disabled={busy} onClick={() => { const empty = emptyCapitalFilters(); setDraft(empty); setFilters(empty); setError(""); }}>重置条件</button></div>
      </form>
      <aside className="panel capital-source-note"><div className="overline">FROM CAPITAL TO CONNECTION</div><h3>让每一次接洽都有准备</h3>{["核对基金投向与阶段", "确认单家出资与产业资源", "复核近期投资与竞品冲突", "准备沟通材料与会议议题"].map((text, i) => <div className="pipeline-step" key={text}><span>{String(i + 1).padStart(2, "0")}</span>{text}</div>)}<hr /><h3>当前数据范围</h3><p>{funds.length} 家虚构示例机构，用于筛选与流程体验。本区域只用于示例筛选；上方可导入真实官网与公告资料。</p><p>投资方向和金额属于示例策略，不代表当前可投额度或真实投资意愿。</p><button className="secondary" onClick={() => p.navigate("watch")}><Watch size={15} />查看关注资本</button></aside>
    </div>
    <div className="row spread subsection capital-results-heading"><div><h2>资本候选</h2><p className="small-text muted">{filters.sector || "全部行业"} · {filters.stage || "全部阶段"} · {results.length} 家示例机构</p></div><Badge>{results.filter(x => x.match.eligible).length} 家通过画像约束</Badge></div>
    {results.length ? <div className="entity-grid">{results.map(({ fund }) => <CapitalCard key={fund.id} fund={fund} p={p} />)}</div> : <Empty title="当前条件下没有资本候选" text="试着放宽行业、投资阶段或单家出资额；画像中的硬约束仍会在候选中提示。" action={<button className="secondary" onClick={() => { const empty = emptyCapitalFilters(); setDraft(empty); setFilters(empty); }}>查看全部示例机构</button>} />}
    {history.length > 0 && <div className="panel scan-history"><h3><History size={16} /> 最近筛选</h3>{history.slice(0, 5).map(record => <div className="history-line" key={record.id}><span>{record.filters.query || record.filters.sector || "全部行业"} · {record.filters.stage || "全部阶段"}</span><span>{record.ids.length} 家示例机构</span><small>{new Date(record.time).toLocaleString("zh-CN")}</small><button className="quiet" disabled={busy} onClick={() => { setDraft(record.filters); setFilters(record.filters); setError(""); }}>应用条件</button></div>)}</div>}
  </>;
}

export function CapitalWatchPanel(p: SectionProps) {
  const watched = funds.filter(fund => p.w.watched.includes(fund.id));
  return <><SectionHead kicker="CAPITAL WATCH" title="让意向资本，持续留在视野。" text="集中整理关注的投资机构、画像适配情况与待核实事项。" action={<button className="secondary" onClick={() => p.navigate("radar")}><Filter size={15} />继续寻找资本</button>} /><div className="notice">当前关注列表使用示例机构资料，尚未接入真实投资动态。研究时请核实最新投资策略、可投额度和竞品冲突。</div>{watched.length ? <div className="entity-grid">{watched.map(fund => <CapitalCard key={fund.id} fund={fund} p={p} />)}</div> : <Empty title="先关注值得沟通的投资机构" text="在资本雷达或基金详情中关注机构，建立你的融资目标清单。" action={<button className="primary" onClick={() => p.navigate("radar")}>打开资本雷达</button>} />}</>;
}
