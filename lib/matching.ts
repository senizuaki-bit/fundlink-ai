import {behaviorAdjustment,learningScope} from "./learning-insights";
import type {Entity,EntityEvidence} from "./catalog";
import type {Role,Workspace} from "./model";

/** Deterministic Demo ranking. Concept vectors below are hand-authored, not trained embeddings. */
export type FitDimension={key:string;label:string;score:number;weight:number;reason:string};
export type MatchResult={
 score:number;pairScore:number;investorFit:number;founderFit:number;why:string[];blocked:string[];unknown:string[];eligible:boolean;
 dimensions:{investor:FitDimension[];founder:FitDimension[]};feedbackAdjustment:number;feedbackReasons:string[];
 evidenceQuality:number;evidenceFreshness:number;evidenceStatus:string;evidence:EntityEvidence[];
 riskPriority:"high"|"medium"|"unknown";riskReasons:string[];uncertainties:string[];nextStep:string;simulated:boolean;
};
export type RetrievalResult={keyword:number;semantic:number;score:number;matchedTerms:string[];matchedConcepts:string[];method:string};
export type RankedCandidate={entity:Entity;match:MatchResult;retrieval:RetrievalResult;rankScore:number;explorationReason:string};

const clamp=(n:number,min=0,max=100)=>Math.max(min,Math.min(max,n));
const unique=(values:string[])=>[...new Set(values.filter(Boolean))];
const list=(s:string|undefined)=>s?s.split(/[、,，;；\n]/).map(x=>x.trim()).filter(Boolean):[];
const intersects=(a:string[],b:string[])=>a.some(x=>b.includes(x));
const SECTORS=["人工智能","机器人","企业服务","新能源","医疗科技","半导体"];
const STAGES=["种子轮","天使轮","Pre-A 轮","A 轮","B 轮","成长期"];
const REGIONS=["中国","东南亚","美国","欧洲","全球"];
const RESOURCES=["产业客户","销售渠道","供应链资源","技术支持","长期陪伴","国际化经验"];
const CONCEPTS:Record<string,string[]>={
 "人工智能":["人工智能","ai","machine learning","机器学习","大模型","llm","推理","智能体","agent","算法"],
 "工业制造":["工业","industrial","制造","manufacturing","工厂","factory","生产线","产线","设备","预测维护"],
 "机器人":["机器人","robot","robotics","具身","embodied","自主移动","协作机器人","自动化"],
 "企业软件":["企业服务","企业软件","saas","enterprise","工作流","workflow","数据集成","经营分析","erp"],
 "能源环保":["新能源","能源","储能","电池","energy","battery","碳排放","低碳","清洁技术","气候","climate","节能"],
 "医疗健康":["医疗","健康","health","clinical","临床","影像","medtech","筛查"],
 "芯片计算":["半导体","芯片","chip","silicon","semiconductor","边缘计算","edge computing","加速器","编译器"],
 "开发工具":["开发者","developer","开源","open source","代码","code","研发","基础设施","infrastructure","git"],
 "商业化":["付费客户","paying customer","收入","revenue","商业化","commercial","销售渠道","市场拓展","增长"],
 "技术壁垒":["技术壁垒","技术支持","算法","专利","研发","研究","工程","技术优势","ip","research"],
 "产业协同":["产业协同","战略合作","产业客户","供应链","生态","制造","产业资本","cvc"],
 "创始团队":["创始团队","创始人","团队","founder","team"],
 "国际化":["国际化","跨区域","海外","global","全球","东南亚","亚太","国际市场"]
};
function normalized(text:string){return text.toLowerCase().replace(/[_\-/]/g," ").replace(/\s+/g," ").trim()}
function hasTerm(text:string,term:string){
 const needle=normalized(term);
 return /^[a-z0-9 ]+$/.test(needle)?new RegExp(`(^|[^a-z0-9])${needle.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")}(?=$|[^a-z0-9])`).test(normalized(text)):normalized(text).includes(needle);
}
function conceptVector(text:string){return Object.values(CONCEPTS).map(terms=>Math.min(3,terms.filter(t=>hasTerm(text,t)).length))}
function cosine(a:number[],b:number[]){const denom=Math.sqrt(a.reduce((n,v)=>n+v*v,0)*b.reduce((n,v)=>n+v*v,0));return denom?a.reduce((n,v,i)=>n+v*b[i],0)/denom:0}
function tokens(text:string){
 const parts=normalized(text).match(/[a-z0-9]+|[\p{Script=Han}]+/gu)||[];
 return unique(parts.flatMap(part=>/[\p{Script=Han}]/u.test(part)&&part.length>2?[part,...Array.from({length:part.length-1},(_,i)=>part.slice(i,i+2))]:[part]));
}
function entityText(e:Entity){return [e.name,e.en,e.sector,e.sectors?.join(" "),e.desc,e.tags.join(" "),e.team,e.resources.join(" "),e.metric,e.metricValue,e.evidenceRecords?.map(x=>x.claim).join(" ")].join(" ")}
export function hybridRetrieve(e:Entity,query:string):RetrievalResult{
 const method="本地全文分词 + 人工概念向量与同义词扩展（非训练式 embedding）";
 if(!query.trim())return {keyword:0,semantic:0,score:0,matchedTerms:[],matchedConcepts:[],method};
 const body=entityText(e), terms=tokens(query), bodyTokens=new Set(tokens(body));
 const matchedTerms=terms.filter(t=>bodyTokens.has(t)||hasTerm(body,t));
 const keyword=terms.length?100*matchedTerms.length/terms.length:0;
 const qv=conceptVector(query),ev=conceptVector(body),semantic=100*cosine(qv,ev);
 const matchedConcepts=Object.keys(CONCEPTS).filter((_,i)=>qv[i]>0&&ev[i]>0);
 return {keyword:Math.round(keyword),semantic:Math.round(semantic),score:Math.round(.55*keyword+.45*semantic),matchedTerms:matchedTerms.slice(0,8),matchedConcepts,method};
}
function sectors(text:string|undefined){
 if(!text)return [];
 return SECTORS.filter(s=>text.includes(s)||s==="人工智能"&&/\bAI\b|大模型|机器学习/i.test(text)||s==="半导体"&&/芯片/.test(text)||s==="医疗科技"&&/医疗|数字健康/.test(text)||s==="新能源"&&/储能|清洁能源/.test(text)||s==="企业服务"&&/\bSaaS\b|企业软件/i.test(text));
}
function stages(text:string|undefined){
 if(!text)return [];
 const normalizedStage=text.replace(/pre\s*[- ]?\s*a\s*轮?/gi,"PREA").replace(/\bseed\b/gi,"种子轮").replace(/\bangel\b/gi,"天使轮").replace(/series\s*a\b/gi,"A轮").replace(/series\s*b\b/gi,"B轮");
 return STAGES.filter(s=>s==="Pre-A 轮"?normalizedStage.includes("PREA"):s==="A 轮"?/(?:^|[^A-Z])A\s*轮/.test(normalizedStage):s==="B 轮"?/B\s*轮/.test(normalizedStage):normalizedStage.includes(s));
}
function regions(text:string|undefined){return text?REGIONS.filter(r=>text.includes(r)):[]}
function currenciesIn(text:string|undefined):string[]{
 if(!text)return [];
 const aliases:Record<string,RegExp>={CNY:/CNY|RMB|人民币/i,USD:/USD|美元|美金|US\$|(?<![A-Za-z])\$/i,EUR:/EUR|欧元|€/i,HKD:/HKD|港元|港币|HK\$/i,SGD:/SGD|新币|新加坡元|S\$/i,MYR:/MYR|马币|马来西亚林吉特/i,JPY:/JPY|日元/i,GBP:/GBP|英镑|£/i};
 const found=Object.entries(aliases).filter(([k,re])=>re.test(text)&&(k!=="USD"||!/(?:HK|S)\$/i.test(text))).map(([k])=>k);
 return found;
}
function currency(text:string|undefined):string|undefined{const found=currenciesIn(text);return found.length===1?found[0]:undefined}
type Money={range:[number,number]|null;currency?:string;issue?:string};
function money(text:string|undefined,explicitCurrency?:string):Money{
 if(!text||/不确定|估算|跳过|待确认|暂无|暂不/.test(text))return {range:null,currency:currency(explicitCurrency)};
 const found=currenciesIn(text),specified=currency(explicitCurrency);
 if(found.length>1||explicitCurrency&&!specified||specified&&found.length&&found[0]!==specified)return {range:null,issue:"金额币种描述不一致或尚未支持"};
 const moneyCurrency=specified||currency(text);
 if(/[¥￥]|人民币以外/.test(text)&&!moneyCurrency)return {range:null,issue:"需确认金额单位或币种"};
 const units:Record<string,number>={亿:10000,万:1,千:.1,元:.0001,k:.1,m:100,b:100000};
 const parts=[...text.replaceAll(",","").matchAll(/(\d+(?:\.\d+)?)\s*(亿|万|千|元|[kmb](?![a-z]))?/gi)];
 if(!parts.length||parts.length>2||/负|-[ ]*\d/.test(text)&&!/[\d万亿千元]\s*[-–—~至]\s*\d/.test(text))return {range:null,issue:"金额格式待确认"};
 const foreign=Boolean(moneyCurrency&&moneyCurrency!=="CNY");
 const lastUnit=parts[parts.length-1][2]?.toLowerCase()||(foreign?"元":"万");
 const values=parts.map(p=>Number(p[1])*(units[p[2]?.toLowerCase()||lastUnit]||1));
 if(values.some(n=>!Number.isFinite(n)||n<=0))return {range:null,issue:"金额必须为正数"};
 return {range:[Math.min(...values),/以上|不少于|at least/i.test(text)?Number.POSITIVE_INFINITY:Math.max(...values)],currency:moneyCurrency||"CNY"};
}
type Party={sector:string[];stage:string[];region:string[];currencies:string[];range:[number,number]|null;resources:string[];needs:string[];priorities:string[];types:string[];investorType:string;roles:string[];terms?:string[];required:string[];excludedSectors:string[];excludedStages:string[];excludedTypes:string[];unacceptableTerms:string[];paid?:boolean;competitor?:boolean;identity?:boolean;authorized?:boolean;compliance?:boolean;text:string};
function entityParty(e:Entity):Party{
 const demo=e.source==="demo"||e.real===false;
 const entityCurrencies=unique([...(e.currencies||[]),...(e.currency?[e.currency]:[])]).map(c=>currency(c)||c.toUpperCase());
 return {sector:e.sectors||sectors(e.sector),stage:unique(stages((e.stages?.length?e.stages:[e.stage]).join("、"))),region:e.regions||regions(e.region),currencies:entityCurrencies.length?entityCurrencies:demo?["CNY"]:[],
 range:Number.isFinite(e.min)&&e.min>0&&Number.isFinite(e.max)&&e.max>=e.min?[e.min,e.max]:null,
 resources:e.resources||[],needs:e.resourceNeeds||[],priorities:e.priorities||[],types:e.financingTypes||(demo?["股权融资","战略投资"]:[]),investorType:e.investorType||"",roles:e.dealRoles||[],terms:e.terms,
 required:e.requiredCriteria||[],excludedSectors:e.excludedSectors||[],excludedStages:e.excludedStages||[],excludedTypes:e.excludedInvestorTypes||[],unacceptableTerms:e.unacceptableTerms||[],
 paid:e.paidKnown===false||!demo&&e.paidKnown!==true?undefined:e.paid,competitor:e.conflictKnown===false||!demo&&e.conflictKnown!==true?undefined:e.competitor,identity:e.verifiedIdentity,authorized:e.authorized,compliance:e.complianceVerified,text:entityText(e)};
}
function profileParty(w:Workspace,role:Role):Party{
 const a=w.profile.answers,m=money(a.ticketAmount||a.amount,a.currency),founder=role==="founder";
 const selectedTypes=["股权融资","战略投资","债务融资"].filter(x=>(a.financingTypes||a.constraints||"").includes(x));
 return {sector:sectors(a.sector),stage:stages(a.stage),region:regions(a.region),currencies:m.currency?[m.currency]:a.currency&&currency(a.currency)?[currency(a.currency)!]:[],range:m.range,
 resources:list(a.resources),needs:RESOURCES.filter(x=>(a.resourceNeeds||a.goals||"").includes(x)),priorities:list(a.priority),types:selectedTypes.length?selectedTypes:!founder&&/VC|CVC|PE|风险投资|产业资本|天使|私募股权/i.test(a.type||"")?["股权融资","战略投资"]:[],investorType:founder?"":a.type||"",roles:list(a.dealRole),terms:a.terms?list(a.terms):undefined,
 required:founder?[]:list(a.constraints),excludedSectors:list(a.excludedSectors),excludedStages:stages(a.excludedStages),excludedTypes:list(a.excludedInvestorTypes),unacceptableTerms:list(a.unacceptableTerms),paid:founder?(a.traction?/付费客户|稳定收入|盈利/.test(a.traction):undefined):undefined,
 competitor:a.competitor?/[是有]/.test(a.competitor):undefined,identity:a.verifiedIdentity==="true"?true:undefined,authorized:a.authorized==="true"?true:undefined,compliance:a.complianceVerified==="true"?true:undefined,text:[w.profile.name,...Object.values(a)].join(" ")};
}
function typeMatches(a:string,b:string){
 const key=(x:string)=>/CVC|产业资本/i.test(x)?"CVC":/PE|私募股权/i.test(x)?"PE":/VC|风险投资/i.test(x)?"VC":/天使/.test(x)?"angel":/家族/.test(x)?"family":x;
 return key(a)===key(b);
}
function constraints(e:Entity,w:Workspace,role:Role,company:Party,fund:Party){
 const blocked:string[]=[],unknown:string[]=[],a=w.profile.answers;
 const requireOverlap=(left:string[],right:string[],failure:string,missing:string,global=false)=>{
  if(left.length&&right.length){if(!(global&&(left.includes("全球")||right.includes("全球")))&&!intersects(left,right))blocked.push(failure)}
  else if(left.length||right.length)unknown.push(missing);
 };
 requireOverlap(company.sector,fund.sector,"行业范围不符","需确认双方行业范围");
 requireOverlap(company.stage,fund.stage,"阶段不符","需确认双方投资/融资阶段");
 requireOverlap(company.region,fund.region,"地域不符","需确认双方地域范围",true);
 if((a.sector&&!sectors(a.sector).length)||(e.sector&&!sectors(e.sector).length&&!e.sectors?.length))unknown.push("自定义行业范围需人工确认");
 if(a.stage&&!stages(a.stage).length)unknown.push("自定义阶段需人工确认");
 if(a.region&&!regions(a.region).length)unknown.push("自定义地域需人工确认");
 const parsed=money(a.ticketAmount||a.amount,a.currency);if(parsed.issue)unknown.push(parsed.issue);
 requireOverlap(company.currencies,fund.currencies,"币种不符（未进行汇率转换）","需确认金额单位或币种");
 if(company.range&&fund.range){if(company.range[1]<fund.range[0]||company.range[0]>fund.range[1])blocked.push(role==="investor"?"投资金额不符":"融资金额不符")}
 else unknown.push("需确认单笔投资与融资金额区间");
 for(const excluded of fund.excludedSectors)if(company.sector.includes(excluded))blocked.push("禁投行业："+excluded);
 for(const excluded of fund.excludedStages)if(company.stage.includes(excluded))blocked.push("禁投阶段："+excluded);
 if(company.excludedTypes.length){if(!fund.investorType)unknown.push("需确认投资者类型");else if(company.excludedTypes.some(t=>typeMatches(t,fund.investorType)))blocked.push("企业排除该投资者类型")}
 requireOverlap(company.types,fund.types,"融资方式不符","需确认融资方式");
 if(company.roles.length&&fund.roles.length&&!company.roles.includes("灵活参与")&&!fund.roles.includes("灵活参与")&&!intersects(company.roles,fund.roles))blocked.push("领投/跟投角色不符");
 const allConstraints=unique([...list(a.constraints),...fund.required,...company.unacceptableTerms.filter(t=>t.startsWith("不接受"))]);
 const supported=["暂无额外限制","股权融资","战略投资","债务融资","需要建议","暂不确定","不接受控制权转移","不接受竞品投资方","不接受排他条款","必须有付费客户","仅限中国","身份已验证","必须身份核验","仅限已授权资料","必须合规验证"];
 for(const condition of allConstraints){
  if(condition==="必须有付费客户"){if(company.paid===false)blocked.push("尚无付费客户");else if(company.paid===undefined)unknown.push("需核实付费客户情况")}
  else if(condition==="仅限中国"){
   const target=role==="founder"&&list(a.constraints).includes(condition)?fund:company;
   if(!target.region.includes("中国")){if(target.region.length)blocked.push("仅限中国");else unknown.push("需确认中国业务范围")}
  }
  else if(condition==="不接受竞品投资方"){if(fund.competitor===true)blocked.push("竞品利益冲突");else if(fund.competitor===undefined)unknown.push("需核实竞品投资与利益冲突")}
  else if(condition==="不接受控制权转移"||condition==="不接受排他条款"){
   const term=condition==="不接受控制权转移"?"控制权转移":"排他";
   if(fund.terms===undefined)unknown.push(term==="控制权转移"?"需核实控制权条款":"需核实排他条款");
   else if(fund.terms.some(t=>t.includes(term)))blocked.push("存在不可接受条款："+term);
  }
  else if(/^不投/.test(condition)){const excluded=condition.slice(2);if(SECTORS.includes(excluded)){if(company.sector.includes(excluded))blocked.push("禁投"+excluded)}else if(stages(excluded).length){if(intersects(company.stage,stages(excluded)))blocked.push("禁投"+excluded)}else unknown.push("自定义限制需人工确认："+condition)}
  else if(/^不接受.*(?:资本|基金|VC|CVC|PE|投资人)$/i.test(condition)){if(!fund.investorType)unknown.push("需确认投资者类型");else if(typeMatches(condition.slice(3),fund.investorType))blocked.push("企业排除该投资者类型")}
  else if(["身份已验证","必须身份核验","仅限已授权资料","必须合规验证"].includes(condition)){
   const candidate=role==="investor"?company:fund;const flag=condition==="仅限已授权资料"?candidate.authorized:condition==="必须合规验证"?candidate.compliance:candidate.identity;
   if(flag===false)blocked.push("未满足："+condition);else if(flag===undefined)unknown.push("需核实："+condition);
  }
  else if(!supported.includes(condition))unknown.push("自定义限制需人工确认："+condition);
 }
 for(const term of company.unacceptableTerms.filter(t=>!t.startsWith("不接受"))){if(fund.terms===undefined)unknown.push("需核实条款："+term);else if(fund.terms.some(t=>t.includes(term)))blocked.push("存在不可接受条款："+term)}
 const labels:Record<string,string>={amount:"金额区间",stage:"投资/融资阶段",region:"地域",currency:"币种",identity:"主体身份",paid:"付费客户",conflict:"利益冲突"};
 if(e.unknownFields?.length)unknown.push(...e.unknownFields.map(f=>"资料待核实："+(labels[f]||f)));
 if(e.source!=="demo"&&e.real!==false&&e.verifiedIdentity!==true)unknown.push("主体身份尚未核验");
 return {blocked:unique(blocked),unknown:unique(unknown)};
}
function fitDimension(key:string,label:string,score:number,weight:number,reason:string):FitDimension{return {key,label,score:Math.round(clamp(score)),weight,reason}}
function overlapFit(a:string[],b:string[],global=false){return a.length&&b.length?global&&(a.includes("全球")||b.includes("全球"))?100:100*a.filter(x=>b.includes(x)).length/a.length:50}
function ticketFit(company:Party,fund:Party){
 if(!company.range||!fund.range)return 50;
 if(company.range[1]<fund.range[0]||company.range[0]>fund.range[1])return 0;
 // A round can accept a partial ticket; no unstated FX conversion or valuation assumption.
 const low=Math.max(company.range[0],fund.range[0]),high=Math.min(company.range[1],fund.range[1]);
 return low===high?90:100;
}
function priorityFit(company:Party,fund:Party){
 if(!fund.priorities.length)return 50;
 return fund.priorities.reduce((sum,p)=>sum+(/付费客户|收入增长|盈利能力/.test(p)?company.paid===true?85:company.paid===false?25:50:60+35*(cosine(conceptVector(p),conceptVector(company.text))>0?1:0)),0)/fund.priorities.length;
}
function directionalFits(company:Party,fund:Party){
 const thesis=overlapFit(company.sector,fund.sector),resource=company.needs.length?100*company.needs.filter(n=>fund.resources.includes(n)).length/company.needs.length:50;
 const roles=company.roles.length&&fund.roles.length?(company.roles.includes("灵活参与")||fund.roles.includes("灵活参与")||intersects(company.roles,fund.roles)?100:0):50;
 const investor=[
  fitDimension("thesis","投资策略与行业",thesis,.35,company.sector.length&&fund.sector.length?"公司业务与基金行业授权交叉验证":"行业授权资料待补充"),
  fitDimension("stage","投资阶段",overlapFit(company.stage,fund.stage),.2,"企业所处阶段与基金覆盖阶段比较"),
  fitDimension("ticket","单笔投资范围",ticketFit(company,fund),.2,"融资可接受区间与基金票面区间比较"),
  fitDimension("priorities","显式投资重点",priorityFit(company,fund),.15,fund.priorities.length?"根据明确投资重点评估自述资料；不等于事实核验":"投资重点待补充"),
  fitDimension("mandate","地域授权",overlapFit(company.region,fund.region,true),.1,"基金地域范围与公司业务范围比较")
 ];
 const founder=[
  fitDimension("resources","企业需要的增值资源",resource,.4,company.needs.length?"逐项比较企业明确需要与资本提供的资源":"企业资源需求待补充"),
  fitDimension("capital","资金需求覆盖",ticketFit(company,fund),.3,"评估可接受投资票面与本轮资金需求的相容性"),
  fitDimension("collaboration","合作与投资角色",roles,.15,"比较领投、跟投及合作方式的明确选择"),
  fitDimension("financing","融资方式",overlapFit(company.types,fund.types),.15,"股权、战略投资或债务类型的相容性")
 ];
 return {investor,founder};
}
function behavioralFeedback(e:Entity,w:Workspace,peers:Entity[]){
 return behaviorAdjustment(e,w,peers);
}
function evidenceSummary(e:Entity){
 const simulated=e.source==="demo"||e.real===false;
 const records:EntityEvidence[]=e.evidenceRecords|| (simulated?[
  {id:e.id+"-bp",name:"策略 / 企业资料（模拟）",date:"2026-09-30",type:"演示资料 · 未独立核实",claim:e.desc,status:"simulated"},
  {id:e.id+"-research",name:"研究访谈纪要（模拟）",date:"2026-10-08",type:"研究假设 · 待核实",claim:e.risk,status:"simulated"}
 ]:[]);
 const weight=(r:EntityEvidence)=>simulated||r.status==="simulated"?15:r.status==="verified"?90:r.status==="public"&&r.url?55:r.status==="self-reported"?30:r.status==="hypothesis"?10:r.url?40:20;
 const evidenceQuality=records.length?Math.round(records.reduce((s,r)=>s+weight(r),0)/records.length):0;
 const dated=records.map(r=>new Date(r.date).getTime()).filter(Number.isFinite),now=Date.now();
 const evidenceFreshness=dated.length?Math.round(dated.reduce((s,date)=>{const days=(now-date)/86400000;return s+(days< -1?0:days<=30?100:days<=90?75:days<=365?40:10)},0)/dated.length):0;
 return {simulated,evidence:records,evidenceQuality,evidenceFreshness,evidenceStatus:simulated?"模拟资料；日期与完整度不代表真实核验":records.length?"来源质量评分；公开或自述材料不等于独立验证":"尚无可追溯证据"};
}

export function evaluateMatch(e:Entity,w:Workspace,role:Role,peers:Entity[]=[]):MatchResult{
 const candidate=entityParty(e),owner=profileParty(w,role);
 const company=role==="investor"?candidate:owner,fund=role==="founder"?candidate:owner;
 const {blocked,unknown}=constraints(e,w,role,company,fund),dimensions=directionalFits(company,fund);
 const feedback=behavioralFeedback(e,w,peers);
 const sum=(d:FitDimension[])=>d.reduce((n,x)=>n+x.score*x.weight,0);
 const preference=w.preference===e.sector&&(!w.preferenceScope||w.preferenceScope===learningScope(e))?2:0;
 // Feedback changes only the viewer's directional fit, is capped, and never alters eligibility.
 const investorFit=Math.round(clamp(sum(dimensions.investor)+(role==="investor"?feedback.adjustment+preference:0)));
 const founderFit=Math.round(clamp(sum(dimensions.founder)+(role==="founder"?feedback.adjustment+preference:0)));
 const pairScore=(investorFit+founderFit)/2;
 const matchedResources=company.needs.filter(n=>fund.resources.includes(n));
 const why=unique([
  matchedResources.length?"可提供企业期望的"+matchedResources.join("、"):"",
  intersects(company.sector,fund.sector)?"双方行业范围覆盖"+company.sector.filter(s=>fund.sector.includes(s)).join("、"):"",
  intersects(company.stage,fund.stage)?"覆盖"+company.stage.filter(s=>fund.stage.includes(s)).join(" / ")+"阶段":"",
  ticketFit(company,fund)>=90&&intersects(company.currencies,fund.currencies)?"金额区间有交集（"+company.currencies.filter(c=>fund.currencies.includes(c)).join(" / ")+"）":""
 ]).slice(0,3);
 const proof=evidenceSummary(e);
 const uncertainties=unique([...unknown,...(!company.needs.length?["企业增值资源需求待补充"]:[]),...(!fund.resources.length?["投资方可提供资源待补充"]:[]),...(!proof.evidence.length?["缺少来源、日期与可核验材料"]:[]),...(proof.simulated?["候选与资料为模拟数据，未经真实核验"]:[]),e.risk]).slice(0,2);
 const riskReasons=unique([e.risk,...blocked.filter(x=>/冲突|条款|身份|合规|授权/.test(x)),...unknown.filter(x=>/冲突|条款|身份|合规|授权/.test(x))]);
 const riskPriority=riskReasons.some(x=>/竞品|冲突|控制权转移|未满足|不可接受/.test(x))?"high":riskReasons.length?"medium":"unknown";
 return {score:pairScore,pairScore,investorFit,founderFit,why:why.length?why:["画像尚不完整，需补充双方偏好"],blocked,unknown,eligible:!blocked.length&&!unknown.length,dimensions,
  feedbackAdjustment:feedback.adjustment,feedbackReasons:feedback.reasons,...proof,riskPriority,riskReasons,uncertainties,
  nextStep:blocked.length?"查看不满足的明确条件，调整真实需求后再评估":unknown.length?"先确认待核实条件，再进入正常推荐":proof.simulated?"演示：查看来源与研究问题，模拟补充资料":"查看关键证据，要求补充未确认资料"};
}

/** Caller owns the seen-ID history. Empty means exhausted; repeat only after an explicit UI reset. */
export function rankCandidates(entities:Entity[],w:Workspace,role:Role,query="",seenIds:string[]=[]):RankedCandidate[]{
 const seen=new Set(seenIds),ids=new Set<string>();
 const pool=entities.flatMap(entity=>{
  if(ids.has(entity.id)||seen.has(entity.id)||Object.prototype.hasOwnProperty.call(w.rejected,entity.id))return [];
  ids.add(entity.id);const match=evaluateMatch(entity,w,role,entities);
  if(!match.eligible)return [];
  const retrieval=hybridRetrieve(entity,query);
  if(query.trim()&&!retrieval.matchedTerms.length&&!retrieval.matchedConcepts.length)return [];
  // Evidence affects ranking slightly and remains separate from the displayed fit scores.
  return [{entity,match,retrieval,rankScore:match.score+.18*retrieval.score+.02*match.evidenceQuality+.01*match.evidenceFreshness,explorationReason:""}];
 });
 const ranked:RankedCandidate[]=[],sectorCounts=new Map<string,number>(),regionCounts=new Map<string,number>();
 while(pool.length){
  const adjusted=(c:RankedCandidate)=>c.rankScore-(sectorCounts.get(c.entity.sector)||0)*4-(regionCounts.get(c.entity.region)||0);
  pool.sort((a,b)=>adjusted(b)-adjusted(a)||b.match.score-a.match.score||a.entity.id.localeCompare(b.entity.id));
  const next=pool.shift()!;const penalty=next.rankScore-adjusted(next);
  next.rankScore=Math.round(adjusted(next)*10)/10;
  if(ranked.length&&!sectorCounts.has(next.entity.sector))next.explorationReason="满足全部硬条件的不同产业方向，增加探索多样性";
  else if(ranked.length&&!regionCounts.has(next.entity.region))next.explorationReason="满足全部硬条件的不同地域，增加探索多样性";
  else if(query&&next.retrieval.matchedConcepts.length&&!next.retrieval.matchedTerms.length)next.explorationReason="通过人工概念词典召回："+next.retrieval.matchedConcepts.join("、");
  else if(penalty)next.explorationReason="同类候选已做轻量去重重排；硬条件保持不变";
  ranked.push(next);sectorCounts.set(next.entity.sector,(sectorCounts.get(next.entity.sector)||0)+1);regionCounts.set(next.entity.region,(regionCounts.get(next.entity.region)||0)+1);
 }
 return ranked;
}
