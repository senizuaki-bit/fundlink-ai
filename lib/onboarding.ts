import {questions} from "./model";
import type {Role} from "./model";
export const uncertainAnswer = /暂不确定|不确定|不知道|不了解|没想好|帮我估算|需要建议|尚未确定/;
// Candidates only: callers must request confirmation before saving extracted fields.
export function extractDeclared(text:string,role:Role):Record<string,string>{
const out:Record<string,string>={};
for(const key of ["type","objective","sector","stage","region","priority","dealRole","use","horizon","goals","traction"]){
const options=questions[role].find(q=>q.key===key)?.options||[];
const found=options.filter(option=>{
const needle=(key==="stage"?option.split(" · ")[0]:option).replaceAll(" ","").toLowerCase();
const source=text.replaceAll(" ","").toLowerCase(),start=source.indexOf(needle);
if(start<0)return false;
const before=source.slice(Math.max(0,start-12),start);
return !/(?:不投|不做|不关注|不考虑|排除|不要|非|没有|尚无|未有|不在|不是)[^，。；、\n]{0,8}$/.test(before)
&& !(key==="stage"&&needle==="a轮"&&before.endsWith("pre-"));
});if(found.length)out[key]=found.join("、")}
const amount=text.match(/(?:融资|投资|预算|金额)\s*(?:人民币)?\s*([\d,.]+\s*(?:亿|万|元)(?:\s*(?:至|到|–|-)\s*[\d,.]+\s*(?:亿|万|元))?)/);
if(amount&&!uncertainAnswer.test(text))out.amount=amount[1];return out;
}

export function nextUnanswered(role:Role,answers:Record<string,string>,after=0){
const list=questions[role];
const order=[...list.map((_,i)=>i).slice(after),...list.map((_,i)=>i).slice(0,after)];
return order.find(i=>!answers[list[i].key]?.trim())??list.length;
}
export type InterviewFollowUp={question:string;explanation:string;options:string[]};
export function interviewFollowUp(role:Role,key:string,text:string):InterviewFollowUp|null{
if(role==="founder"&&key==="amount"&&uncertainAnswer.test(text))return {
question:"先把金额记为待测算，还是补充资金计划？",
explanation:"融资额需要结合现金储备、月度净消耗、目标运营月数和下一阶段里程碑。口头目标金额会保留为自述，不能据此判断需求合理。可在工作台继续做资金需求诊断。",
options:["金额待测算，稍后补充资金计划","按当前意向金额记录，尚未验证合理性"]};
if(role==="investor"&&key==="sector"&&uncertainAnswer.test(text))return {
question:"先探索一个方向：你更关注哪一类机会？",
explanation:"这只记录你确认的探索方向，不会自动变成正式行业策略或硬性投资限制。",
options:["探索偏好：技术突破","探索偏好：商业化确定性","探索偏好：增长空间"]};
if(key==="amount"&&/\d/.test(text)&&!/[元币]|人民币|美元|港元|港币|CNY|RMB|USD|HKD|EUR|SGD|MYR|RM\s?\d/i.test(text))return {
question:"这个金额使用什么币种？",explanation:"金额与币种一同确认，才能准确筛选。没有确认币种前会保留原文，不自动折算。",
options:["币种：人民币","币种：美元","币种：港元"]};
return null;
}
export function onboardingConcept(role:Role,key:string){
const shared:Record<string,string>={
stage:"种子与天使阶段通常处于产品或市场验证期；Pre-A、A、B 是融资轮次名称，并不保证对应同样的收入规模。请以真实业务进度为准，未知可跳过。",
amount:role==="founder"?"融资需求可先从资金用途、现有现金、月度净消耗与目标里程碑梳理；意向金额不是已验证的合理融资额。":"单笔金额指一笔交易计划投入的资金，与整个基金规模不同。可以填写区间和币种，未知时无需猜测。",
constraints:role==="founder"?"股权融资通常涉及股份和股东权利；债务融资涉及还本付息安排。控制权、竞业及排他要求可先明确记录，具体条款需在交易阶段核实。":"硬性限制用于排除不满足条件的项目，优先于兴趣偏好。正式授权、审批权限和资格核验需要另行确认。",
type:role==="investor"?"VC 关注创业企业成长；PE 通常关注更成熟的企业；CVC 是企业开展的战略投资。主体类型只是研究角度，不代表已经验证投资资格。":"尚未注册公司也可以建档。企业、创业团队和科研成果转化项目将需要不同的后续材料。",
dealRole:"领投方通常参与定价、条款协调和交易推进；跟投方通常按协商的共同条款参与。具体权责取决于交易约定。",
traction:"付费客户、试点和稳定收入是不同的商业化信号。这里记录你的自述，后续可补充合同、回款和时间口径作为依据。",
region:"经营地域、项目注册地和资本可投资地域可能不同，可以在回答中分别说明；系统会保留你的原文。"};
return shared[key]||"你可以使用自己的话回答，同时说明行业、客户、阶段或目标。Agent 整理出的其他维度会先展示原文依据，只有你确认后才进入画像。";
}


