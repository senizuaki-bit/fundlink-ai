import assert from 'node:assert/strict';
import {funds,sampleProfile} from '../lib/catalog.ts';
import {blankWorkspace} from '../lib/model.ts';
import {capitalFiltersForProfile,emptyCapitalFilters,findCapital,capitalFilterError} from '../lib/capital.ts';
import {researchAnswer} from '../lib/research.ts';

const w={...blankWorkspace(),profile:sampleProfile('founder')};
const initial=capitalFiltersForProfile(w.profile);
assert.equal(initial.ticket,''); // A whole round is not a single fund's cheque.
assert.equal(initial.stage,'A 轮');
assert.equal(capitalFiltersForProfile({...w.profile,answers:{stage:'Pre-A 轮'}}).stage,'Pre-A 轮');
const matched=findCapital({...initial,eligibleOnly:true},w).map(x=>x.fund.id).sort();
assert.deepEqual(matched,['horizon','origin','pacific','delta','clarity','northstar','oak','meridian'].sort());
assert.equal(findCapital({...emptyCapitalFilters(),region:'全球'},w).length,funds.length);
assert.ok(findCapital({...emptyCapitalFilters(),region:'中国'},w).some(x=>x.fund.id==='pacific'));
assert.ok(findCapital({...emptyCapitalFilters(),ticket:'3000'},w).some(x=>x.fund.id==='origin'));
assert.ok(!findCapital({...emptyCapitalFilters(),ticket:'3000.01'},w).some(x=>x.fund.id==='origin'));
assert.ok(capitalFilterError({...initial,ticket:'-1'}));
assert.ok(capitalFilterError({...initial,ticket:'USD 500'}));
assert.ok(findCapital({...emptyCapitalFilters(),type:'产业资本'},w).every(x=>x.fund.tags.includes('产业资本')));
assert.ok(findCapital({...emptyCapitalFilters(),resource:'国际化经验'},w).every(x=>x.fund.resources.includes('国际化经验')));
const debt={...w,profile:{...w.profile,answers:{...w.profile.answers,constraints:'债务融资'}}};
assert.equal(findCapital({...emptyCapitalFilters(),eligibleOnly:true},debt).length,0);
const custom={...w,profile:{...w.profile,answers:{...w.profile.answers,constraints:'只接受本地基金'}}};
assert.equal(findCapital({...emptyCapitalFilters(),eligibleOnly:true},custom).length,0);
const usd={...w,profile:{...w.profile,answers:{...w.profile.answers,amount:'USD 500000'}}};
assert.equal(findCapital({...emptyCapitalFilters(),eligibleOnly:true},usd).length,0);
const old={...w,scans:[{items:[{id:'gh-legacy',name:'Legacy project',description:'legacy'}]}]};
assert.ok(!researchAnswer('研究','gh-legacy',old,'founder').includes('Legacy project'));
assert.ok(researchAnswer('研究','gh-legacy',old,'investor').includes('Legacy project'));
assert.ok(researchAnswer('尽调计划','horizon',w,'founder').includes('投委会'));
assert.ok(!researchAnswer('尽调计划','horizon',w,'founder').includes('付费客户'));
const before=JSON.stringify(w);findCapital(initial,w);assert.equal(JSON.stringify(w),before);
console.log('PASS: capital filters, cheque boundaries, currency/constraint gating, profile semantics, investor legacy leads and founder research');

if(process.env.FUNDLINK_TEST_URL){
  const base=process.env.FUNDLINK_TEST_URL;
  const login=await fetch(base+'/signin-with-chatgpt?return_to=/',{redirect:'manual'});
  const cookie=login.headers.get('set-cookie').split(';')[0];
  const headers={cookie,'Content-Type':'application/json'};
  const founderScan=await fetch(base+'/api/discover?role=founder',{method:'POST',headers,body:JSON.stringify({source:'github',query:'test'})});
  assert.equal(founderScan.status,403);
  const crossed=await fetch(base+'/api/agent?role=founder',{method:'POST',headers,body:JSON.stringify({entityId:'industrialmind',prompt:'研究'})});
  assert.equal(crossed.status,400);
  const state=await fetch(base+'/api/state?role=founder',{headers}).then(r=>r.json());
  assert.ok(state.capitalSearches===undefined||Array.isArray(state.capitalSearches));
  console.log('PASS: founder project-scan rejection, role-correct research targets and legacy workspace compatibility');
}
