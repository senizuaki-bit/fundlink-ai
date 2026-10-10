import type {CapitalSearch} from "./capital";
import {hasLearningConsent} from "./learning";
export type Role = "investor" | "founder";
export type FieldOrigin = "declared"|"self_reported"|"inferred"|"verified";
export type ProfileSource = {origin:FieldOrigin;time:string;quote?:string;reference?:string;reviewNote?:string;reviewedBy?:string};
export type ProfileRevision = {id:string;key:string;before:string;after:string;origin:FieldOrigin;time:string;quote?:string;reference?:string;reviewNote?:string;reviewedBy?:string};
export type Profile = {name:string;answers:Record<string,string>;completed:boolean;provenance?:Record<string,ProfileSource>;history?:ProfileRevision[]};
export type Event = {id:string;title:string;detail:string;time:string};
export type Deal = {id:string;entityId:string;entitySnapshot?:import("./catalog").Entity;stage:string;notes:string;draft:string;tasks:{text:string;done:boolean;owner?:string;dueDate?:string}[];mutual:boolean;owner?:string;dueDate?:string;closeReason?:string;history?:{time:string;from:string;to:string;note:string}[];approvals?:{time:string;action:string;preview:string;mode:"simulation"}[]};
export type BehaviorSignal={id:string;entityId:string;kind:"exposure"|"view"|"search"|"batch"|"save"|"research"|"interest"|"contact"|"mutual"|"reply"|"meeting"|"diligence"|"terms"|"decision"|"closed"|"reject"|"risk_review";time:string;detail?:string;mode?:"real"|"simulation";feedbackId?:string;outcome?:BusinessFeedback["stage"]};
export type BusinessFeedback={id:string;entityId:string;stage:"positive_reply"|"meeting"|"diligence"|"terms"|"won"|"lost";occurredAt:string;note:string;reference:string;recordedAt:string;updatedAt:string};
export type AgentTrace={tool:string;label:string;status:"completed"|"skipped"|"failed";detail:string;sourceIds?:string[]};
export type ProfileProposal={key:string;value:string;reason:string};
export type AgentMessage={role:string;content:string;entityId?:string;trace?:AgentTrace[];citations?:{id:string;title:string;url?:string;time?:string}[];proposals?:ProfileProposal[];mode?:string;memory?:{messageCount:number;scope:string;omitted?:boolean;reason?:string}};
export type LegacyLead={id:string;name:string;description:string;url:string;metric:string;updated:string|null;collected:string;source:string;claimed?:boolean;entityId?:string;sourceId?:string};
export type LegacyScan={id:string;source:string;query:string;time:string;items:LegacyLead[];changes?:{id:string;name:string;text:string}[]};
export type Workspace = {profile:Profile;saved:string[];watched:string[];rejected:Record<string,string>;interested:string[];risks:Record<string,string>;deals:Deal[];events:Event[];messages:AgentMessage[];settings:{research:boolean;drafts:boolean;learning:boolean;learningConsent?:{version:1;grantedAt:string;revokedAt?:string};learningRequest?:"grant"|"revoke"|"clear";name:string;goals:string;publicSearch?:boolean;knowledge?:boolean;financial?:boolean};preference:string;previousPreference:string;ignoredSuggestion?:string;preferenceScope?:"demo"|"real";previousPreferenceScope?:"demo"|"real";ignoredSuggestionScope?:"demo"|"real";businessFeedback?:BusinessFeedback[];scans:LegacyScan[];capitalSearches?:CapitalSearch[];signals?:BehaviorSignal[];seen?:string[];version:number};
export const blankWorkspace = ():Workspace=>({profile:{name:"",answers:{},completed:false},saved:[],watched:[],rejected:{},interested:[],risks:{},deals:[],events:[],messages:[],settings:{research:true,drafts:true,learning:false,name:"Link",goals:"发现机会、核实证据、准备沟通"},preference:"",previousPreference:"",scans:[],capitalSearches:[],version:0});
export function normalizeWorkspace(value:Partial<Workspace>):Workspace{const b=blankWorkspace();return {...b,...value,profile:{...b.profile,...value.profile},settings:{...b.settings,publicSearch:true,knowledge:true,financial:true,...value.settings,learning:hasLearningConsent(value)},signals:value.signals||[],seen:value.seen||[]};}
export function addSignal(w:Workspace,entityId:string,kind:BehaviorSignal["kind"],detail?:string,options:Pick<BehaviorSignal,"mode"|"feedbackId">={}):Workspace{return hasLearningConsent(w)?{...w,signals:[{id:crypto.randomUUID(),entityId,kind,time:new Date().toISOString(),detail,...options},...(w.signals||[])].slice(0,500)}:w;}
export const questions:Record<Role,{key:string;title:string;hint:string;options:string[]}[]> = {
investor:[
{key:"type",title:"你代表哪一类投资主体？",hint:"我们会据此调整项目筛选与研究角度。",options:["风险投资 VC","产业资本 CVC","天使投资人","私募股权 PE","家族办公室","个人研究者"]},
{key:"objective",title:"你希望投资实现什么目标？",hint:"可以选择多个方向。",options:["财务回报","产业协同","战略布局","探索新技术"]},
{key:"sector",title:"哪些行业最让你感兴趣？",hint:"偏好用于推荐，正式投资限制会单独确认。",options:["人工智能","机器人","企业服务","新能源","医疗科技","半导体"]},
{key:"stage",title:"你更关注哪个成长阶段？",hint:"阶段偏好会作为推荐的明确筛选条件。",options:["种子轮","天使轮","Pre-A 轮","A 轮","B 轮","成长期"]},
{key:"amount",title:"单笔计划投资多少？",hint:"默认人民币万元，也可输入区间与币种。",options:["100–500 万元","500–1,000 万元","1,000–3,000 万元","3,000–5,000 万元","5,000 万元以上"]},
{key:"region",title:"你关注哪些地区的项目？",hint:"地域要求将用于推荐筛选。",options:["中国","东南亚","美国","全球"]},
{key:"priority",title:"评估一家企业时，你最看重什么？",hint:"研究报告将围绕你关心的维度展开。",options:["技术壁垒","创始团队","付费客户","收入增长","盈利能力","产业协同"]},
{key:"dealRole",title:"你通常如何参与一笔投资？",hint:"让双方对合作方式有一致预期。",options:["领投","跟投","战略合作","灵活参与"]},
{key:"constraints",title:"有什么不可突破的投资条件？",hint:"这类约束不会因为浏览或收藏行为而被改写。",options:["必须有付费客户","仅限中国","不投医疗科技","不投种子轮","暂无额外限制"]},
{key:"goals",title:"希望专属 Agent 优先做什么？",hint:"研究与起草可自动进行，对外沟通始终由你确认。",options:["寻找项目","深度研究","风险核查","动态监测","尽调准备","沟通草稿"]}],
founder:[
{key:"type",title:"你正在代表怎样的创业主体？",hint:"早期团队也可以从这里开始。",options:["已注册企业","创业团队","科研成果转化"]},
{key:"sector",title:"你的产品主要解决什么问题？",hint:"选择行业，或直接描述你的业务与客户。",options:["人工智能","机器人","企业服务","新能源","医疗科技","半导体"]},
{key:"stage",title:"企业目前处于什么阶段？",hint:"阶段帮助我们找到真正适配的资本。",options:["种子轮 · 产品原型","天使轮 · 试点验证","Pre-A 轮 · 已上线","A 轮 · 规模增长","B 轮 · 成熟扩张"]},
{key:"traction",title:"目前的商业化进展如何？",hint:"这些信息标记为自述，后续可补充证据。",options:["尚未收费","正在试点","已有付费客户","稳定收入","实现盈利"]},
{key:"amount",title:"这一轮希望融资多少？",hint:"可稍后通过资金计划工具验证融资需求。",options:["500 万元","1,000 万元","3,000 万元","5,000 万元","帮我估算"]},
{key:"region",title:"业务和融资主要面向哪里？",hint:"经营地域和资本地域可在画像中进一步补充。",options:["中国","东南亚","美国","全球"]},
{key:"use",title:"新资金将优先投入哪里？",hint:"这会成为融资沟通的重要依据。",options:["产品研发","团队招聘","市场拓展","生产与供应链","营运周转"]},
{key:"horizon",title:"希望多久内完成本轮融资？",hint:"据此安排你的融资行动计划。",options:["3 个月内","6 个月内","12 个月内","暂不紧急"]},
{key:"constraints",title:"偏好什么融资方式与边界？",hint:"控制权、排他等条款需后续单独核实。",options:["股权融资","战略投资","债务融资","不接受控制权转移","不接受竞品投资方","需要建议"]},
{key:"goals",title:"除了资金，希望资本带来什么？",hint:"融资方需求与投资方偏好同样重要。",options:["产业客户","销售渠道","供应链资源","技术支持","长期陪伴","国际化经验"]}]
};


