import assert from 'node:assert/strict';
import {blankWorkspace} from '../lib/model.ts';
import {entitySignalMode,hasCandidateExposure,recordCandidateExposure,recordDealProgress} from '../lib/flywheel-tracking.ts';

const now=new Date().toISOString();
const yesterday=new Date(Date.now()-86_400_000).toISOString();
const since=new Date(Date.now()-7*86_400_000).toISOString();
const off=blankWorkspace();
const active={...off,settings:{...off.settings,learning:true,learningConsent:{version:1,grantedAt:since}}};
const demo={id:'demo',source:'demo',real:false},publicEntity={id:'public',source:'public',real:true};
assert.equal(entitySignalMode(demo),'simulation');
assert.equal(entitySignalMode(publicEntity),'real');
assert.equal(entitySignalMode({source:'authorized'}),'real');
assert.equal(entitySignalMode({}),'simulation','unknown provenance is not promoted to real');
assert.equal(recordCandidateExposure(off,[demo,publicEntity],'推荐'),off,'disabled collection is a complete no-op');
assert.equal(recordDealProgress(off,'public','研究中','意向沟通'),off);

let tracked=recordCandidateExposure(active,[demo,publicEntity,demo],'推荐',yesterday);
assert.equal(tracked.signals.length,2,'duplicate subjects in the same render are coalesced');
assert.equal(tracked.signals.find(signal=>signal.entityId==='demo').mode,'simulation');
assert.equal(tracked.signals.find(signal=>signal.entityId==='public').mode,'real');
assert.equal(recordCandidateExposure(tracked,[demo,publicEntity],'探索',yesterday),tracked,'same UTC day and another view do not inflate exposures');
tracked=recordCandidateExposure(tracked,[publicEntity],'推荐',now);
assert.equal(tracked.signals.length,3,'a later UTC day is a fresh opportunity');
assert.equal(hasCandidateExposure(tracked,'public',now),true);
assert.equal(hasCandidateExposure(tracked,'demo',now),false);
assert.equal(recordCandidateExposure(active,[publicEntity],'推荐','invalid'),active);
assert.equal(recordCandidateExposure(active,[publicEntity],'推荐',new Date(Date.parse(since)-1).toISOString()),active,'events cannot precede consent');

const earlierToday=new Date(Date.now()-1_000).toISOString();
const regranted={...active,signals:[{id:'old',entityId:'public',kind:'exposure',time:earlierToday,mode:'real'}],settings:{...active.settings,learningConsent:{version:1,grantedAt:now}}};
assert.equal(hasCandidateExposure(regranted,'public',now),false,'a prior consent period is not reused');
assert.equal(recordCandidateExposure(regranted,[publicEntity],'推荐',now).signals.length,2);
const revoked={...tracked,settings:{...tracked.settings,learningConsent:{version:1,grantedAt:since,revokedAt:now}}};
assert.equal(recordCandidateExposure(revoked,[{id:'new',source:'public'}],'推荐'),revoked,'revocation blocks new observations');

const stages=['研究中','意向沟通','双方确认','安排会谈','尽职调查','条款磋商','决策记录','已关闭'];
const expected=['contact','mutual','meeting','diligence','terms','decision','closed'];
let progress=active;
for(let index=1;index<stages.length;index++){
  const next=recordDealProgress(progress,'public',stages[index-1],stages[index],index===7?'双方时间安排不匹配':undefined);
  assert.equal(next.signals[0].kind,expected[index-1]);
  assert.equal(next.signals[0].mode,'simulation','even a real-source subject has simulated Deal Room outcomes');
  assert.equal(recordDealProgress(next,'public',stages[index],stages[index]),next,'autosave does not repeat a stage transition');
  progress=next;
}
assert.equal(progress.signals[0].detail,'双方时间安排不匹配');
assert.equal(recordDealProgress(progress,'public','研究中','不存在的阶段'),progress);
console.log('PASS: exposure consent, UTC-day deduplication, re-consent cutoff, real/sample separation, and all simulated business transitions');
