import assert from 'node:assert/strict';
import {blankWorkspace} from '../lib/model.ts';
import {sampleProfile,companies} from '../lib/catalog.ts';
import {applyLearningRequest} from '../lib/learning.ts';
import {prepareFlywheelState,changedBusinessEntities} from '../lib/flywheel-state.ts';
import {buildFlywheel} from '../lib/flywheel.ts';

const NOW=Date.now(),DAY=86_400_000,at=days=>new Date(NOW+days*DAY).toISOString(),now=at(0);
const off=blankWorkspace(),active={...off,profile:sampleProfile('investor'),settings:{...off.settings,learning:true,learningConsent:{version:1,grantedAt:at(-60)}}};
const feedback=(id,entityId='a',stage='meeting',days=-3)=>({id,entityId,stage,occurredAt:at(days),note:'已与对方实际沟通并记录该阶段进展。',reference:'',recordedAt:'2001-01-01T00:00:00.000Z',updatedAt:'2001-01-01T00:00:00.000Z'});
const signal=(id,entityId,kind,days,mode='real',extra={})=>({id,entityId,kind,time:at(days),mode,...extra});
let checks=0;function check(name,fn){fn();checks++;console.log('PASS:',name)}

check('authenticated preparation stamps observation times and prevents client promotion of business simulations',()=>{
 const input={...active,signals:[signal('new-view','a','view',-20),signal('sim-meeting','a','meeting',-20),signal('demo-view',companies[0].id,'view',-20),signal('spoof-feedback','a','reply',-20,'real',{feedbackId:'invented'})]};
 const saved=prepareFlywheelState(input,active,now);
 assert.equal(saved.signals.length,3);
 assert.ok(saved.signals.every(s=>s.time===now));
 assert.equal(saved.signals.find(s=>s.id==='new-view').mode,'real');
 assert.equal(saved.signals.find(s=>s.id==='sim-meeting').mode,'simulation');
 assert.equal(saved.signals.find(s=>s.id==='demo-view').mode,'simulation');
 const tampered=prepareFlywheelState({...saved,signals:saved.signals.map(s=>({...s,time:at(4),mode:'real'}))},saved,at(.01));
 assert.deepEqual(tampered.signals,saved.signals,'existing event metadata is immutable');
 const forgedConsent={...off,settings:active.settings,signals:[signal('disabled','a','view',0)]};
 assert.equal(prepareFlywheelState(applyLearningRequest(forgedConsent,off,now),off,now).signals.length,0,'request body cannot grant itself consent');
});

check('actual business feedback is stamped, scoped, validated, edited and deleted with linked signals',()=>{
 const submitted={...active,businessFeedback:[feedback('actual')]};
 assert.deepEqual(changedBusinessEntities(submitted,active),['a']);
 const saved=prepareFlywheelState(submitted,active,now),record=saved.businessFeedback[0],generated=saved.signals[0];
 assert.equal(record.recordedAt,now);assert.equal(record.updatedAt,now);
 assert.equal(generated.kind,'meeting');assert.equal(generated.mode,'real');assert.equal(generated.feedbackId,'actual');
 assert.deepEqual(changedBusinessEntities({...saved,businessFeedback:[{...record,note:'这是补充的真实会谈具体记录。'}]},saved),[],'unchanged owner-scoped subjects do not need duplicate lookups');
 const edited=prepareFlywheelState({...saved,businessFeedback:[{...record,stage:'diligence',note:'实际进入尽职调查，并取得对方资料清单。'}]},saved,at(.01));
 assert.equal(edited.signals.length,1);assert.equal(edited.signals[0].kind,'diligence');assert.notEqual(edited.signals[0].id,generated.id);
 assert.equal(edited.businessFeedback[0].recordedAt,now);
 const removed=prepareFlywheelState({...edited,businessFeedback:[]},edited,at(.02));
 assert.equal(removed.signals.length,0);assert.equal(removed.businessFeedback.length,0);
 assert.throws(()=>prepareFlywheelState({...active,businessFeedback:[feedback('demo',companies[0].id)]},active,now),/真实来源/);
 assert.throws(()=>prepareFlywheelState({...active,businessFeedback:[feedback('future','a','meeting',1)]},active,now),/未来/);
 assert.throws(()=>prepareFlywheelState({...active,businessFeedback:[{...feedback('short'),note:'短'}]},active,now),/12/);
 assert.throws(()=>prepareFlywheelState({...active,businessFeedback:[{...feedback('secret'),reference:'https://name:secret@example.org'}]},active,now),/登录凭据/);
 assert.throws(()=>prepareFlywheelState({...saved,businessFeedback:[{...record,entityId:'another'}]},saved,now),/不能改换主体/);
});

check('old business history and edits never backfill consented learning',()=>{
 const regranted={...active,settings:{...active.settings,learningConsent:{version:1,grantedAt:at(-2)}}};
 const priorHistory=prepareFlywheelState({...regranted,businessFeedback:[feedback('old-history','a','meeting',-3)]},regranted,now);
 assert.equal(priorHistory.businessFeedback.length,1);assert.equal(priorHistory.signals.length,0,'pre-grant occurredAt must not create a learning event');
 const disabledRecord=prepareFlywheelState({...off,businessFeedback:[feedback('disabled-history','a','meeting',-3)]},off,at(-3));
 const grantAfterRecord={...disabledRecord,settings:regranted.settings};
 const editedOld=prepareFlywheelState({...grantAfterRecord,businessFeedback:[{...disabledRecord.businessFeedback[0],occurredAt:at(-1),note:'补充自报记录；该条反馈最初登记时尚未授权。'}]},grantAfterRecord,now);
 assert.equal(editedOld.signals.length,0,'editing an old record cannot reset its original recordedAt consent boundary');
});

check('clear traverses the consent boundary without restoring linked events or deleting business records',()=>{
 const saved=prepareFlywheelState({...active,businessFeedback:[feedback('preserved')]},active,now);
 assert.equal(saved.signals.length,1);
 const request={...saved,settings:{...saved.settings,learningRequest:'clear'}};
 const consentApplied=applyLearningRequest(request,saved,at(.01));
 assert.equal(consentApplied.settings.learningRequest,undefined,'transient request is consumed at authorization boundary');
 const cleared=prepareFlywheelState(consentApplied,saved,at(.01),true);
 assert.equal(cleared.signals.length,0,'linked business events must not be reconstructed after clear');
 assert.equal(cleared.settings.learning,false);assert.deepEqual(cleared.businessFeedback,saved.businessFeedback);
 const later=prepareFlywheelState({...cleared,profile:{...cleared.profile,name:'后续普通保存'}},cleared,at(.02));
 assert.equal(later.signals.length,0,'later ordinary saves do not resurrect erased history');
 const fullReset=prepareFlywheelState({...consentApplied,businessFeedback:[]},saved,at(.01),true);
 assert.equal(fullReset.signals.length,0);assert.equal(fullReset.businessFeedback.length,0);
});

check('exposures deduplicate by UTC day without swallowing observations after same-day re-consent',()=>{
 const midnight=new Date(now);midnight.setUTCHours(0,0,0,0);const before=new Date(midnight.getTime()+1).toISOString(),grant=new Date(midnight.getTime()+2).toISOString(),after=new Date(midnight.getTime()+3).toISOString();
 const regranted={...active,settings:{...active.settings,learningConsent:{version:1,grantedAt:grant}},signals:[{id:'prior-period',entityId:'a',kind:'exposure',time:before,mode:'real'}]};
 const saved=prepareFlywheelState({...regranted,signals:[{id:'new-period',entityId:'a',kind:'exposure',time:after,mode:'real'},...regranted.signals]},regranted,after);
 assert.equal(saved.signals.filter(s=>s.kind==='exposure'&&Date.parse(s.time)>=Date.parse(grant)).length,1);
 const twice=prepareFlywheelState({...saved,signals:[{id:'duplicate',entityId:'a',kind:'exposure',time:after,mode:'real'},...saved.signals]},saved,after);
 assert.equal(twice.signals.filter(s=>s.kind==='exposure'&&Date.parse(s.time)>=Date.parse(grant)).length,1,'another render that day does not inflate the fresh cohort');
});

const entity=(id,kind='company')=>({id,name:'主体 '+id,kind,canonicalUrl:'https://example.org/'+id,summary:'待核实的真实公开资料',profile:{sector:'人工智能',stage:'A 轮',region:'中国',currency:'CNY',amount:'3000',min:'1000',max:'5000'},createdAt:at(-40),updatedAt:at(-1)});
const source=(id,entityId,days,visibility='public')=>({id,entityId,type:'website',title:'原始来源 '+id,url:'https://example.org/'+id,canonicalUrl:'https://example.org/'+id,excerpt:'公开来源包含原文和研究依据。',publishedAt:null,collectedAt:at(days),visibility,claimType:'self_disclosed',contentHash:id,lineageKey:id,documentId:null,extractionMode:'rules',extractionNote:''});
const finding=(id,reviewStatus)=>({id,entityId:'a',type:'metric',title:'核查 '+id,priority:'medium',comparison:'different',claimIds:[],sourceIds:['a-old'],explanation:'需人工核查',hypotheses:[],nextAction:'核对原始证据',reviewStatus,reviewNote:'',createdAt:at(-2)});
const knowledge={entities:[entity('a'),entity('b'),entity('c'),entity('fund','fund'),entity('orphan')],sources:[source('a-old','a',-40),source('a-private','a',-1,'private'),source('b-new','b',-1),source('future','fund',1)],claims:[{id:'c1',subjectId:'a',sourceId:'a-old',metric:'ARR',value:'100',unit:'万元',currency:'CNY',period:'2026',scope:'company',excerpt:'ARR 100万元',claimType:'self_disclosed',createdAt:at(-1)},{id:'c2',subjectId:'a',sourceId:'missing',metric:'revenue',value:'90',unit:'万元',currency:'CNY',period:'2026',scope:'company',excerpt:'收入90万元',claimType:'self_disclosed',createdAt:at(-1)}],relationships:[{id:'same-confirmed',subjectId:'a',objectId:'b',type:'SAME_ENTITY_CANDIDATE',status:'confirmed',sourceId:'a-old',note:'已核对',createdAt:at(-2)},{id:'same-suspected',subjectId:'a',objectId:'c',type:'SAME_ENTITY_CANDIDATE',status:'suspected',sourceId:'a-old',note:'待核对',createdAt:at(-2)}],findings:['pending','verified','explained','false_positive','inconclusive'].map(status=>finding(status,status)),runs:[]};
const metric=(report,key)=>report.metrics.find(m=>m.key===key);
const observed={...active,signals:[signal('a-first','a','exposure',-10),signal('a-latest','a','exposure',-1),signal('a-research','a','research',-5),signal('b-first','b','exposure',-8),signal('b-sim-meeting','b','meeting',-5,'simulation'),signal('c-first','c','exposure',-7),signal('c-before','c','interest',-9),signal('fund-exposure','fund','exposure',-10),signal('fund-interest','fund','interest',-5),signal('future-exposure','orphan','exposure',1),signal('demo-exposure',companies[0].id,'exposure',-1,'simulation'),signal('demo-interest',companies[0].id,'interest',-.5,'simulation')],businessFeedback:[feedback('reply','a','positive_reply',-6),feedback('meeting','a','meeting',-7),feedback('diligence','a','diligence',-4),feedback('before-exposure','b','diligence',-9),feedback('future','c','meeting',1)]};

check('cohort uses first consented exposure, real subjects, actual times and exact recorded stages',()=>{
 const report=buildFlywheel(observed,knowledge,'investor',NOW);
 assert.equal(report.signals.exposed,3,'only current-role real, nonfuture subjects enter denominator');
 assert.equal(metric(report,'engagement').numerator,1,'research between first and latest exposure still counts; prior interest and simulation do not');
 assert.equal(metric(report,'engagement').denominator,3);
 assert.equal(metric(report,'positive_reply').numerator,1);assert.equal(metric(report,'meeting').numerator,1);assert.equal(metric(report,'diligence').numerator,1);
 assert.equal(metric(report,'outcomes').numerator,4,'future-dated feedback is excluded');
 assert.ok(metric(report,'engagement').value<100);
 const founder=buildFlywheel({...observed,profile:sampleProfile('founder')},knowledge,'founder',NOW);
 assert.equal(founder.signals.exposed,1);assert.equal(metric(founder,'engagement').numerator,1,'fund candidate cohort is separate from company cohort');
 const meetingOnly=buildFlywheel({...observed,businessFeedback:[feedback('meeting','a','meeting',-7)]},knowledge,'investor',NOW);
 assert.equal(metric(meetingOnly,'positive_reply').numerator,0,'a later stage never fabricates earlier replies');
});

check('late entry of pre-exposure outcomes does not manufacture exposure conversion',()=>{
 const workspace={...active,signals:[signal('b-exposed','b','exposure',-2),signal('old-meeting-entered-now','b','meeting',0,'real',{feedbackId:'before'})],businessFeedback:[feedback('before','b','meeting',-3)]};
 const report=buildFlywheel(workspace,knowledge,'investor',NOW);
 assert.equal(metric(report,'meeting').numerator,0);assert.equal(metric(report,'engagement').numerator,0);
});

check('missing denominators remain unknown and revocation removes behavioral cohorts',()=>{
 const report=buildFlywheel({...observed,settings:{...observed.settings,learning:false}},knowledge,'investor',NOW);
 assert.equal(report.signals.authorized,false);assert.equal(metric(report,'engagement').value,null);assert.equal(metric(report,'meeting').denominator,0);
 assert.equal(metric(report,'outcomes').numerator,4,'business records survive consent withdrawal');
 const empty=buildFlywheel(off,{entities:[],sources:[],claims:[],relationships:[],findings:[],runs:[]},'investor',NOW);
 assert.equal(metric(empty,'coverage').value,null);assert.equal(metric(empty,'false_positive').value,null);
});

check('data-quality evidence and review outcomes feed actionable queues with honest denominators',()=>{
 const report=buildFlywheel(observed,knowledge,'investor',NOW);
 assert.equal(metric(report,'coverage').numerator,3);assert.equal(metric(report,'coverage').denominator,5);
 assert.equal(metric(report,'traceability').value,50);assert.equal(metric(report,'identity').value,50);
 assert.equal(metric(report,'false_positive').numerator,1);assert.equal(metric(report,'false_positive').denominator,3);
 assert.equal(metric(report,'freshness').numerator,2);assert.equal(metric(report,'freshness').denominator,3,'future source dates never improve freshness');
 assert.ok(report.queue.some(item=>item.id==='freshness:a'),'fresh private upload does not hide a stale public source');
 assert.ok(report.queue.some(item=>item.id==='pending'));assert.ok(report.queue.some(item=>item.id==='inconclusive'));assert.ok(report.queue.some(item=>item.id==='verified'));
 assert.ok(!report.queue.some(item=>['false_positive','explained'].includes(item.id)),'completed reviews exit the active work queue');
 assert.ok(report.queue.some(item=>item.id==='same-suspected'));assert.ok(report.queue.some(item=>item.id==='coverage:orphan'));
 assert.ok(report.comparison.rows.every(row=>row.beforeRank>0&&row.afterRank>0));
 assert.equal(report.comparison.realCount,0,'feedback cannot bypass unverified identity hard gates');
});

console.log(`PASS: ${checks} flywheel state and cohort scenarios`);
