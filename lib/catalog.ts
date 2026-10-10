import type {Role,Workspace,Profile} from "./model";
import {evaluateMatch,rankCandidates as rankEntities} from "./matching";
export type EntityEvidence={id:string;name:string;date:string;type:string;claim:string;url?:string;status?:"verified"|"public"|"self-reported"|"hypothesis"|"simulated"};
export type Entity={id:string;name:string;en:string;initial:string;sector:string;tags:string[];stage:string;stages:string[];region:string;amount:number;min:number;max:number;desc:string;metric:string;metricValue:string;team:string;resources:string[];risk:string;color:string;paid:boolean;competitor:boolean;
 source?:"demo"|"public"|"authorized";real?:boolean;sectors?:string[];regions?:string[];currency?:string;currencies?:string[];financingTypes?:string[];investorType?:string;excludedInvestorTypes?:string[];unacceptableTerms?:string[];terms?:string[];dealRoles?:string[];requiredCriteria?:string[];excludedSectors?:string[];excludedStages?:string[];resourceNeeds?:string[];priorities?:string[];evidenceRecords?:EntityEvidence[];verifiedIdentity?:boolean;authorized?:boolean;complianceVerified?:boolean;paidKnown?:boolean;conflictKnown?:boolean;unknownFields?:string[]};
const rawCompanies=[
["industrialmind","IndustrialMind AI","工业智能","IM","人工智能","A 轮","中国",3000,"工业现场的 AI 决策引擎，将设备数据转化为可执行的生产优化建议。","付费客户","20 家","工业算法与制造系统背景的联合创始团队","收入口径待核实","#77e3d0",true],
["kinetic","擎动机器人","Kinetic Robotics","K","机器人","Pre-A 轮","中国",2000,"面向柔性制造的具身智能协作机器人，降低中小工厂自动化门槛。","试点产线","12 条","机器人控制、机械工程及产线交付团队","试点转付费率待验证","#a8b3ff",false],
["flowstack","FlowStack","智能工作流","F","企业服务","A 轮","中国",1500,"把分散的企业业务系统连接成可追溯的自动化工作流。","年度续费率","92%","企业软件与数据集成团队","客户集中度待核实","#79bde9",true],
["voltloop","循环能源","VoltLoop","V","新能源","B 轮","中国",5000,"用电池健康算法与模块化储能，帮助工商业用户管理电力成本。","运营站点","36 个","储能系统与电力市场团队","项目回款周期较长","#e8bb73",true],
["neuralcare","知微医疗","NeuralCare","N","医疗科技","A 轮","中国",2500,"为基层机构提供辅助影像分析工具，支持医生开展初步筛查。","合作机构","18 家","医疗影像与临床工程团队","产品资质范围待核实","#ef9cb6",true],
["silica","砺芯科技","Silica Labs","S","半导体","Pre-A 轮","中国",3500,"面向边缘计算设备的低功耗推理加速器和配套编译工具链。","工程样片","2 代","芯片架构与编译器团队","量产良率待验证","#baacfa",false],
["agentmesh","AgentMesh","企业智能体","AM","人工智能","种子轮","美国",500,"提供多智能体任务编排与可观测平台，面向企业研发团队。","测试团队","60 家","开源基础设施团队","开源用户转付费待验证","#74d0ce",false],
["terra","田野智能","TerraSense","T","人工智能","天使轮","中国",800,"利用视觉与传感数据帮助设施农业优化种植管理。","付费农场","8 家","农业物联网与视觉算法团队","季节性收入待核实","#b0c980",true],
["arc","Arc Analytics","经营分析","A","企业服务","A 轮","东南亚",2000,"为区域中小企业提供跨渠道经营分析与现金流看板。","付费企业","130 家","财务科技与企业数据团队","地区收入结构待核实","#9bb4ee",true],
["openforge","OpenForge","研发协作","OF","人工智能","Pre-A 轮","中国",1200,"面向工程师的代码检索、知识管理与研发助理。","付费团队","24 家","开发者工具团队","核心依赖许可待核实","#bd9cee",true],
["motion","墨行科技","Motion AI","M","机器人","A 轮","中国",3000,"为仓储与物流提供自主移动机器人及调度软件。","部署仓库","16 个","物流自动化与导航团队","硬件毛利与维护成本待核实","#dfb279",true],
["carbon","碳弧科技","CarbonArc","C","新能源","种子轮","东南亚",400,"为工厂提供碳排放数据采集和节能改造测算。","试点企业","6 家","工业物联网团队","测算方法待验证","#79bba6",false]
] as const;
export const companies:Entity[]=rawCompanies.map(r=>({id:r[0],name:r[1],en:r[2],initial:r[3],sector:r[4],stage:r[5],stages:[r[5]],region:r[6],amount:r[7],min:r[7]*.2,max:r[7],desc:r[8],metric:r[9],metricValue:r[10],team:r[11],risk:r[12],color:r[13],paid:r[14],tags:[r[4],r[5],r[6]],resources:["产业客户","技术支持"],competitor:false,source:"demo",real:false,currency:"CNY",financingTypes:["股权融资","战略投资"],resourceNeeds:r[4]==="企业服务"?["销售渠道","长期陪伴"]:["产业客户","技术支持"],dealRoles:["领投","跟投","灵活参与"],paidKnown:true,conflictKnown:true}));
const rawFunds=[
["horizon","远景制造基金","Horizon Ventures","H","人工智能",1000,5000,"中国","产业客户、供应链资源","关注工业 AI 与先进制造，从技术验证到规模商业化。","#77e3d0",false],
["origin","原点创投","Origin Capital","O","人工智能",300,3000,"中国","技术支持、长期陪伴","支持有技术积累的早期团队，关注企业智能化。","#a8b3ff",false],
["axis","轴心资本","Axis Capital","AX","机器人",500,5000,"中国","产业客户、供应链资源","投资机器人及核心零部件，连接制造生态伙伴。","#79bde9",false],
["bridge","桥石创投","BridgeStone Ventures","B","企业服务",800,4000,"中国","销售渠道、长期陪伴","关注企业软件和垂直 SaaS，协助搭建商业化体系。","#e5b378",true],
["green","青峰能源基金","GreenPeak","G","新能源",1000,8000,"中国","供应链资源、产业客户","聚焦储能和电力数字化，提供项目落地资源。","#a8c987",false],
["atlas","Atlas Growth","亚太成长资本","AT","企业服务",500,5000,"东南亚","国际化经验、销售渠道","支持亚洲企业服务与数字基础设施增长。","#b2a0ed",false],
["spring","初源天使","Spring Seed","SP","人工智能",100,1500,"中国","技术支持、长期陪伴","陪伴产品原型阶段的技术创业团队。","#ef9cb6",false],
["nova","星核产业资本","Nova Industry","NV","半导体",1000,6000,"中国","产业客户、供应链资源","关注国产芯片、边缘计算和开发工具。","#9bb7ef",true],
["vita","维拓健康基金","Vita Health","VT","医疗科技",500,5000,"中国","产业客户、长期陪伴","关注医疗服务与数字健康的可持续商业模式。","#c7a0dd",false],
["pacific","Pacific Frontier","太平洋前沿资本","PF","人工智能",100,5000,"全球","国际化经验、技术支持","寻找跨区域的技术基础设施与 AI 应用机会。","#84c8ca",false],
["delta","川流创投","Delta Ventures","D","人工智能",1000,4000,"中国","销售渠道、产业客户","专注拥有付费客户和可复制交付能力的应用企业。","#d2bd8c",false],
["future","未来工场基金","Future Works","FW","机器人",100,3000,"全球","技术支持、长期陪伴","陪伴从实验室走向真实场景的智能硬件团队。","#a1acd7",false],
["clarity","澄知资本","Clarity Capital","CL","人工智能",800,4000,"中国","技术支持、产业客户","围绕工业智能与企业决策系统，支持可验证的商业化路径。","#87caba",false],
["northstar","北辰创投","Northstar Ventures","NS","人工智能",1000,5000,"中国","国际化经验、销售渠道","投资具备规模化交付能力的 AI 应用与开发平台。","#b7a7e7",false],
["oak","橡木成长基金","Oak Growth","OK","人工智能",2000,6000,"中国","长期陪伴、产业客户","关注已经建立客户基础的企业智能化服务。","#c7ba8b",false],
["meridian","子午线资本","Meridian Capital","MC","人工智能",500,3500,"全球","技术支持、国际化经验","帮助有技术优势的创业公司探索跨区域商业化。","#89b6df",false]
] as const;
export const funds:Entity[]=rawFunds.map((r,i)=>({id:r[0],name:r[1],en:r[2],initial:r[3],sector:r[4],min:r[5],max:r[6],amount:r[6],region:r[7],resources:r[8].split("、"),desc:r[9],color:r[10],competitor:r[11],stage:i===6?"种子 / 天使":"Pre-A / A / B",stages:i===6?["种子轮","天使轮"]:i===1||i===9||i===11?["种子轮","天使轮","Pre-A 轮","A 轮"]:["Pre-A 轮","A 轮","B 轮","成长期"],metric:"投资范围",metricValue:r[5]+"–"+r[6]+" 万",team:"投资与产业研究团队（模拟）",risk:r[11]?"潜在竞品投资冲突":"当前可投额度待确认",paid:true,tags:[r[4],r[7],i===0||i===7?"产业资本":"VC 基金"],source:"demo",real:false,currency:"CNY",financingTypes:["股权融资","战略投资"],investorType:i===0||i===7?"产业资本 CVC":"风险投资 VC",dealRoles:["领投","跟投","灵活参与"],priorities:i===10?["付费客户","收入增长"]:["技术壁垒","创始团队"],requiredCriteria:i===10?["必须有付费客户"]:[],conflictKnown:true}));
export const catalog=(role:Role)=>role==="investor"?companies:funds;
export const entityById=(id:string)=>[...companies,...funds].find(e=>e.id===id);
export function amounts(text:string):[number,number]|null{
 if(!text||/不确定|估算|跳过/.test(text)||/美元|USD|欧元|EUR|美金|港元|港币|HKD|新币|SGD|马币|MYR|日元|JPY|英镑|GBP|\$|€|£|¥|人民币以外/i.test(text))return null;
 const parts=[...text.replaceAll(",","").matchAll(/(\d+(?:\.\d+)?)\s*(亿|万|千|元)?/g)];if(!parts.length||parts.length>2)return null;
 const fallback=parts[parts.length-1][2]||"万";const factor:Record<string,number>={亿:10000,万:1,千:.1,元:.0001};
 const nums=parts.map(p=>Number(p[1])*factor[p[2]||fallback]);if(nums.some(n=>!Number.isFinite(n)||n<=0))return null;
 return [Math.min(...nums),text.includes("以上")?1e7:Math.max(...nums)];
}
/** The catalog wrapper supplies peers for consented behavioral learning without a runtime import cycle. */
export function matchEntity(e:Entity,w:Workspace,role:Role){return evaluateMatch(e,w,role,catalog(role))}
export const rankCandidates=rankEntities;
export const sampleProfile=(role:Role):Profile=>role==="investor"?{name:"远景投资 · 研究团队",completed:true,answers:{type:"风险投资 VC",objective:"产业协同",sector:"人工智能、机器人、企业服务",stage:"A 轮、Pre-A 轮",amount:"500–5,000 万元",region:"中国",priority:"技术壁垒、付费客户",dealRole:"领投",resources:"产业客户、供应链资源",constraints:"必须有付费客户",goals:"寻找项目、深度研究、风险核查"}}:{name:"IndustrialMind AI",completed:true,answers:{type:"已注册企业",sector:"人工智能",stage:"A 轮 · 规模增长",traction:"已有付费客户",amount:"3,000 万元",region:"中国",use:"产品研发、市场拓展",horizon:"6 个月内",constraints:"股权融资",goals:"产业客户、技术支持"}};
export function evidence(e:Entity):EntityEvidence[]{if(e.evidenceRecords)return e.evidenceRecords;if(e.source!=="demo"&&e.real!==false)return [];return [{id:e.id+"-bp",name:funds.some(f=>f.id===e.id)?"机构策略说明（模拟）":"商业计划书（模拟）",date:"2026-09-30",type:"用户自述 · 待验证",claim:e.id==="industrialmind"?e.desc+" 2026 年 9 月 ARR 为 1,200 万元（时点年化口径）。":e.desc},{id:e.id+"-finance",name:funds.some(f=>f.id===e.id)?"历史投资案例汇编（模拟）":"经营数据摘要（模拟）",date:"2026-09-30",type:"演示资料 · 未独立核实",claim:e.id==="industrialmind"?"2025 全年已确认营业收入 400 万元；付费客户 20 家。收入确认政策与合同明细待提供。":e.metric+"："+e.metricValue},{id:e.id+"-research",name:"研究访谈纪要（模拟）",date:"2026-10-08",type:"研究假设 · 待核实",claim:e.risk}]}
export const stages=["研究中","意向沟通","双方确认","安排会谈","尽职调查","条款磋商","决策记录","已关闭"];



