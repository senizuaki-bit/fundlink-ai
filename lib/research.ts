import {catalog,entityById,evidence,matchEntity} from "./catalog";
import type {Workspace,Role} from "./model";
export function researchAnswer(prompt:string,entityId:string|undefined,w:Workspace,role:Role){
const lead=role==="investor"?w.scans.flatMap(s=>s.items).find(x=>x.id===entityId):undefined;if(lead)return "公开线索研究 · 规则整理\n\n主体："+lead.name+"\n状态：未认领公开项目，尚未确认公司关联与融资意愿。\n\n已知公开事实\n"+lead.description+"\n活跃度指标："+lead.metric+"\n来源："+lead.url+"\n公开更新时间："+lead.updated+"\n采集时间："+lead.collected+"\n\n分析假设\n技术活跃度可作为进一步研究的起点，不代表收入、商业化成熟度或投资价值。\n\n下一步核实\n1. 对照维护组织、项目官网和法人主体，确认关联关系。\n2. 寻找产品定价、客户案例和许可条款。\n3. 通过公开、自愿渠道核实合作与融资意愿。\n4. 未经认领与授权，不以该项目名义发信或分享资料。\n\n研究任务："+prompt;
const e=catalog(role).find(e=>e.id===entityId)||entityById(role==="investor"?"industrialmind":"horizon")!;
const sources=evidence(e).map((x,i)=>"["+ (i+1)+"] "+x.name+" · "+x.date+" · "+x.type).join("\n");
const m=matchEntity(e,w,role);const intro="演示研究 · 基于结构化案例与规则生成\n研究对象："+e.name+"（虚构案例）\n\n";
if(/邮件|草稿|联系|沟通/.test(prompt))return intro+"主题：关于"+e.sector+"方向的合作交流\n\n"+e.name+"团队，你们好：\n\n我是"+(w.profile.name||"FundLink 用户")+"。"+(role==="investor"?"我们正在关注"+(w.profile.answers.sector||e.sector)+"领域，特别重视"+(w.profile.answers.priority||"技术能力和商业化进展")+"。":"我们正在准备"+(w.profile.answers.amount||"新一轮")+"融资，希望获得"+(w.profile.answers.goals||"产业与技术")+"资源支持。")+"\n\n我们了解到你们的方向是："+e.desc+"希望进一步了解"+(role==="investor"?"当前业务里程碑、收入口径和本轮融资计划":"当前投资策略、单笔额度和决策流程")+"。如果合适，期待安排一次 30 分钟交流。\n\n目前仅讨论公开或授权资料，敏感信息将在双方确认后单独共享。\n\n"+(w.profile.name||"FundLink 用户")+"\n\n草稿尚未发送；请在交易工作台编辑并确认。";
if(/BP|商业计划|材料/.test(prompt))return intro+"融资材料诊断\n\n1. 问题与产品：说明目标客户、现有替代方案与可量化优势。\n2. 商业化证据：补充付费合同、回款记录、续约与客户集中度。\n3. 财务口径：分开列示 ARR、期间确认收入和现金回款。\n4. 融资计划：逐项列明资金用途、未来 18 个月现金消耗与里程碑。\n5. 股权与团队：补充完整 Cap Table、核心团队分工及 IP 归属。\n\n这是一份基于画像的材料缺口清单，尚未自动读取上传的二进制文档。可将关键文本粘贴到对话中进一步整理。";
if(role==="founder"&&/计划|下一步|尽调/.test(prompt))return intro+"资本接洽核查计划\n\n□ 核对基金法人、管理人及联系人授权。\n□ 确认当前投资行业、轮次、地域与单家出资范围。\n□ 直接确认可投额度、决策流程、投委会节奏和时间表。\n□ 核实近期投资记录的原始来源、日期及竞品利益冲突。\n□ 明确产业资源的提供方式与兑现条件。\n□ 评估控制权、排他、清算优先权等条款。\n□ 准备针对该机构的融资材料与首次交流议程。\n\n优先待核实："+e.risk+"。\n尚未接入真实近期投资动态，不能据示例资料推断资金可用。\n\n来源\n"+sources;
if(/计划|下一步|尽调/.test(prompt))return intro+"下一步行动计划\n\n□ 核对主体：公司/基金法人、代表权限及真实合作意愿。\n□ 核实商业化：至少访谈 2 位付费客户，抽查合同与回款。\n□ 财务对齐：按相同期间、币种和主体重建指标表。\n□ 技术与 IP：核查开源依赖、许可和核心知识产权归属。\n□ 资本与条款：核实可投额度、竞品冲突、控制权及决策时间表。\n□ 交流准备：整理 30 分钟会议议程和需对方补充的文件。\n\n优先待核实："+e.risk+"。\n\n来源\n"+sources;
return intro+"01 / 匹配判断\n"+m.why.join("；")+"。"+(m.blocked.length?"当前限制："+m.blocked.join("、")+"。":"双方条件具备进一步研究的基础。")+"排序参考 "+m.score+"，不代表成交概率。\n\n02 / 已有信息\n"+e.desc+"\n"+e.metric+"："+e.metricValue+" [1][2]。所有案例信息为模拟自述，尚未独立验证。\n\n03 / 跨源核查\n"+(e.id==="industrialmind"?"BP 口径为 2026 年 9 月 ARR 1,200 万元；财务摘要为 2025 全年确认收入 400 万元。时点年化收入和期间会计收入不可直接比较，差异不证明财务造假。可能原因包括新合同集中生效、非经常性项目计入 ARR 或确认政策不同。应索取合同生效日、订阅明细、收入确认政策与回款流水。":"待核实项："+e.risk+"。目前资料不足以形成确定结论，应直接向主体核对，并取得独立证据。")+"\n\n04 / 下一步\n安排初步交流；核实主体与意愿；取得授权后补齐关键资料。\n\n来源\n"+sources+"\n\n分析假设与自述事实分离，最终判断由你作出。";
}


