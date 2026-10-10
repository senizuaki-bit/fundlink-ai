import assert from 'node:assert/strict';
import {companies,funds,matchEntity,rankCandidates,sampleProfile} from '../lib/catalog.ts';
import {evaluateMatch,hybridRetrieve} from '../lib/matching.ts';
import {blankWorkspace} from '../lib/model.ts';

let checks=0;
const check=(name,fn)=>{fn();checks++;console.log('PASS:',name)};
const workspace=role=>({...blankWorkspace(),profile:sampleProfile(role)});
const answers=(w,patch)=>({...w,profile:{...w.profile,answers:{...w.profile.answers,...patch}}});
const authorized=(w,signals=[])=>({...w,settings:{...w.settings,learning:true,learningConsent:{version:1,grantedAt:new Date(Date.now()-86400000).toISOString()}},signals});
const behavior=(entityId,kind)=>({id:entityId+kind,entityId,kind,time:new Date().toISOString()});
const founder=workspace('founder'),investor=workspace('investor');
const horizon=funds.find(e=>e.id==='horizon'),industrial=companies[0];

check('directional fits are independently sensitive to company resource needs',()=>{
 const rich=matchEntity({...horizon,resources:['产业客户','技术支持']},founder,'founder');
 const poor=matchEntity({...horizon,resources:[]},founder,'founder');
 assert.equal(rich.investorFit,poor.investorFit);assert.ok(rich.founderFit>poor.founderFit);
 assert.equal(rich.score,.5*rich.investorFit+.5*rich.founderFit);
});
check('investment stage changes investor fit independently from founder resources',()=>{
 const a=matchEntity(horizon,founder,'founder');
 const b=matchEntity({...horizon,stages:['B 轮']},founder,'founder');
 assert.ok(a.investorFit>b.investorFit);assert.equal(a.founderFit,b.founderFit);assert.equal(b.eligible,false);
});
check('investor and founder sector mandates both filter before ranking',()=>{
 assert.equal(rankCandidates([funds.find(e=>e.id==='vita')],founder,'founder').length,0);
 assert.equal(rankCandidates([companies.find(e=>e.id==='neuralcare')],investor,'investor').length,0);
 assert.ok(rankCandidates(companies,investor,'investor').length>0);
 assert.ok(rankCandidates(funds,founder,'founder').length>0);
});
check('Pre-A does not accidentally satisfy A-round-only mandates',()=>{
 const w=answers(investor,{stage:'A 轮',constraints:'暂无额外限制'});
 assert.ok(matchEntity(companies.find(e=>e.id==='kinetic'),w,'investor').blocked.includes('阶段不符'));
});
check('currency mismatch is filtered without invented exchange rates',()=>{
 const result=matchEntity(horizon,answers(founder,{amount:'3,000 万美元'}),'founder');
 assert.ok(result.blocked.some(x=>x.includes('币种不符')));
 assert.equal(result.eligible,false);
});
check('same foreign currency can match numeric ticket ranges',()=>{
 const w=answers(founder,{amount:'USD 30m'});
 assert.equal(matchEntity({...horizon,currency:'USD'},w,'founder').eligible,true);
});
check('conflicting currency descriptions stay unknown',()=>{
 assert.ok(matchEntity(horizon,answers(founder,{amount:'USD 30m',currency:'CNY'}),'founder').unknown.length);
 assert.ok(matchEntity(horizon,answers(founder,{amount:'3000 万 USD / CNY'}),'founder').unknown.length);
});
check('ticket and regional constraints are hard filters',()=>{
 assert.ok(matchEntity({...horizon,min:4000,max:5000},founder,'founder').blocked.includes('融资金额不符'));
 assert.ok(matchEntity({...horizon,region:'美国'},founder,'founder').blocked.includes('地域不符'));
 assert.equal(matchEntity({...horizon,region:'全球'},founder,'founder').eligible,true);
});
check('explicit industry exclusions override interest and advanced deal signals',()=>{
 const w=answers(investor,{constraints:'不投人工智能'});
 w.interested=[industrial.id];w.saved=[industrial.id];w.deals=[{id:'d',entityId:industrial.id,stage:'条款磋商',notes:'',draft:'',tasks:[],mutual:true}];
 assert.equal(rankCandidates(companies,w,'investor').some(x=>x.entity.id===industrial.id),false);
});
check('paid customer requirement handles false and unknown distinctly',()=>{
 assert.ok(matchEntity({...industrial,paid:false},investor,'investor').blocked.includes('尚无付费客户'));
 const m=matchEntity({...industrial,paidKnown:false},investor,'investor');
 assert.ok(m.unknown.includes('需核实付费客户情况'));assert.equal(m.eligible,false);
});
check('company exclusions and conflicts apply to investor types and portfolios',()=>{
 const excluded=answers(founder,{excludedInvestorTypes:'CVC'});
 assert.ok(matchEntity(horizon,excluded,'founder').blocked.includes('企业排除该投资者类型'));
 const conflicts=answers(founder,{constraints:'股权融资、不接受竞品投资方'});
 assert.ok(matchEntity({...horizon,competitor:true},conflicts,'founder').blocked.includes('竞品利益冲突'));
 assert.ok(matchEntity({...horizon,conflictKnown:false},conflicts,'founder').unknown.includes('需核实竞品投资与利益冲突'));
});
check('non-negotiable terms filter known violations and hold unconfirmed terms',()=>{
 const w=answers(founder,{constraints:'股权融资、不接受控制权转移'});
 assert.ok(matchEntity(horizon,w,'founder').unknown.includes('需核实控制权条款'));
 assert.equal(matchEntity({...horizon,terms:['控制权转移']},w,'founder').eligible,false);
 assert.equal(matchEntity({...horizon,terms:[]},w,'founder').eligible,true);
 const generic=answers(founder,{unacceptableTerms:'回购义务'});
 assert.equal(matchEntity({...horizon,terms:[]},generic,'founder').eligible,true);
 assert.equal(matchEntity({...horizon,terms:['回购义务']},generic,'founder').eligible,false);
});
check('financing structure and role incompatibility are explicit',()=>{
 assert.ok(matchEntity(horizon,answers(founder,{constraints:'债务融资'}),'founder').blocked.includes('融资方式不符'));
 const w=answers(founder,{dealRole:'领投'});
 assert.ok(matchEntity({...horizon,dealRoles:['跟投']},w,'founder').blocked.includes('领投/跟投角色不符'));
});
check('required identity, authority and compliance are evaluated without assumptions',()=>{
 for(const [condition,key] of [['必须身份核验','verifiedIdentity'],['仅限已授权资料','authorized'],['必须合规验证','complianceVerified']]){
  const w=answers(founder,{constraints:'股权融资、'+condition});
  assert.equal(matchEntity(horizon,w,'founder').eligible,false);
  assert.equal(matchEntity({...horizon,[key]:false},w,'founder').blocked.length,1);
  assert.equal(matchEntity({...horizon,[key]:true},w,'founder').eligible,true);
 }
});
check('unsupported bespoke limits are held for clarification',()=>{
 const w=answers(founder,{constraints:'股权融资、需要本地董事'});
 assert.ok(matchEntity(horizon,w,'founder').unknown.some(x=>x.includes('需要本地董事')));
 assert.equal(rankCandidates([horizon],w,'founder').length,0);
});
check('missing currency and ticket information on real candidates is not fabricated',()=>{
 const real={...horizon,source:'public',real:true,currency:undefined,min:0,max:0};
 const m=matchEntity(real,founder,'founder');
 assert.equal(m.eligible,false);assert.ok(m.unknown.some(x=>x.includes('币种')));assert.ok(m.unknown.some(x=>x.includes('金额区间')));
 assert.equal(m.evidence.length,0);
});
check('evidence and risk are independent of directional fit',()=>{
 const plain=matchEntity(horizon,founder,'founder');
 const verified=matchEntity({...horizon,source:'public',real:true,risk:'存在待复核利益冲突',evidenceRecords:[{id:'v',name:'验证记录',date:new Date().toISOString(),type:'人工核验',claim:'已逐项核验',url:'https://example.org/source',status:'verified'}]},founder,'founder');
 assert.equal(plain.score,verified.score);assert.equal(plain.investorFit,verified.investorFit);assert.equal(plain.founderFit,verified.founderFit);
 assert.ok(verified.evidenceQuality>plain.evidenceQuality);assert.equal(verified.riskPriority,'high');assert.match(plain.evidenceStatus,/模拟/);
});
check('older evidence affects freshness without pretending to change trust or fit',()=>{
 const record={id:'v',name:'公开信息',date:new Date().toISOString(),type:'公开',claim:'公开信息',url:'https://example.org/source',status:'public'};
 const fresh=matchEntity({...horizon,source:'public',real:true,evidenceRecords:[record]},founder,'founder');
 const old=matchEntity({...horizon,source:'public',real:true,evidenceRecords:[{...record,date:'2020-01-01'}]},founder,'founder');
 assert.equal(fresh.score,old.score);assert.equal(fresh.evidenceQuality,old.evidenceQuality);assert.ok(fresh.evidenceFreshness>old.evidenceFreshness);
});
check('semantic expansion retrieves related concepts without claiming trained embeddings',()=>{
 const result=hybridRetrieve(companies.find(e=>e.id==='voltloop'),'clean climate battery');
 assert.ok(result.semantic>0);assert.ok(result.matchedConcepts.includes('能源环保'));assert.match(result.method,/非训练式/);
 const w=answers(investor,{sector:'新能源',stage:'B 轮',amount:'1000–8000 万元',constraints:'暂无额外限制'});
 assert.equal(rankCandidates(companies,w,'investor','climate')[0].entity.id,'voltloop');
 assert.equal(rankCandidates(companies,w,'investor','purple elephant origami').length,0);
});
check('hybrid retrieval applies only after hard eligibility checks',()=>{
 assert.equal(rankCandidates([companies.find(e=>e.id==='voltloop')],investor,'investor','新能源 energy').length,0);
});
check('authorized feedback remains bounded and disabled learning is inert',()=>{
 const boosted=authorized({...investor,saved:[industrial.id],watched:[industrial.id],interested:[industrial.id]},[behavior(industrial.id,'save'),behavior(industrial.id,'interest'),behavior(industrial.id,'diligence')]);
 const base=matchEntity(industrial,investor,'investor'),learned=matchEntity(industrial,boosted,'investor');
 assert.ok(learned.score>base.score);assert.ok(learned.feedbackAdjustment<=6);assert.ok(learned.score-base.score<=3);
 const off={...boosted,settings:{...boosted.settings,learning:false}};
 const unchanged={...investor,settings:{...investor.settings,learning:false}};
 assert.equal(matchEntity(industrial,off,'investor').score,matchEntity(industrial,unchanged,'investor').score);
 assert.equal(matchEntity(industrial,off,'investor').feedbackAdjustment,0);
});
check('peer learning and rejection reasons obey consent and never resurrect rejected IDs',()=>{
 const peer={...industrial,id:'peer'};
 const learned=authorized({...investor,interested:['peer']},[behavior('peer','interest')]);
 assert.ok(evaluateMatch(industrial,learned,'investor',[industrial,peer]).feedbackAdjustment>0);
 assert.equal(evaluateMatch(industrial,{...learned,settings:{...learned.settings,learning:false}},'investor',[industrial,peer]).feedbackAdjustment,0);
 const rejected={...investor,rejected:{[industrial.id]:'方向不符'}};
 assert.equal(rankCandidates([industrial],rejected,'investor').length,0);
});
check('typed feedback is consented, deduplicated, decayed and separates risk review',()=>{
 const time=new Date().toISOString(),signal={id:'s',entityId:industrial.id,kind:'research',time};
 const once=authorized(investor,[signal]),repeated=authorized(investor,[signal,{...signal,id:'s2'}]);
 assert.ok(matchEntity(industrial,once,'investor').feedbackAdjustment>0);
 assert.equal(matchEntity(industrial,once,'investor').feedbackAdjustment,matchEntity(industrial,repeated,'investor').feedbackAdjustment);
 assert.equal(matchEntity(industrial,{...once,settings:{...once.settings,learning:false}},'investor').feedbackAdjustment,0);
 assert.equal(matchEntity(industrial,{...investor,signals:[{...signal,kind:'risk_review'}]},'investor').feedbackAdjustment,0);
 assert.equal(matchEntity(industrial,{...investor,signals:[{...signal,time:'2020-01-01'}]},'investor').feedbackAdjustment,0);
});
check('an unverified real-world subject stays in exploration even with complete commercial fields',()=>{
 const real={...horizon,real:true,source:'public'};
 const m=matchEntity(real,founder,'founder');
 assert.equal(m.blocked.length,0);assert.ok(m.unknown.includes('主体身份尚未核验'));assert.equal(m.eligible,false);
 assert.equal(matchEntity({...real,verifiedIdentity:true},founder,'founder').eligible,true);
});
check('seen-ID batching never repeats before explicit reset and deduplicates entities',()=>{
 const all=rankCandidates([...funds,funds[0]],founder,'founder');
 assert.equal(new Set(all.map(x=>x.entity.id)).size,all.length);
 const first=all.slice(0,2).map(x=>x.entity.id);
 const remaining=rankCandidates(funds,founder,'founder','',first);
 assert.ok(remaining.every(x=>!first.includes(x.entity.id)));
 assert.equal(rankCandidates(funds,founder,'founder','',all.map(x=>x.entity.id)).length,0);
 assert.equal(rankCandidates(funds,founder,'founder').length,all.length);
});
check('diversity changes ranking among eligible candidates without introducing forbidden sectors',()=>{
 const flexible=answers(investor,{stage:'A 轮',constraints:'暂无额外限制'});
 const clone=(id,sector)=>({...industrial,id,sector,sectors:undefined,name:id});
 const ranked=rankCandidates([clone('a','人工智能'),clone('b','人工智能'),clone('c','企业服务'),clone('d','医疗科技')],flexible,'investor');
 assert.equal(ranked.length,3);assert.equal(ranked[0].entity.sector,'人工智能');assert.equal(ranked[1].entity.sector,'企业服务');
 assert.match(ranked[1].explorationReason,/多样性/);
});
console.log(`PASS: ${checks} matching engine scenarios`);
