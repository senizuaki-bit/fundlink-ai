import assert from 'node:assert/strict';
import {test} from 'node:test';
import {blankWorkspace} from '../lib/model.ts';
import {prepareWorkspace} from '../lib/workspace-state.ts';
import {professionalProfileGroups,profileFieldKeys,profileFieldOrigin} from '../lib/profile-fields.ts';
import {parseProfileReview,applyProfileReview} from '../lib/profile-review.ts';

const now='2026-10-10T08:00:00.000Z',later='2026-10-11T08:00:00.000Z';
const initial=()=>{const w=blankWorkspace();w.profile.name='工业示例企业';w.profile.answers={sector:'人工智能',revenue:'2026 年 Q3 确认收入人民币 120 万元'};return prepareWorkspace(w,blankWorkspace(),now)};
const request=(extra={})=>({key:'revenue',value:'2026 年 Q3 确认收入人民币 120 万元',action:'verify',confirmed:true,version:0,reference:'https://example.com/reports/2026-q3',reviewNote:'核对 2026 年第三季度报告第 3 页，期间、币种与收入确认口径一致。',...extra});

test('professional profiles cover the PRD categories, with unique descriptive keys and factual defaults',()=>{
  for(const role of ['founder','investor']){
    const fields=professionalProfileGroups[role].flatMap(g=>g.fields);
    assert.equal(new Set(fields.map(f=>f.key)).size,fields.length);
    assert.ok(fields.every(f=>f.title&&f.hint&&['declared','self_reported'].includes(f.origin)));
    assert.ok(professionalProfileGroups[role].length>=4);
  }
  for(const key of ['companyLegalName','foundingTeam','productDescription','competitiveAdvantage','customerMetrics','revenue','financialStatementsReference','financingHistory','historicalInvestors','capTableReference','valuationExpectation','fundingUsePlan','bpNarrative','bpReference'])assert.ok(profileFieldKeys('founder').has(key),key);
  for(const key of ['fundManager','fundVehicle','representativeAuthority','investmentMandate','personalResearchInterests','investmentStrategy','ticketPolicy','sectorMandate','geographicMandate','leadPolicy','portfolioHistory','strategicResources','portfolioConflicts','decisionProcess'])assert.ok(profileFieldKeys('investor').has(key),key);
  assert.equal(profileFieldOrigin('foundingTeam'),'self_reported');assert.equal(profileFieldOrigin('investmentMandate'),'declared');
});

test('new professional details survive save and cannot forge a verified fact',()=>{
  const incoming=blankWorkspace();incoming.profile.answers={foundingTeam:'创始人任 CEO，负责工业产品研发',investmentMandate:'仅限中国市场，单笔不超过 3000 万元'};
  incoming.profile.provenance={foundingTeam:{origin:'verified',time:'forged',reference:'forged',reviewedBy:'forged'}};
  const next=prepareWorkspace(incoming,blankWorkspace(),now);
  assert.deepEqual(next.profile.answers,incoming.profile.answers);
  assert.equal(next.profile.provenance.foundingTeam.origin,'self_reported');
  assert.equal(next.profile.provenance.foundingTeam.reference,undefined);
  assert.equal(next.profile.provenance.investmentMandate.origin,'declared');
});

test('inferred extraction retains its source on save, and explicit confirmation is recorded separately',()=>{
  const incoming=blankWorkspace();incoming.profile.answers={sector:'人工智能'};
  incoming.profile.provenance={sector:{origin:'inferred',time:now,quote:'为工厂提供智能质检解决方案'}};
  const next=prepareWorkspace(incoming,blankWorkspace(),now);
  assert.equal(next.profile.provenance.sector.origin,'inferred');
  assert.equal(next.profile.provenance.sector.quote,'为工厂提供智能质检解决方案');
  assert.deepEqual(prepareWorkspace(structuredClone(next),next,later).profile,next.profile);
  const confirmed=structuredClone(next);confirmed.profile.provenance.sector={origin:'declared',time:later,quote:'我确认行业为人工智能'};
  const saved=prepareWorkspace(confirmed,next,later);
  assert.equal(saved.profile.provenance.sector.origin,'declared');assert.equal(saved.profile.history[0].before,saved.profile.history[0].after);
  assert.equal(saved.profile.history[1].origin,'inferred');
});

test('human review requires source, explicit confirmation, contextual note and a role-valid field',()=>{
  const valid=parseProfileReview(request(),'founder');assert.equal(valid.action,'verify');
  for(const bad of [{confirmed:false},{confirmed:'true'},{reference:''},{reference:'javascript:alert(1)'},{reference:'https://user:password@example.com'},{reviewNote:'已核实'},{version:-1},{key:'__proto__'}])assert.throws(()=>parseProfileReview(request(bad),'founder'));
  assert.throws(()=>parseProfileReview(request({key:'investmentMandate'}),'founder'),/身份/);
  assert.throws(()=>parseProfileReview(request({key:'financingHistory'}),'investor'),/身份/);
});

test('review stamps actor and time, verifies the exact value and resolves owned-document evidence',()=>{
  const before=initial();const review=parseProfileReview(request(),'founder');
  const profile=applyProfileReview(before.profile,review,'test-user',later);
  assert.equal(profile.provenance.revenue.origin,'verified');assert.equal(profile.provenance.revenue.time,later);assert.equal(profile.provenance.revenue.reviewedBy,'test-user');
  assert.equal(profile.history[0].reference,review.reference);assert.equal(profile.history[0].before,profile.history[0].after);
  assert.throws(()=>applyProfileReview({...before.profile,answers:{revenue:'不同内容'}},review,'test-user',later),/变化/);
  assert.throws(()=>applyProfileReview(before.profile,review,'',later),/核验人/);
  const docReview=parseProfileReview(request({documentId:'document-1234',reference:undefined}),'founder');
  assert.throws(()=>applyProfileReview(before.profile,docReview,'test-user',later),/权限/);
  assert.throws(()=>applyProfileReview(before.profile,docReview,'test-user',later,{id:'another-doc',name:'other.pdf'}),/权限/);
  assert.match(applyProfileReview(before.profile,docReview,'test-user',later,{id:'document-1234',name:'财报 Q3.pdf'}).provenance.revenue.reference,/财报 Q3.pdf/);
});

test('unchanged verified fields retain trusted provenance; editing invalidates review and preserves history',()=>{
  const before=initial();before.profile=applyProfileReview(before.profile,parseProfileReview(request(),'founder'),'test-user',now);
  const unrelated=structuredClone(before);unrelated.profile.answers.bpNarrative='完成产品验证，计划拓展工业客户';unrelated.profile.provenance.revenue={origin:'verified',time:'forged',reference:'https://forged.example'};
  const next=prepareWorkspace(unrelated,before,later);assert.deepEqual(next.profile.provenance.revenue,before.profile.provenance.revenue);
  const edited=structuredClone(before);edited.profile.answers.revenue='2026 年 Q4 收入 200 万元';
  const updated=prepareWorkspace(edited,before,later);assert.equal(updated.profile.provenance.revenue.origin,'self_reported');assert.equal(updated.profile.provenance.revenue.reference,undefined);
  assert.ok(updated.profile.history.some(h=>h.origin==='verified'&&h.reference));
  const retraction=parseProfileReview(request({action:'retract',reference:undefined,reviewNote:'收入确认口径已发生调整，需要重新核查原始财务资料。'}),'founder');
  const retracted=applyProfileReview(before.profile,retraction,'test-user',later);assert.equal(retracted.provenance.revenue.origin,'self_reported');assert.equal(retracted.history[0].reviewNote,retraction.reviewNote);
});

test('profile input bounds reject prototype keys and oversized free text',()=>{
  const malicious=blankWorkspace();malicious.profile.answers=JSON.parse('{"__proto__":"bad"}');assert.throws(()=>prepareWorkspace(malicious,blankWorkspace(),now),/名称|长度/);
  const oversized=blankWorkspace();oversized.profile.answers={bpNarrative:'x'.repeat(12001)};assert.throws(()=>prepareWorkspace(oversized,blankWorkspace(),now),/长度/);
});

if(process.env.FUNDLINK_TEST_URL){
  const response=await fetch(process.env.FUNDLINK_TEST_URL+'/api/profile-review?role=founder',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(request())});
  assert.equal(response.status,401);
}
