import {questions,type FieldOrigin,type Role} from "./model";

export type ProfessionalField={key:string;title:string;hint:string;origin:FieldOrigin;multiline?:boolean};
export type ProfileGroup={key:string;title:string;description:string;fields:ProfessionalField[]};
const fact=(key:string,title:string,hint:string,multiline=true):ProfessionalField=>({key,title,hint,origin:"self_reported",multiline});
const intent=(key:string,title:string,hint:string,multiline=true):ProfessionalField=>({key,title,hint,origin:"declared",multiline});

export const professionalProfileGroups:Record<Role,ProfileGroup[]>={
  founder:[
    {key:"company",title:"企业主体与创始团队",description:"把企业、创始人和产品连接起来，便于资本开展研究。",fields:[
      fact("companyLegalName","企业法定名称与注册信息","法定名称、注册地、统一社会信用代码或当地登记编号"),
      fact("companyWebsite","企业官网","https://…",false),
      fact("foundingTeam","创始团队与关键岗位","姓名、职责、相关经历、全职状态；避免填写无关个人资料"),
      fact("productDescription","产品与目标客户","解决的问题、产品形态、目标市场与定价模式"),
      fact("competitiveAdvantage","竞争优势与知识产权","对比哪些方案；技术、数据、渠道或成本优势及知识产权归属"),
    ]},
    {key:"business",title:"客户、经营与财务",description:"写清统计期间、币种和指标口径；自述数据仍需后续核查。",fields:[
      fact("customerMetrics","客户与商业化指标","截至日期、付费客户数、试点数、留存或续费率；可匿名描述客户"),
      fact("revenue","收入与 ARR 口径","报告期间、币种、确认收入、ARR、回款分别列明，避免混用"),
      fact("cash","可用现金","截至日期、币种、金额；是否含受限资金",false),
      fact("burn","月度净现金消耗","期间、币种、现金流入和流出；说明异常开支",false),
      fact("financialStatementsReference","财务材料索引","在资料库上传财报后填写文件名、期间和页码；这里不会自动共享文件"),
    ]},
    {key:"financing",title:"融资记录与本轮计划",description:"明确已有资本关系、本轮预期和资金用途，后续可用专业工具测算。",fields:[
      fact("financingHistory","历史融资轮次","每轮日期、轮次、金额、币种、融资工具和当时估值"),
      fact("historicalInvestors","历史投资方","机构名称、对应轮次、持股或战略关系；未获授权的信息可省略"),
      fact("capTableReference","股权结构与 Cap Table 索引","股东、完全稀释持股、期权池、可转债 / SAFE；附资料文件名或页码"),
      intent("valuationExpectation","本轮估值预期","投前或投后、币种和区间；说明测算依据",false),
      intent("fundingUsePlan","资金用途与里程碑","各项预算、预计支撑月数、目标里程碑和验收标准"),
      intent("financingTerms","融资条款边界","工具偏好、董事会与控制权、清算优先、排他性及可接受条件"),
    ]},
    {key:"materials",title:"融资叙事与材料准备",description:"把 BP 的核心内容和资料索引整理为 Agent 可使用的背景。",fields:[
      fact("bpNarrative","BP 核心叙事","问题、解决方案、市场、商业模式、增长证据和融资诉求"),
      fact("bpReference","BP 版本与文件索引","文件名、版本日期、语言、需要重点核查的页码",false),
      fact("materialReadiness","尽调材料准备情况","财务、股权、知识产权、重要合同、合规材料：已有 / 待补 / 负责人"),
    ]},
  ],
  investor:[
    {key:"institution",title:"管理主体与投资授权",description:"机构正式授权与个人研究兴趣分开记录，个人行为不会改写基金限制。",fields:[
      fact("fundManager","基金管理主体","管理人法定名称、注册地、登记信息及官网"),
      fact("fundVehicle","基金与投资载体","基金名称、币种、存续期和投资期；不要从公开规模推断剩余可投金额"),
      fact("representativeAuthority","代表身份与授权范围","职位、可执行研究 / 沟通 / 决策的范围，以及授权材料索引"),
      intent("investmentMandate","基金正式投资授权","正式允许的行业、地域、阶段、集中度、金额上限和禁止事项"),
      intent("personalResearchInterests","个人研究兴趣","仅用于理解研究需求，不替代基金正式授权"),
    ]},
    {key:"strategy",title:"投资策略与资金安排",description:"补充正式策略细节；与基础画像有差异时，应先明确基础筛选条件。",fields:[
      intent("investmentStrategy","投资策略与判断框架","收益与风险目标、持有期限、核心判断依据和退出方式"),
      intent("ticketPolicy","票面金额与追加投资策略","首轮 / 追加票面、币种、持股目标、预留与联合投资政策"),
      intent("sectorMandate","行业范围与排除项","重点子行业、正式禁投范围和例外审批条件"),
      intent("geographicMandate","地域与跨境边界","注册地 / 运营地要求、可投资法域、跨境限制"),
      intent("leadPolicy","领投与治理参与方式","是否领投、董事会席位、投后参与深度和共同投资条件"),
    ]},
    {key:"trackRecord",title:"投资历史与战略资源",description:"从实际项目与资源描述中形成可核查的资本画像。",fields:[
      fact("portfolioHistory","历史投资项目","项目、轮次、日期、角色与公开来源；注明已退出或仍持有"),
      fact("strategicResources","可提供的战略资源","客户、渠道、供应链、团队支持、国际化经验；说明适用范围"),
      fact("portfolioConflicts","潜在竞品与利益冲突","相关已投企业、关联方和利益冲突；需要哪些信息隔离措施"),
    ]},
    {key:"process",title:"决策流程与合作边界",description:"帮助融资方理解真实推进路径和需要准备的材料。",fields:[
      intent("decisionProcess","决策流程与审批权限","初筛、合伙人会议、投委会、审批人、材料要求与预期周期"),
      intent("diligenceRequirements","尽调重点与材料清单","技术、财务、法律、团队和客户验证要求"),
      intent("investmentTerms","条款与合作偏好","控制权、退出、清算、信息权及需要额外审批的特殊条款"),
      fact("fundDocumentsReference","基金策略与授权材料索引","资料库文件名、版本日期、页码和授权范围；默认私有"),
    ]},
  ],
};

export const originLabels:Record<FieldOrigin,string>={declared:"用户声明",self_reported:"自述 · 待核实",inferred:"AI 推断 · 待确认",verified:"人工核验 · 用户确认"};
export function profileFieldLabel(role:Role,key:string){return key==="name"?"机构 / 企业名称":questions[role].find(f=>f.key===key)?.title||professionalProfileGroups[role].flatMap(g=>g.fields).find(f=>f.key===key)?.title||key;}
export function profileFieldOrigin(key:string):FieldOrigin{
  const field=Object.values(professionalProfileGroups).flatMap(groups=>groups.flatMap(g=>g.fields)).find(f=>f.key===key);
  return field?.origin||(["traction","revenue","customers","cash","burn"].includes(key)?"self_reported":"declared");
}
export function profileFieldKeys(role:Role){return new Set(["name",...questions[role].map(q=>q.key),...professionalProfileGroups[role].flatMap(g=>g.fields.map(f=>f.key))]);}
