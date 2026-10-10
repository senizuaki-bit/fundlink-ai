"use client";
import {useState} from "react";
import {Download,Plus,Save,Trash2} from "lucide-react";
import type {SectionProps} from "./workspace";
import {withEvent} from "./workspace";
import {Badge,SectionHead,download} from "./ui";
import {calculateScenario,calculateCapTable,diagnoseCapital,diligenceFramework} from "@/lib/finance";
import type {ScenarioInput,CapitalContext,CapHolder,PoolTiming} from "@/lib/finance";

type InputKey=keyof Required<ScenarioInput>;
type InputSource={kind:"assumption"|"self_reported"|"document";note:string};
type Milestone={id:string;use:string;amount:string;milestone:string;date:string;owner:string};
type DiligenceState={status:"pending"|"requested"|"reviewed";note:string};
type Draft={inputs:Record<InputKey,string>;sources:Record<InputKey,InputSource>;holders:CapHolder[];poolTiming:PoolTiming;terms:string;plan:Milestone[];context:CapitalContext;diligence:Record<string,DiligenceState>};
const labels:Record<InputKey,string>={cash:"可用现金",burn:"月度净现金消耗",months:"目标覆盖月数",buffer:"额外缓冲资金",pre:"投前估值",raise:"本轮新增股权资金",revenue:"期间营业收入",cost:"同期间营业成本",entry:"已投资本",exit:"回收价值",optionPool:"本次新增期权池投后比例"};
const initialInputs={cash:"300",burn:"50",months:"18",buffer:"100",pre:"7000",raise:"3000",revenue:"1200",cost:"400",entry:"1000",exit:"2500",optionPool:"0"};
const recordPrefix="FundLink financial scenario v1\n";
function defaults():Draft{return {inputs:initialInputs,sources:Object.fromEntries(Object.keys(initialInputs).map(key=>[key,{kind:"assumption",note:"演示假设，请替换为自己的口径与数据"}])) as Draft["sources"],holders:[{id:"founders",name:"创始团队",percent:70},{id:"existing",name:"历史投资人",percent:30}],poolTiming:"before",terms:"简化普通股融资；未计入可转债、分期出资、特殊优先权、反稀释、费用和税项。",plan:[{id:"product",use:"产品研发",amount:"1800",milestone:"完成下一版产品验证（示例）",date:"",owner:""},{id:"market",use:"市场拓展",amount:"1200",milestone:"验证可重复销售流程（示例）",date:"",owner:""}],context:{stage:"unknown",cashFlow:"unknown",strategic:false,research:false,equity:"unknown",repayment:"unknown"},diligence:{}}}
function loadDraft(p:SectionProps):Draft{
  const latest=p.w.events.find(event=>event.detail.startsWith(recordPrefix));
  if(latest){try{const saved=JSON.parse(latest.detail.slice(recordPrefix.length)) as {draft?:Draft};if(saved.draft?.inputs&&saved.draft.sources&&Array.isArray(saved.draft.holders)&&Array.isArray(saved.draft.plan)&&saved.draft.context&&saved.draft.diligence)return {...defaults(),...saved.draft}}catch{/* Older or edited activity records do not replace a valid draft. */}}
  return defaults();
}
const display=(value:number|null,decimals=1)=>value===null||!Number.isFinite(value)?"待补充":value.toLocaleString("zh-CN",{maximumFractionDigits:decimals});
const errorMessage=(error:unknown)=>error instanceof Error?error.message:"请检查输入后重试。";
const tabs=[["runway","资金与里程碑"],["dilution","股权结构"],["margin","经营与回报"],["capital","资本类型诊断"],["diligence","双向尽调"]] as const;

export function ToolsPanel(p:SectionProps){
  const [tab,setTab]=useState<string>("runway"),[draft,setDraft]=useState<Draft>(()=>loadDraft(p)),[busy,setBusy]=useState(false),[saveError,setSaveError]=useState("");
  const framework=diligenceFramework(p.role),diagnosis=diagnoseCapital(draft.context);
  const inputs=Object.fromEntries(Object.entries(draft.inputs).map(([key,value])=>[key,value.trim()===""?NaN:Number(value)/(key==="optionPool"?100:1)])) as ScenarioInput;
  let result:ReturnType<typeof calculateScenario>|null=null,calculationError="",capTable:ReturnType<typeof calculateCapTable>|null=null,capError="";
  try{result=calculateScenario({...inputs,optionPool:draft.poolTiming==="after"?0:inputs.optionPool})}catch(error){calculationError=errorMessage(error)}
  try{capTable=calculateCapTable(draft.holders,inputs,draft.poolTiming)}catch(error){capError=errorMessage(error)}
  const planTotal=draft.plan.reduce((total,item)=>total+(item.amount.trim()===""?NaN:Number(item.amount)),0);
  const planError=draft.plan.some(item=>!item.use.trim()||item.amount.trim()===""||!Number.isFinite(Number(item.amount))||Number(item.amount)<0)?"请为每项资金用途填写名称和非负预算。":"";

  function field(key:InputKey){const source=draft.sources[key]||{kind:"assumption",note:""};return <div key={key}>
    <label className="field">{labels[key]}（{key==="months"?"个月":key==="optionPool"?"%":"人民币万元"}）<input type="number" min="0" step="any" max={key==="optionPool"?99.99:undefined} value={draft.inputs[key]} onChange={event=>setDraft({...draft,inputs:{...draft.inputs,[key]:event.target.value},sources:{...draft.sources,[key]:{...source,kind:"self_reported",note:source.kind==="assumption"?"用户输入，尚未独立验证":source.note}}})}/></label>
    <details><summary className="muted small-text" style={{cursor:"pointer"}}>来源与假设：{source.kind==="assumption"?"假设 / 示例":source.kind==="document"?"资料摘录，待验证":"用户自述，待验证"}</summary><label className="field">输入来源<select value={source.kind} onChange={event=>setDraft({...draft,sources:{...draft.sources,[key]:{...source,kind:event.target.value as InputSource["kind"]}}})}><option value="assumption">假设 / 示例</option><option value="self_reported">用户自述</option><option value="document">资料摘录（待验证）</option></select></label><label className="field">日期、期间、资料名或假设依据<input value={source.note} maxLength={400} onChange={event=>setDraft({...draft,sources:{...draft.sources,[key]:{...source,note:event.target.value}}})}/></label></details>
  </div>}
  function updatePlan(id:string,partial:Partial<Milestone>){setDraft({...draft,plan:draft.plan.map(item=>item.id===id?{...item,...partial}:item)})}
  function snapshot(){
    const finalOwnership=result&&capTable?{
      ...result,
      dilution:(capTable.find(row=>row.id==="new-investor")?.after??0)/100,
      optionPool:(capTable.find(row=>row.id==="new-pool")?.after??0)/100,
      existingOwnership:capTable.slice(0,-2).reduce((total,row)=>total+row.after,0)/100,
    }:result;
    return {version:1,role:p.role,createdAt:new Date().toISOString(),currency:"CNY",unit:"万元",draft,results:finalOwnership,capTable,capitalDiagnosis:diagnosis,diligenceFramework:framework,planTotal,assumptions:["静态净消耗，不包含新增收入预测。","用途预算用于分配资金，不重复叠加到净消耗公式。","股权结果包含所选期权池时点假设，与 Cap Table 的融资后比例一致。","毛利率与 MOIC 的输入需统一期间、币种与口径。","资本诊断是教育性研究框架，结果不代表获资资格、审批或承诺。"]};
  }
  async function save(){
    if(calculationError||capError||planError){setSaveError(calculationError||capError||planError);return}
    setBusy(true);setSaveError("");
    try{await p.change(current=>withEvent(current,"保存金融测算与尽调计划",recordPrefix+JSON.stringify(snapshot())));p.notify("测算、输入依据、资金计划与尽调记录已保存，可在本页恢复或导出。")}catch(error){setSaveError(errorMessage(error))}finally{setBusy(false)}
  }

  return <>
    <SectionHead kicker="FINANCIAL TOOLKIT" title="让数字，帮助你做准备。" text="把输入依据、资金计划、股权变化和尽调问题放在同一个情景里。"/>
    <div className="notice" style={{alignItems:"flex-start"}}>初始数值为演示假设。金额统一使用人民币万元；自述和资料摘录均未自动验证，点击每项「来源与假设」可补充依据。</div>
    <div className="tabs tools-tabs" style={{overflowX:"auto"}}>{tabs.map(([key,label])=><button key={key} className={tab===key?"active":""} onClick={()=>setTab(key)} style={{whiteSpace:"nowrap"}}>{label}</button>)}</div>
    {calculationError&&<p className="notice danger" role="alert">{calculationError}</p>}
    {tab==="runway"&&<>
      <div className="calculator-layout"><div className="panel"><h2>现金续航与融资需求</h2>{(["cash","burn","months","buffer"] as InputKey[]).map(field)}</div><div className="calculation-result"><span className="overline">SCENARIO RESULT</span><h3>当前静态现金续航</h3><strong>{display(result?.runway??null)}<small>个月</small></strong><p>{inputs.burn===0?"月度净消耗为零，无有限续航值。":"假设每月净消耗不变，不包含未来新增现金流。"}</p><hr/><div className="row spread" style={{flexWrap:"wrap"}}><span>所需外部融资</span><b>{display(result?.fundingNeed??null)} 万元</b></div><div className="formula">max（0，月度净消耗 × 覆盖月数 + 缓冲 − 现金）</div><p>缓冲为净消耗之外单独预留的资金；资金用途预算用于分配融资额，避免把同一笔支出重复计算。</p><p>情景对照：月度净消耗提高 20% 时，续航 {display(inputs.burn>0&&Number.isFinite(inputs.cash)?inputs.cash/(inputs.burn*1.2):null)} 个月。</p><button className="secondary" onClick={()=>setTab("dilution")}>核对计划融资额与稀释</button></div></div>
      <div className="panel subsection"><div className="row spread" style={{flexWrap:"wrap"}}><h2>资金用途与可验证里程碑</h2><button className="secondary" disabled={draft.plan.length>=20} onClick={()=>setDraft({...draft,plan:[...draft.plan,{id:crypto.randomUUID(),use:"",amount:"0",milestone:"",date:"",owner:""}]})}><Plus size={15}/>添加用途</button></div><p>记录目标交付物、计划日期与负责人，后续可与尽调材料逐项核对。</p>
        {draft.plan.map((item,index)=><div key={item.id} style={{borderTop:"1px solid var(--line)",padding:"16px 0"}}><div className="row spread"><Badge>用途 {index+1}</Badge><button className="quiet" aria-label={"移除用途 "+(index+1)} onClick={()=>setDraft({...draft,plan:draft.plan.filter(plan=>plan.id!==item.id)})}><Trash2 size={15}/>移除</button></div><div className="profile-form-grid"><label className="field">资金用途<input maxLength={120} value={item.use} onChange={event=>updatePlan(item.id,{use:event.target.value})}/></label><label className="field">预算（万元）<input type="number" min="0" step="any" value={item.amount} onChange={event=>updatePlan(item.id,{amount:event.target.value})}/></label><label className="field">里程碑 / 验收依据<input maxLength={400} value={item.milestone} placeholder="例如：交付测试报告、形成客户回款" onChange={event=>updatePlan(item.id,{milestone:event.target.value})}/></label><label className="field">预计完成日期<input type="date" value={item.date} onChange={event=>updatePlan(item.id,{date:event.target.value})}/></label><label className="field">负责人<input maxLength={100} value={item.owner} onChange={event=>updatePlan(item.id,{owner:event.target.value})}/></label></div></div>)}
        {planError?<p role="alert" className="notice danger">{planError}</p>:<div className="notice">用途预算合计 {display(planTotal)} 万元；计划股权融资 {display(inputs.raise)} 万元；{planTotal>inputs.raise?"用途预算超过计划融资 "+display(planTotal-inputs.raise)+" 万元，请说明自有资金或调整计划。":"未分配融资额 "+display(inputs.raise-planTotal)+" 万元。"}</div>}
      </div>
    </>}
    {tab==="dilution"&&<>
      <div className="calculator-layout"><div className="panel"><h2>融资与期权池假设</h2>{(["pre","raise","optionPool"] as InputKey[]).map(field)}<label className="field">新增期权池由谁承担<select value={draft.poolTiming} onChange={event=>setDraft({...draft,poolTiming:event.target.value as PoolTiming})}><option value="before">融资前设立，由原股东承担</option><option value="after">融资后设立，全体股东同比承担</option></select></label><label className="field">其他条款 / 排除项<textarea maxLength={2000} value={draft.terms} onChange={event=>setDraft({...draft,terms:event.target.value})}/></label></div><div className="calculation-result"><h3>本轮新投资人投后占比</h3><strong>{display(capTable?.find(row=>row.id==="new-investor")?.after??null)}<small>%</small></strong><hr/><div className="row spread"><span>投后估值</span><b>{display(result?.postMoney??null)} 万元</b></div><div className="formula">投后估值 = 投前估值 + 本轮新增股权资金</div><p>{draft.poolTiming==="before"?"新增期权池按投后比例计算，从原股东留存比例中扣除；新投资人占比保持为融资额 ÷ 投后估值。":"先完成融资，再按新增期权池比例同比稀释原股东和新投资人。"}</p><p>这里的期权池为本次新增部分。若已有期权池，请列入原股东结构；本工具不模拟特殊证券和优先分配。</p></div></div>
      <div className="panel subsection"><div className="row spread" style={{flexWrap:"wrap"}}><h2>可编辑 Cap Table</h2><button className="secondary" disabled={draft.holders.length>=20} onClick={()=>setDraft({...draft,holders:[...draft.holders,{id:crypto.randomUUID(),name:"",percent:0}]})}><Plus size={15}/>新增原股东</button></div><p>融资前合计需为 100%。当前：{display(draft.holders.reduce((total,holder)=>total+holder.percent,0),2)}%。</p>
        <div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse",minWidth:540}}><thead><tr><th style={{textAlign:"left",padding:12}}>股东</th><th>融资前 %</th><th>融资后 %</th><th>操作</th></tr></thead><tbody>{draft.holders.map((holder,index)=><tr key={holder.id}><td style={{padding:8}}><input aria-label={"股东 "+(index+1)+" 名称"} maxLength={100} value={holder.name} onChange={event=>setDraft({...draft,holders:draft.holders.map(item=>item.id===holder.id?{...item,name:event.target.value}:item)})}/></td><td style={{padding:8,maxWidth:130}}><input aria-label={holder.name+" 融资前占比"} type="number" min="0" max="100" step="any" value={Number.isFinite(holder.percent)?holder.percent:""} onChange={event=>setDraft({...draft,holders:draft.holders.map(item=>item.id===holder.id?{...item,percent:event.target.value===""?NaN:Number(event.target.value)}:item)})}/></td><td style={{textAlign:"center"}}>{display(capTable?.find(row=>row.id===holder.id)?.after??null,2)}</td><td style={{textAlign:"center"}}><button className="quiet" aria-label={"移除股东 "+holder.name} disabled={draft.holders.length<=1} onClick={()=>setDraft({...draft,holders:draft.holders.filter(item=>item.id!==holder.id)})}><Trash2 size={15}/></button></td></tr>)}{capTable?.slice(-2).map(row=><tr key={row.id}><td style={{padding:12}}>{row.name}</td><td style={{textAlign:"center"}}>0</td><td style={{textAlign:"center"}}>{display(row.after,2)}</td><td/></tr>)}</tbody></table></div>{capError&&<p role="alert" className="notice danger">{capError}</p>}
      </div>
    </>}
    {tab==="margin"&&<div className="calculator-layout"><div className="panel"><h2>经营与回报口径</h2>{(["revenue","cost","entry","exit"] as InputKey[]).map(field)}<p>营业收入与营业成本使用同一期间；回收价值与已投资本使用一致币种，注明是否含已实现分配。</p></div><div className="calculation-result"><h3>毛利率</h3><strong>{display(result?.grossMargin==null?null:result.grossMargin*100)}<small>%</small></strong><div className="formula">（营业收入 − 营业成本）÷ 营业收入</div><hr/><div className="row spread"><span>投资回报倍数 MOIC</span><b>{display(result?.moic??null,2)} x</b></div><div className="formula">回收价值 ÷ 已投资本</div><p>MOIC 不包含时间价值、费用和税项。毛利率与净利润率使用不同成本口径。</p>{result?.warnings.map(warning=><p key={warning} className="amber">{warning}</p>)}</div></div>}
    {tab==="capital"&&<>
      <div className="panel"><h2>先确认适配条件</h2><p>这些条件由你明确填写，结果只是下一步研究顺序；不推断资格、偿债能力或融资成功率。</p><div className="profile-form-grid">
        <label className="field">企业发展阶段<select value={draft.context.stage} onChange={event=>setDraft({...draft,context:{...draft.context,stage:event.target.value as CapitalContext["stage"]}})}><option value="unknown">尚不确定</option><option value="early">早期验证</option><option value="growth">产品与商业模式增长</option><option value="mature">成熟经营 / 扩张</option></select></label>
        <label className="field">经营现金流状态<select value={draft.context.cashFlow} onChange={event=>setDraft({...draft,context:{...draft.context,cashFlow:event.target.value as CapitalContext["cashFlow"]}})}><option value="unknown">尚不确定</option><option value="negative">仍在净消耗现金</option><option value="stable">已有相对稳定的经营现金流</option></select></label>
        <label className="field">接受股权稀释吗？<select value={draft.context.equity} onChange={event=>setDraft({...draft,context:{...draft.context,equity:event.target.value as CapitalContext["equity"]}})}><option value="unknown">需要进一步考虑</option><option value="yes">可以讨论</option><option value="no">当前不接受</option></select></label>
        <label className="field">有可支持偿债的资金来源吗？<select value={draft.context.repayment} onChange={event=>setDraft({...draft,context:{...draft.context,repayment:event.target.value as CapitalContext["repayment"]}})}><option value="unknown">尚未验证</option><option value="yes">自述具备，待补证据</option><option value="no">当前没有</option></select></label>
      </div><label className="check-field"><input type="checkbox" checked={draft.context.strategic} onChange={event=>setDraft({...draft,context:{...draft.context,strategic:event.target.checked}})}/>需要产业客户、渠道或供应链协同</label><label className="check-field"><input type="checkbox" checked={draft.context.research} onChange={event=>setDraft({...draft,context:{...draft.context,research:event.target.checked}})}/>涉及研发或科研成果转化</label></div>
      <div className="tool-grid subsection">{diagnosis.map(item=><div className="panel" key={item.id}><h3>{item.name}</h3><Badge tone={item.fit==="可优先研究"?"cyan":"amber"}>{item.fit}</Badge><p>{item.reason}</p><ul style={{paddingLeft:20}}>{item.checks.map(check=><li key={check} style={{margin:"8px 0",fontSize:14}}>{check}</li>)}</ul></div>)}</div>
    </>}
    {tab==="diligence"&&<div className="panel"><div className="row spread" style={{flexWrap:"wrap"}}><h2>{p.role==="investor"?"投资方：企业尽调框架":"融资方：资本反向尽调框架"}</h2><Badge>{framework.filter(item=>draft.diligence[item.id]?.status==="reviewed").length} / {framework.length} 项已人工复核</Badge></div><p>标记进展并记录原文、来源、时间或待澄清问题。「已人工复核」只记录你的操作，不代表平台独立核验。</p>{framework.map(item=>{const state=draft.diligence[item.id]||{status:"pending",note:""};return <div key={item.id} style={{borderTop:"1px solid var(--line)",padding:"20px 0"}}><h3>{item.title}</h3><p>{item.question}</p><small className="muted">可索取：{item.request}</small><div className="profile-form-grid"><label className="field">进展<select value={state.status} onChange={event=>setDraft({...draft,diligence:{...draft.diligence,[item.id]:{...state,status:event.target.value as DiligenceState["status"]}}})}><option value="pending">待核实</option><option value="requested">已整理索取资料需求</option><option value="reviewed">已人工复核</option></select></label><label className="field">依据 / 问题 / 下一步<textarea value={state.note} maxLength={1200} placeholder="记录材料来源、日期与未解决问题" onChange={event=>setDraft({...draft,diligence:{...draft.diligence,[item.id]:{...state,note:event.target.value}}})}/></label></div></div>})}</div>}
    <div className="notice">本页为基于输入的简化情景与研究框架；未验证融资估值、资本资格、合同条款或收益。具体条件可记录为待核实问题。</div>
    {saveError&&<p className="notice danger" role="alert">{saveError}</p>}
    <div className="detail-actions"><button className="primary" disabled={busy} onClick={()=>void save()}><Save size={16}/>{busy?"正在保存…":"保存本次测算与计划"}</button><button className="secondary" disabled={!!calculationError||!!capError||!!planError} onClick={()=>download("FundLink-"+p.role+"-金融情景.json",JSON.stringify(snapshot(),null,2))}><Download size={16}/>导出完整情景</button></div>
  </>;
}
