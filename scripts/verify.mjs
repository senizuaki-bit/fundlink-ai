import assert from 'node:assert/strict';
import {amounts,matchEntity,companies,funds,sampleProfile} from '../lib/catalog.ts';
import {blankWorkspace} from '../lib/model.ts';
import {extractDeclared} from '../lib/onboarding.ts';
assert.deepEqual(amounts("30000000 元"),[3000,3000]);
assert.deepEqual(amounts("5,000 万至 1 亿"),[5000,10000]);
assert.deepEqual(amounts("500–1,000 万元"),[500,1000]);
assert.equal(amounts("3000 万港元"),null);
assert.equal(amounts("USD 500000"),null);
const founder={...blankWorkspace(),profile:sampleProfile("founder")};
assert.equal(matchEntity(funds.find(e=>e.id==="vita"),founder,"founder").eligible,false);
assert.equal(matchEntity(funds.find(e=>e.id==="horizon"),founder,"founder").eligible,true);
const investor={...blankWorkspace(),profile:sampleProfile("investor")};
assert.equal(matchEntity(companies.find(e=>e.id==="kinetic"),investor,"investor").eligible,false);
const a=matchEntity(companies[0],{...investor,settings:{...investor.settings,learning:false}},"investor");
const b=matchEntity(companies[0],{...investor,interested:[companies[0].id],settings:{...investor.settings,learning:false}},"investor");
assert.equal(a.score,b.score);
const consented={...investor,settings:{...investor.settings,learning:true,learningConsent:{version:1,grantedAt:new Date(Date.now()-1000).toISOString()}},signals:[{id:"interest",entityId:companies[0].id,kind:"interest",time:new Date().toISOString()}]};
assert.ok(matchEntity(companies[0],consented,"investor").score>matchEntity(companies[0],investor,"investor").score);
assert.ok(matchEntity(funds[0],{...founder,profile:{...founder.profile,answers:{...founder.profile.answers,goals:"产业客户、供应链资源"}}},"founder").score>matchEntity(funds[0],{...founder,profile:{...founder.profile,answers:{...founder.profile.answers,goals:"技术支持"}}},"founder").score);
assert.equal(extractDeclared("我们是风险投资 VC，关注人工智能，投资3000万元","investor").amount,"3000万");
console.log("PASS: 11 matching, unit, preference and extraction assertions");
const base=process.env.FUNDLINK_TEST_URL;
if(base){
 const unauth=await fetch(base+"/api/state?role=investor");assert.equal(unauth.status,401);
 const login=await fetch(base+"/signin-with-chatgpt?return_to=/",{redirect:"manual"});const cookie=login.headers.get("set-cookie").split(";")[0];
 const headers={cookie};
 const state=await fetch(base+"/api/state?role=investor",{headers}).then(r=>r.json());assert.ok(state.profile);
 const stale=await fetch(base+"/api/state?role=investor",{method:"PUT",headers:{...headers,"Content-Type":"application/json"},body:JSON.stringify({...state,version:-1})});assert.equal(stale.status,409);
 const forbidden=await fetch(base+"/api/state?role=investor",{method:"PUT",headers:{...headers,"Content-Type":"application/json",Origin:"https://wrong.example"},body:JSON.stringify(state)});assert.equal(forbidden.status,403);
 const form=new FormData();form.append("file",new Blob(["Business plan. Customer contracts: 20. Revenue: 400 wan. ARR: 1200 wan. Cash burn: 50 wan per month. Fundraising: 3000 wan. Founder team owns intellectual property."],{type:"text/plain"}),"fundlink-qa.txt");
 const upload=await fetch(base+"/api/files?role=investor",{method:"POST",headers,body:form});const file=await upload.json();assert.equal(upload.status,201);
 try{
  const denied=await fetch(base+"/api/files?role=founder&id="+file.id,{headers});assert.equal(denied.status,404);
  const parsed=await fetch(base+"/api/analyze?role=investor",{method:"POST",headers:{...headers,"Content-Type":"application/json"},body:JSON.stringify({id:file.id})});const result=await parsed.json();assert.equal(parsed.status,200,JSON.stringify(result));assert.ok(result.content.includes("fundlink-qa.txt"));assert.ok(result.checks.some(c=>c.found));
  const content=await fetch(base+"/api/files?role=investor&id="+file.id,{headers});assert.equal(content.status,200);assert.ok((await content.text()).includes("Business plan"));
 }finally{const removed=await fetch(base+"/api/files?role=investor&id="+file.id,{method:"DELETE",headers});assert.equal(removed.status,200)}
 console.log("PASS: authentication, conflict protection, origin checks, file upload, role isolation, source analysis, download, cleanup");
}

