import assert from 'node:assert/strict';
import test from 'node:test';
import {blankWorkspace,normalizeWorkspace} from '../lib/model.ts';
import {stages} from '../lib/catalog.ts';
import {prepareWorkspace,dealStages} from '../lib/workspace-state.ts';

const time='2026-10-09T12:00:00.000Z';
const deal=(overrides={})=>({id:'deal-1',entityId:'industrialmind',stage:'研究中',notes:'',draft:'',tasks:[],mutual:false,...overrides});
const workspace=(entry)=>({...blankWorkspace(),deals:[entry]});
const transition=(previous,next)=>prepareWorkspace(workspace(next),workspace(previous),time);

test('UI catalog and server use exactly the same stage names',()=>{
  assert.deepEqual(dealStages,stages);
  assert.deepEqual(stages,['研究中','意向沟通','双方确认','安排会谈','尽职调查','条款磋商','决策记录','已关闭']);
});
test('profile changes derive origins, record prior values and use server time',()=>{
  const old=blankWorkspace();old.profile={name:'团队',completed:false,answers:{stage:'种子轮',traction:'尚未收费'}};
  const input=structuredClone(old);input.profile.answers={stage:'Pre-A 轮',traction:'20 个付费客户'};
  input.profile.provenance={stage:{origin:'verified',time:'forged-time',quote:'目前处于 Pre-A 轮'},traction:{origin:'verified',time:'forged-time',quote:'我们已有 20 个付费客户'}};
  const next=prepareWorkspace(input,old,time);
  assert.equal(next.profile.provenance.stage.origin,'declared');
  assert.equal(next.profile.provenance.traction.origin,'self_reported');
  assert.equal(next.profile.provenance.stage.time,time);
  assert.equal(next.profile.provenance.traction.quote,'我们已有 20 个付费客户');
  const revision=next.profile.history.find(item=>item.key==='traction');
  assert.equal(revision.before,'尚未收费');assert.equal(revision.after,'20 个付费客户');assert.equal(revision.time,time);
  assert.deepEqual(old.profile.answers,{stage:'种子轮',traction:'尚未收费'});
});
test('unchanged fields cannot forge provenance or replace history',()=>{
  const first=blankWorkspace();first.profile.answers={region:'中国'};
  const old=prepareWorkspace(first,blankWorkspace(),time);
  const input=structuredClone(old);input.profile.history=[];input.profile.provenance.region={origin:'verified',time:'forged',quote:'forged'};
  const next=prepareWorkspace(input,old,'2026-10-10T12:00:00.000Z');
  assert.deepEqual(next.profile.history,old.profile.history);assert.deepEqual(next.profile.provenance,old.profile.provenance);
});
test('profile deletions and name changes remain in history',()=>{
  const old=blankWorkspace();old.profile={name:'旧名称',completed:false,answers:{region:'中国'}};
  const input=structuredClone(old);input.profile.name='新名称';delete input.profile.answers.region;
  const next=prepareWorkspace(input,old,time);
  assert.ok(next.profile.history.some(item=>item.key==='region'&&item.before==='中国'&&item.after===''));
  assert.ok(next.profile.history.some(item=>item.key==='name'&&item.before==='旧名称'&&item.after==='新名称'));
});
test('profile field type boundaries and bounded quote/history',()=>{
  const input=blankWorkspace();input.profile.answers={amount:3000};assert.throws(()=>prepareWorkspace(input,blankWorkspace(),time),/文本/);
  const old=blankWorkspace();old.profile.history=Array.from({length:205},(_,i)=>({id:String(i),key:'x',before:'a',after:'b',origin:'declared',time}));
  const edited=structuredClone(old);edited.profile.answers={amount:'3000 万元'};edited.profile.provenance={amount:{origin:'declared',time,quote:'3000 万元'+'x'.repeat(1500)}};
  const next=prepareWorkspace(edited,old,time);assert.equal(next.profile.history.length,200);assert.equal(next.profile.provenance.amount.quote.length,1000);
});
test('editing a profile field drops the stale quote while preserving historical evidence',()=>{
  const first=blankWorkspace();first.profile.answers={amount:'500 万元'};first.profile.provenance={amount:{origin:'declared',time,quote:'计划融资 500 万元'}};
  const old=prepareWorkspace(first,blankWorkspace(),time);
  const edited=structuredClone(old);edited.profile.answers.amount='3000 万元';
  const next=prepareWorkspace(edited,old,'2026-10-10T12:00:00.000Z');
  assert.equal(next.profile.provenance.amount.quote,undefined);assert.equal(next.profile.history[0].quote,undefined);
  assert.equal(next.profile.history[0].after,'3000 万元');
  assert.ok(next.profile.history.some(item=>item.after==='500 万元'&&item.quote==='计划融资 500 万元'));
  edited.profile.provenance.amount.quote='最新计划融资 3000 万元';
  assert.equal(prepareWorkspace(edited,old,time).profile.provenance.amount.quote,'最新计划融资 3000 万元');
  edited.profile.provenance.amount.quote='与新金额无关的资料原文';
  assert.equal(prepareWorkspace(edited,old,time).profile.provenance.amount.quote,undefined);
});
test('mutual confirmation is required for every active stage from 双方确认',()=>{
  for(const stage of stages.slice(2,-1))assert.throws(()=>transition(deal(),deal({stage})),/双方意向/);
  assert.doesNotThrow(()=>transition(deal(),deal({stage:'意向沟通'})));
  const confirmed=transition(deal(),deal({stage:'双方确认',mutual:true}));
  assert.equal(confirmed.deals[0].history[0].from,'研究中');assert.equal(confirmed.deals[0].history[0].to,'双方确认');
});
test('sequential advancement succeeds and records server-derived transitions',()=>{
  let prior=deal({stage:'双方确认',mutual:true});
  for(const stage of stages.slice(3,-1)){
    const result=transition(prior,{...prior,stage,history:[{time:'fake',from:'fake',to:'fake',note:'fake'}]});
    assert.equal(result.deals[0].history[0].from,prior.stage);assert.equal(result.deals[0].history[0].to,stage);assert.equal(result.deals[0].history[0].time,time);
    prior=result.deals[0];
  }
  assert.equal(prior.history.length,4);
  assert.throws(()=>transition(deal({stage:'双方确认',mutual:true}),deal({stage:'决策记录',mutual:true})),/逐步/);
});
test('closure needs a reason, can happen early, and cannot be reopened',()=>{
  assert.throws(()=>transition(deal(),deal({stage:'已关闭',closeReason:'  '})),/原因/);
  const closed=transition(deal(),deal({stage:'已关闭',closeReason:'策略不匹配'})).deals[0];
  assert.equal(closed.history[0].note,'策略不匹配');
  assert.throws(()=>transition(closed,{...closed,stage:'研究中'}),/已关闭/);
  assert.throws(()=>transition(deal(),deal({stage:'安排会议',mutual:true})),/无效/);
});
test('bounded workspace collections preserve recent messages and immutable prior history',()=>{
  const input=blankWorkspace();
  input.events=Array.from({length:220},(_,i)=>({id:String(i),title:'event',detail:'',time}));
  input.messages=Array.from({length:60},(_,i)=>({role:'user',content:String(i)}));
  input.scans=Array.from({length:40},(_,i)=>({id:String(i)}));input.capitalSearches=Array.from({length:25},(_,i)=>({id:String(i)}));
  input.signals=Array.from({length:550},(_,i)=>({id:String(i),entityId:'x',kind:'view',time}));input.seen=Array.from({length:1100},(_,i)=>String(i));
  input.deals=[deal({tasks:Array.from({length:120},()=>({text:'review',done:false})),approvals:Array.from({length:120},()=>({time,action:'模拟',preview:'',mode:'simulation'}))})];
  const result=prepareWorkspace(input,blankWorkspace(),time);
  assert.equal(result.events.length,200);assert.equal(result.messages.length,50);assert.equal(result.messages[0].content,'10');assert.equal(result.scans.length,30);assert.equal(result.capitalSearches.length,20);assert.equal(result.signals.length,500);assert.equal(result.seen.length,1000);assert.equal(result.seen[0],'100');assert.equal(result.deals[0].tasks.length,100);assert.equal(result.deals[0].approvals.length,100);
  assert.equal(normalizeWorkspace({}).settings.knowledge,true);
});
test('new transactions cannot start at a late workflow stage',()=>{
  assert.throws(()=>prepareWorkspace(workspace(deal({stage:'决策记录',mutual:true})),blankWorkspace(),time),/研究|新建|阶段|初始/);
});
test('mutual confirmation must be a boolean, never a truthy string',()=>{
  assert.throws(()=>transition(deal(),deal({stage:'双方确认',mutual:'false'})),/确认|布尔|boolean|格式/);
});
test('transaction identity and initial intent cannot be forged',()=>{
  assert.throws(()=>prepareWorkspace(workspace(deal({mutual:true})),blankWorkspace(),time),/新交易|研究|确认/);
  assert.throws(()=>prepareWorkspace({...blankWorkspace(),deals:[deal(),deal()]},blankWorkspace(),time),/重复/);
  assert.throws(()=>transition(deal(),deal({entityId:'another-entity'})),/主体|替换/);
});
