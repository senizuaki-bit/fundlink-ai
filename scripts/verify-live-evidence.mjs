import assert from 'node:assert/strict';
const base=process.env.FUNDLINK_TEST_URL;
if(!base){console.log('SKIP: set FUNDLINK_TEST_URL for local evidence endpoint integration');process.exit(0)}
const login=await fetch(base+'/signin-with-chatgpt?return_to=/',{redirect:'manual'});
const cookie=login.headers.get('set-cookie').split(';')[0],headers={cookie,'Content-Type':'application/json'};
const post=async(body,role='investor')=>{const res=await fetch(base+'/api/knowledge?role='+role,{method:'POST',headers,body:JSON.stringify(body)});const data=await res.json();return {status:res.status,data}};
let id;
try{
 const a=await post({action:'manual-claim',entityName:'验收临时主体-'+Date.now(),metric:'ARR',value:'1200',unit:'万元',currency:'CNY',period:'2026-09',scope:'集团',excerpt:'验收模拟资料：集团 2026-09 ARR 为人民币 1200 万元。'});assert.equal(a.status,200,JSON.stringify(a.data));id=a.data.entity.id;
 const b=await post({action:'manual-claim',entityId:id,metric:'营业收入',value:'400',unit:'万元',currency:'CNY',period:'2025',scope:'集团',excerpt:'验收模拟资料：集团 2025 年营业收入为人民币 400 万元。'});assert.equal(b.status,200,JSON.stringify(b.data));
 const finding=b.data.findings.find(f=>f.title.includes('ARR'));assert.ok(finding);assert.equal(finding.comparison,'incomparable');assert.equal(finding.sourceIds.length,2);
 assert.equal((await post({action:'research',entityId:id},'founder')).status,404);
 assert.equal((await post({action:'review',id:finding.id,status:'explained',note:''})).status,400);
 assert.equal((await post({action:'review',id:finding.id,status:'explained',note:'验收：已确认两者期间与定义不同，不作为造假判断。'})).status,200);
 const checked=await post({action:'research',entityId:id});assert.equal(checked.data.findings.find(f=>f.id===finding.id).reviewStatus,'explained');
 const rag=await post({action:'query',query:'请核查收入与 ARR 的证据',entityId:id});assert.equal(rag.status,200);assert.equal(rag.data.sources.length,2);
 console.log('PASS: persisted claims, ARR/revenue incomparable, linked source IDs, role isolation, required review note, review persistence, Chinese evidence retrieval');
}finally{if(id)assert.equal((await post({action:'delete',id,kind:'entity'})).status,200)}
