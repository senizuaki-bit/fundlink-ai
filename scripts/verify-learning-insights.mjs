import assert from 'node:assert/strict';
import {blankWorkspace} from '../lib/model.ts';
import {companies,sampleProfile} from '../lib/catalog.ts';
import {learningInsights,behaviorAdjustment} from '../lib/learning-insights.ts';
import {evaluateMatch,rankCandidates} from '../lib/matching.ts';

const NOW=Date.now(),DAY=86_400_000;
const date=days=>new Date(NOW-days*DAY).toISOString();
const real=(id,sector='人工智能')=>({...companies[0],id,name:id,sector,real:true,source:'public',verifiedIdentity:true});
const demo=(id,sector='人工智能')=>({...companies[0],id,name:id,sector});
const realEntities=Array.from({length:24},(_,i)=>real('real-'+i));
const demoEntities=Array.from({length:8},(_,i)=>demo('demo-'+i));
const entities=[...realEntities,...demoEntities];
const base=blankWorkspace();
const authorized={...base,profile:sampleProfile('investor'),settings:{...base.settings,learning:true,learningConsent:{version:1,grantedAt:date(100)}},signals:[]};
let counter=0,passed=0;
const signal=(entityId,kind,extra={})=>({id:'signal-'+ ++counter,entityId,kind,time:date(0),...extra});
const state=signals=>({...authorized,signals});
const inspect=signals=>learningInsights(state(signals),entities,NOW);
const check=(name,run)=>{run();passed++;console.log('PASS: '+name)};

check('learning requires a recorded current consent and excludes pre-grant, stale and future events',()=>{
 const events=[signal('real-0','interest'),signal('real-1','interest',{time:date(91)}),signal('real-2','interest',{time:date(-1)})];
 assert.equal(learningInsights({...state(events),settings:{...base.settings,learning:true}},entities,NOW).signals.length,0);
 assert.equal(inspect(events).signals.length,1);
 assert.equal(learningInsights({...state(events),settings:{...authorized.settings,learningConsent:{version:1,grantedAt:date(-.01)}}},entities,NOW).signals.length,0);
 const after=learningInsights({...state(events),settings:{...authorized.settings,learningConsent:{version:1,grantedAt:date(-.000001)}}},entities,NOW);
 assert.equal(after.signals.length,0);
});
check('same object and signal kind are deduplicated using the latest evidence',()=>{
 const first=signal('real-0','save',{time:date(30)}),latest=signal('real-0','save');
 const once=inspect([latest]),many=inspect([first,latest,...Array.from({length:200},()=>signal('real-0','save',{time:date(2)}))]);
 assert.equal(many.signals.length,1);assert.equal(many.signals[0].id,latest.id);
 assert.equal(many.sectors[0].positiveWeight,once.sectors[0].positiveWeight);
});
check('thirty-day decay halves weight and ninety-day cutoff removes old records',()=>{
 assert.equal(inspect([signal('real-0','interest',{time:date(30)})]).signals[0].weight,1);
 assert.equal(inspect([signal('real-0','interest',{time:date(60)})]).signals[0].weight,.5);
 assert.equal(inspect([signal('real-0','interest',{time:date(91)})]).signals.length,0);
});
check('weak views searches and batch actions never generate a preference suggestion',()=>{
 const events=realEntities.flatMap(e=>['view','search','batch'].flatMap(kind=>Array.from({length:8},()=>signal(e.id,kind,{detail:'跳过当前批次'}))));
 const result=inspect(events);assert.equal(result.suggestions.length,0);
 const adjustment=behaviorAdjustment(realEntities[0],state(events),entities,NOW).adjustment;
 assert.ok(adjustment<=.35&&adjustment>=-.15);
 assert.equal(behaviorAdjustment(real('unseen'),state(events),entities,NOW).adjustment,0);
});
check('one or two strong-interest objects cannot reshape a profile',()=>{
 assert.equal(inspect([signal('real-0','interest')]).suggestions.length,0);
 assert.equal(inspect([signal('real-0','interest'),signal('real-1','interest')]).suggestions.length,0);
});
check('three independent objects with strong evidence produce a traceable suggestion',()=>{
 const events=[0,1,2].map(i=>signal('real-'+i,'interest'));
 const suggestion=inspect(events).suggestions[0];
 assert.equal(suggestion.scope,'real');assert.equal(suggestion.sector,'人工智能');
 assert.equal(suggestion.entityIds.length,3);assert.equal(suggestion.strongEntityCount,3);
 assert.deepEqual(new Set(suggestion.supportingSignalIds),new Set(events.map(s=>s.id)));
 assert.match(suggestion.reason,/硬条件/);
});
check('medium signals require at least four distinct objects and six signal types',()=>{
 const events=[0,1,2,3].flatMap(i=>[signal('real-'+i,'save'),signal('real-'+i,'research')]);
 assert.equal(inspect(events).suggestions.length,1);
 assert.equal(inspect(events.slice(0,6)).suggestions.length,0);
});
check('many stages of a single object are capped and cannot satisfy breadth threshold',()=>{
 const events=['save','research','interest','contact','reply','meeting','diligence','terms'].map(kind=>signal('real-0',kind,{mode:'real'}));
 assert.equal(inspect(events).suggestions.length,0);
 assert.equal(inspect(events).sectors[0].positiveWeight,6);
 assert.ok(behaviorAdjustment(realEntities[0],state(events),entities,NOW).adjustment<=6);
});
check('more exposure without more feedback cannot inflate a popular sector',()=>{
 const events=[0,1,2].map(i=>signal('real-'+i,'interest'));
 const sparse=inspect(events),exposed=inspect([...events,...realEntities.map(e=>signal(e.id,'exposure'))]);
 assert.ok(exposed.sectors[0].normalizedWeight<sparse.sectors[0].normalizedWeight);
 assert.equal(exposed.sectors[0].exposureEntityCount,24);
 assert.equal(exposed.sectors[0].exposureCoverage,1);
 assert.equal(exposed.suggestions.length,0,'weak response across large exposure stays below threshold');
 assert.equal(inspect(realEntities.map(e=>signal(e.id,'exposure'))).sectors[0].positiveWeight,0);
});
check('duplicate exposures never multiply the denominator',()=>{
 const events=[signal('real-0','interest'),...Array.from({length:100},()=>signal('real-0','exposure'))];
 assert.equal(inspect(events).sectors[0].exposureEntityCount,1);
 assert.equal(inspect(events).signals.length,2);
});
check('demo actions cannot influence real candidates or create real suggestions',()=>{
 const events=[0,1,2].map(i=>signal('demo-'+i,'interest',{mode:'simulation'}));
 assert.equal(inspect(events).suggestions[0].scope,'demo');
 assert.equal(behaviorAdjustment(realEntities[0],state(events),entities,NOW).adjustment,0);
 assert.ok(behaviorAdjustment(demoEntities[4],state(events),entities,NOW).adjustment>0);
});
check('real actions cannot influence demo candidates and cannot relabel demo objects as real',()=>{
 const events=[0,1,2].map(i=>signal('real-'+i,'interest',{mode:'real'}));
 assert.equal(behaviorAdjustment(demoEntities[0],state(events),entities,NOW).adjustment,0);
 assert.equal(inspect([signal('demo-0','interest',{mode:'real'})]).signals.length,0);
});
check('simulated business actions and legacy untagged deals on real candidates never train real learning',()=>{
 const kinds=['contact','mutual','reply','meeting','diligence','terms','decision','closed'];
 assert.equal(inspect(kinds.map(kind=>signal('real-0',kind))).signals.length,0);
 assert.equal(inspect(kinds.map(kind=>signal('real-0',kind,{mode:'simulation'}))).signals.length,0);
 assert.ok(inspect([signal('real-0','meeting',{mode:'real',feedbackId:'feedback-1'})]).signals.length>0);
});
check('risk review and ambiguous final statuses never improve or degrade fit',()=>{
 const events=['risk_review','closed','decision'].map(kind=>signal('real-0',kind,{mode:'real',detail:'已关闭'}));
 assert.equal(inspect(events).signals.length,0);
 assert.equal(behaviorAdjustment(realEntities[0],state(events),entities,NOW).adjustment,0);
});
check('explicit real self-reported completion contributes strong evidence only with its persisted feedback reference',()=>{
 const won=signal('real-0','decision',{mode:'real',feedbackId:'feedback-won',outcome:'won'});
 const result=inspect([won]);assert.equal(result.signals.length,1);assert.equal(result.signals[0].tier,'strong');assert.equal(result.signals[0].weight,5);
 assert.equal(behaviorAdjustment(realEntities[0],state([won]),entities,NOW).adjustment,5);
 assert.equal(result.suggestions.length,0,'one completed deal alone does not justify a profile shift');
 const pipeline=[won,...['interest','meeting','diligence','terms'].map(kind=>signal('real-0',kind,{mode:'real',feedbackId:'feedback-'+kind}))];
 assert.equal(behaviorAdjustment(realEntities[0],state(pipeline),entities,NOW).adjustment,6,'existing adjustment cap still applies');
});
check('decision without explicit completion, unreferenced completion, and simulated completion remain inert',()=>{
 const events=[
  signal('real-0','decision',{mode:'real',feedbackId:'feedback-ambiguous'}),
  signal('real-1','decision',{mode:'real',outcome:'won'}),
  signal('real-2','decision',{mode:'simulation',feedbackId:'simulation',outcome:'won'}),
  signal('demo-0','decision',{mode:'simulation',feedbackId:'demo-won',outcome:'won'}),
  signal('demo-1','decision',{mode:'real',feedbackId:'forged-mode',outcome:'won'})
 ];
 assert.equal(inspect(events).signals.length,0);
 assert.equal(behaviorAdjustment(realEntities[0],state(events),entities,NOW).adjustment,0);
 assert.equal(behaviorAdjustment(demoEntities[0],state(events),entities,NOW).adjustment,0);
});
check('unsuccessful actual outcomes never penalize a whole sector merely because a deal closed',()=>{
 const events=[signal('real-0','closed',{mode:'real',feedbackId:'feedback-lost',outcome:'lost',detail:'行业有潜力，因本期预算用完未成交'})];
 assert.equal(inspect(events).signals.length,0);
 assert.equal(behaviorAdjustment(realEntities[0],state(events),entities,NOW).adjustment,0);
 assert.equal(behaviorAdjustment(realEntities[1],state(events),entities,NOW).adjustment,0);
});
check('negative preference reasons reduce fit but a declined meeting alone does not',()=>{
 assert.ok(behaviorAdjustment(realEntities[0],state([signal('real-0','reject',{detail:'行业方向不符'})]),entities,NOW).adjustment<0);
 assert.equal(behaviorAdjustment(realEntities[0],state([signal('real-0','reject',{detail:'暂时不方便开会'})]),entities,NOW).adjustment,0);
});
check('confirmed and ignored suggestions respect real/demo scope',()=>{
 const events=[0,1,2].flatMap(i=>[signal('real-'+i,'interest'),signal('demo-'+i,'interest')]);
 assert.equal(inspect(events).suggestions.length,2);
 let result=learningInsights({...state(events),preference:'人工智能',preferenceScope:'demo'},entities,NOW);
 assert.deepEqual(result.suggestions.map(s=>s.scope),['real']);
 result=learningInsights({...state(events),ignoredSuggestion:'人工智能',ignoredSuggestionScope:'real'},entities,NOW);
 assert.deepEqual(result.suggestions.map(s=>s.scope),['demo']);
 assert.equal(learningInsights({...state(events),preference:'人工智能'},entities,NOW).suggestions.length,0);
});
check('explicit scoped preference affects only the intended ranking scope',()=>{
 const off={...authorized,settings:{...authorized.settings,learning:false}};
 const pref={...off,preference:'人工智能',preferenceScope:'demo'};
 assert.equal(evaluateMatch(realEntities[0],off,'investor').investorFit,evaluateMatch(realEntities[0],pref,'investor').investorFit);
 const before=evaluateMatch(demoEntities[0],off,'investor').investorFit;
 assert.equal(evaluateMatch(demoEntities[0],pref,'investor').investorFit,Math.min(100,before+2));
});
check('learning never overrides hard exclusions and cannot bring back rejected IDs',()=>{
 const learned={...state([signal('real-0','interest')]),profile:{...authorized.profile,answers:{...authorized.profile.answers,excludedSectors:'人工智能'}}};
 assert.ok(evaluateMatch(realEntities[0],learned,'investor',entities).blocked.length>0);
 assert.equal(rankCandidates([realEntities[0]],learned,'investor').length,0);
 assert.equal(rankCandidates([demoEntities[0]],{...state([signal('demo-0','interest')]),rejected:{'demo-0':'方向不符'}},'investor').length,0);
});
check('revoking consent zeroes automatic adjustment and suggestions',()=>{
 const active=state([0,1,2].map(i=>signal('real-'+i,'interest')));
 const revoked={...active,settings:{...active.settings,learning:false,learningConsent:{...active.settings.learningConsent,revokedAt:date(0)}}};
 assert.equal(learningInsights(revoked,entities,NOW).suggestions.length,0);
 assert.equal(behaviorAdjustment(realEntities[0],revoked,entities,NOW).adjustment,0);
});
console.log(`${passed} data flywheel learning checks passed.`);
