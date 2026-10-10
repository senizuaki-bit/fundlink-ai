import type {Role} from "./model";

export type ScenarioInput={cash:number;burn:number;months:number;buffer:number;pre:number;raise:number;revenue:number;cost:number;entry:number;exit:number;optionPool?:number};
export type ScenarioResult={runway:number|null;fundingNeed:number;postMoney:number;dilution:number|null;grossMargin:number|null;moic:number|null;existingOwnership:number|null;optionPool:number;warnings:string[]};
const number=(value:number,label:string)=>{if(!Number.isFinite(value)||value<0)throw new Error(label+"必须是大于或等于零的有限数值。");return value};

/** Money uses one consistent currency/unit. optionPool is NEW pool / post-money fully diluted equity. */
export function calculateScenario(input:ScenarioInput):ScenarioResult{
  for(const key of ["cash","burn","months","buffer","pre","raise","revenue","cost","entry","exit"] as const)number(input[key],key);
  const optionPool=number(input.optionPool??0,"新增期权池比例");
  if(optionPool>=1)throw new Error("新增期权池比例必须小于 100%。");
  const postMoney=input.pre+input.raise,dilution=postMoney>0?input.raise/postMoney:null;
  if(dilution!==null&&dilution+optionPool>1+1e-10)throw new Error("投资人占比与新增期权池合计超过 100%，请调整假设。");
  const result={
    runway:input.burn>0?input.cash/input.burn:null,
    fundingNeed:Math.max(0,input.burn*input.months+input.buffer-input.cash),postMoney,dilution,
    grossMargin:input.revenue>0?(input.revenue-input.cost)/input.revenue:null,
    moic:input.entry>0?input.exit/input.entry:null,
    existingOwnership:dilution!==null?Math.max(0,1-dilution-optionPool):null,optionPool,
    warnings:[
      ...(input.burn===0?["月度净消耗为零：没有有限的静态续航值，仍需考虑未来现金支出。"]:[]),
      ...(input.revenue===0?["营业收入为零：毛利率无法计算。"]:[]),
      ...(input.entry===0?["已投资本为零：MOIC 无法计算。"]:[]),
      ...(postMoney===0?["投后估值为零：股权占比无法计算。"]:[]),
      ...(input.cost>input.revenue?["营业成本高于收入，当前假设下毛利为负。"]:[]),
    ],
  };
  if(Object.values(result).some(value=>typeof value==="number"&&!Number.isFinite(value)))throw new Error("输入数值过大，请缩小数值或改用更大的金额单位。");
  return result;
}

export type CapHolder={id:string;name:string;percent:number};
export type PoolTiming="before"|"after";
export function calculateCapTable(holders:CapHolder[],input:ScenarioInput,timing:PoolTiming="before"){
  if(!holders.length||holders.length>20)throw new Error("请填写 1–20 位原股东。");
  if(holders.some(holder=>!holder.name.trim()))throw new Error("请填写每位股东的名称。");
  for(const holder of holders)number(holder.percent,"股东持股比例");
  const total=holders.reduce((sum,holder)=>sum+holder.percent,0);
  if(Math.abs(total-100)>0.00001)throw new Error("融资前各股东比例合计必须为 100%（当前 "+total.toFixed(2)+"%）。");
  const basic=calculateScenario({...input,optionPool:timing==="after"?0:input.optionPool});
  if(basic.dilution===null)throw new Error("请先填写大于零的投前估值或本轮融资额。");
  const pool=number(input.optionPool??0,"新增期权池比例");if(pool>=1)throw new Error("新增期权池比例必须小于 100%。");
  const investor=timing==="after"?basic.dilution*(1-pool):basic.dilution;
  const original=timing==="after"?(1-basic.dilution)*(1-pool):1-basic.dilution-pool;
  return [
    ...holders.map(holder=>({...holder,before:holder.percent,after:holder.percent*original})),
    {id:"new-investor",name:"本轮新投资人",percent:0,before:0,after:investor*100},
    {id:"new-pool",name:"本次新增期权池",percent:0,before:0,after:pool*100},
  ];
}

export type CapitalContext={stage:"early"|"growth"|"mature"|"unknown";cashFlow:"negative"|"stable"|"unknown";strategic:boolean;research:boolean;equity:"yes"|"no"|"unknown";repayment:"yes"|"no"|"unknown"};
export type CapitalDiagnosis={id:string;name:string;fit:"可优先研究"|"条件待确认"|"当前假设不适配";reason:string;checks:string[]};
export function diagnoseCapital(context:CapitalContext):CapitalDiagnosis[]{
  const equityFit=context.equity==="no"?"当前假设不适配":context.equity==="unknown"?"条件待确认":null;
  return [
    {id:"angel",name:"天使 / 种子资本",fit:equityFit||(context.stage==="early"?"可优先研究":"条件待确认"),reason:context.equity==="no"?"当前不接受股权稀释，需先核对参与方式。":"早期验证与团队建设可作为研究这种资本的起点。",checks:["与当前验证里程碑是否一致","可接受的稀释与治理安排","后续融资能力及支持边界"]},
    {id:"vc",name:"VC / 成长基金",fit:equityFit||(context.stage==="growth"?"可优先研究":"条件待确认"),reason:context.equity==="no"?"当前不接受股权稀释，需先核对参与方式。":"重点对齐业务增长证据、资金需求和基金投资阶段。",checks:["增长与收入质量的依据","估值与未来融资空间","基金周期、治理与退出预期"]},
    {id:"cvc",name:"CVC / 产业资本",fit:equityFit||(context.strategic?"可优先研究":"条件待确认"),reason:context.strategic?"已选择产业客户、渠道或供应链协同诉求。":"尚未确认具体产业协同需求，先核对资源与公司战略。",checks:["竞品投资及信息隔离","排他、优先权与商业独立性","资源承诺、负责人和可验收结果"]},
    {id:"pe",name:"PE / 成熟股权资本",fit:equityFit||(context.stage==="mature"&&context.cashFlow==="stable"?"可优先研究":"条件待确认"),reason:"围绕成熟经营、扩张或并购场景，核对现金流和治理条件。",checks:["持续经营与现金流依据","估值、控制权和既有股东安排","交易结构与退出情景"]},
    {id:"debt",name:"债务 / 银行融资",fit:context.repayment==="no"?"当前假设不适配":context.repayment==="yes"&&context.cashFlow==="stable"?"可优先研究":"条件待确认",reason:context.repayment==="no"?"当前声明没有可支持偿债的资金来源。":"是否适配取决于可验证的偿债现金流和资金用途。",checks:["本金、利息及偿还时间表","担保、契约与期限错配","压力情景下的偿债覆盖"]},
    {id:"policy",name:"政策 / 科研类资金",fit:"条件待确认",reason:context.research?"已选择研发或成果转化需求，仍需核对具体项目资格。":"先确认是否存在符合自身项目条件的资助机会。",checks:["项目资格及申报主体","用途、验收、拨付与配套资金条件","申请周期是否符合现金需要"]},
  ];
}

export type DiligenceItem={id:string;title:string;question:string;request:string};
export function diligenceFramework(role:Role):DiligenceItem[]{
  return role==="investor"?[
    {id:"market",title:"行业与市场",question:"目标客户、市场边界与竞争替代是什么？",request:"客户访谈、市场规模假设与计算底稿"},
    {id:"team",title:"团队与治理",question:"核心岗位、权益安排和决策机制是否清晰？",request:"组织架构、团队经历、股权结构与关键人员安排"},
    {id:"tech",title:"产品与技术",question:"技术、知识产权归属和产品稳定性有哪些证据？",request:"产品演示、测试报告、IP 及第三方许可清单"},
    {id:"traction",title:"商业化",question:"客户、回款、留存和销售周期的口径一致吗？",request:"合同、客户队列、续约明细与回款记录"},
    {id:"finance",title:"财务与现金",question:"收入质量、应收、毛利和现金续航如何？",request:"期间报表、现金明细、预算与资金计划"},
    {id:"terms",title:"融资与条款",question:"估值、稀释和既有权利如何影响本轮与下轮融资？",request:"历史融资摘要、Cap Table 与待讨论条款清单"},
    {id:"risk",title:"风险与退出",question:"主要经营、合同及竞争风险和回报情景是什么？",request:"风险清单、相关合同、情景假设及待专业复核事项"},
  ]:[
    {id:"identity",title:"资本主体与授权",question:"谁出资、谁决策，当前是否有可投额度？",request:"主体、授权范围、投资决策流程与预计周期"},
    {id:"needs",title:"融资额与用途",question:"资金是否覆盖明确用途和可验证里程碑？",request:"资金预算、现有现金、月度净消耗与里程碑计划"},
    {id:"cost",title:"资本成本与条件",question:"各种资本的成本、期限与附带要求是什么？",request:"费用、付款节点、期限及约束条件清单"},
    {id:"control",title:"股权与治理",question:"稀释、控制权及既有股东权利有什么变化？",request:"Cap Table 情景与条款摘要，列出待专业复核事项"},
    {id:"resources",title:"产业资源可信度",question:"资源能否兑现，是否符合企业战略？",request:"可核对案例、业务负责人、承诺内容与验收节点"},
    {id:"conflict",title:"冲突与信息边界",question:"是否投资竞品，有无保密、排他或优先权要求？",request:"冲突说明、信息隔离安排与拟共享资料范围"},
    {id:"timing",title:"出资与现金时间",question:"尽调、审批和拨付周期能否匹配现金需要？",request:"资金来源说明、拨付条件、预计日期与备选资金计划"},
  ];
}
