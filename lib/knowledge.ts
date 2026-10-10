import type {Role} from "./model";

export type Visibility = "public" | "private";
export type ClaimType = "public_fact" | "self_disclosed" | "model_inference" | "human_verified";
export type ReviewStatus = "pending" | "explained" | "verified" | "false_positive" | "inconclusive";
export type KnowledgeEntity = {id:string;name:string;kind:"company"|"fund"|"repository"|"model"|"paper"|"organization"|"announcement";canonicalUrl:string;status:"discovered"|"user_provided";summary:string;profile:Record<string,string>;createdAt:string;updatedAt:string};
export type SourceItem = {id:string;entityId:string;type:string;title:string;url:string;canonicalUrl:string;excerpt:string;publishedAt:string|null;collectedAt:string;visibility:Visibility;claimType:ClaimType;contentHash:string;lineageKey:string;documentId:string|null;extractionMode:"model"|"rules";extractionNote:string};
export type EvidenceClaim = {id:string;subjectId:string;metric:string;value:string;unit:string;currency:string;period:string;scope:string;sourceId:string;excerpt:string;publishedAt:string|null;collectedAt:string;claimType:ClaimType;status:"unverified"|"verified"|"disputed";visibility:Visibility;confidence:"low"|"medium"|"high"};
export type KnowledgeRelationship = {id:string;subjectId:string;objectId:string;type:string;status:"suspected"|"confirmed";sourceId:string|null;note:string;createdAt:string};
export type RiskFinding = {id:string;entityId:string;title:string;finding:string;category:"financial"|"identity"|"evidence"|"capital"|"technology";priority:"low"|"medium"|"high";comparison:"consistent"|"different"|"incomparable"|"insufficient";claimIds:string[];sourceIds:string[];hypotheses:string[];nextAction:string;reviewStatus:ReviewStatus;reviewNote:string;createdAt:string};
export type KnowledgeRun = {id:string;action:string;status:"success"|"partial"|"failed";query:string;source:string;entityIds:string[];sourceIds:string[];message:string;createdAt:string};
export type KnowledgeSnapshot = {entities:KnowledgeEntity[];sources:SourceItem[];claims:EvidenceClaim[];relationships:KnowledgeRelationship[];findings:RiskFinding[];runs:KnowledgeRun[]};
export type EvidenceComparison = Pick<RiskFinding,"comparison"|"finding"|"hypotheses"|"nextAction"|"priority"> & {independent:boolean};
export type DiscoverySource = "github"|"huggingface"|"arxiv"|"website"|"fund"|"news"|"fund-news";
export type DiscoveryInput = {source:DiscoverySource;query?:string;url?:string;entityId?:string};
export type DiscoveryItem = {id:string;entityId:string;sourceId:string;name:string;description:string;url:string;metric:string;updated:string|null;collected:string;source:string;claimed:false};
export type WatchCategory = "financing"|"team"|"product"|"activity"|"content";
export type WatchEvent = {entityId:string;name:string;changed:boolean;message:string;status:"changed"|"unchanged"|"failed"|"skipped";sourceId?:string;previousSourceId?:string;url?:string;categories:WatchCategory[];evidence?:string[]};
export type WatchProgress = {total:number;processed:number;remaining:number;nextCursor:string|null};

/** Only an explicit, human-confirmed identity relation expands a subject's research boundary. */
export function confirmedIdentityIds(entityId:string,relationships:KnowledgeRelationship[]){
  const ids=new Set([entityId]);let changed=true;
  while(changed){changed=false;for(const r of relationships){if(r.type!=="SAME_ENTITY_CANDIDATE"||r.status!=="confirmed")continue;if(ids.has(r.subjectId)&&!ids.has(r.objectId)){ids.add(r.objectId);changed=true}if(ids.has(r.objectId)&&!ids.has(r.subjectId)){ids.add(r.subjectId);changed=true}}}
  return [...ids];
}
export function researchScope(snapshot:Pick<KnowledgeSnapshot,"entities"|"relationships">,entityId:string){
  const ids=confirmedIdentityIds(entityId,snapshot.relationships),entities=snapshot.entities.filter(e=>ids.includes(e.id));
  return {rootEntityId:entityId,entityIds:entities.map(e=>e.id),entityNames:entities.map(e=>e.name),basis:ids.length>1?"仅纳入人工确认属于同一主体的资料；保留原主体及来源，不合并或改写事实。":"仅当前主体的资料；疑似关联、维护、持有及投资关系不会扩展研究范围。"};
}
/** Category labels describe changed words, never assert that a business event really happened. */
export function classifySourceChange(previous:string,current:string){
  const oldParts=new Set(previous.split(/[。；;\n]/).map(s=>s.trim()).filter(Boolean));
  const added=current.split(/[。；;\n]/).map(s=>s.trim()).filter(s=>s&&!oldParts.has(s));
  const patterns:[WatchCategory,RegExp][]=[["financing",/融资|募资|投资|基金|fundrais|financing|investment/i],["team",/团队|高管|创始人|招聘|任命|founder|hiring|appointed/i],["product",/发布|上线|产品|版本|release|launch|product/i],["activity",/stars|downloads|commits|updated_at|仓库|下载|活跃/i]];
  const categories=patterns.filter(([,pattern])=>added.some(s=>pattern.test(s))).map(([category])=>category);
  return {categories:categories.length?categories:["content" as WatchCategory],evidence:added.slice(0,3).map(s=>s.slice(0,350))};
}

export function latestPublicSources(sources:SourceItem[]){
  const latest=new Map<string,SourceItem>();
  for(const source of sources){if(source.visibility!=="public"||!/^https?:\/\//i.test(source.url))continue;const key=source.entityId+"\0"+source.canonicalUrl,old=latest.get(key);if(!old||source.collectedAt>old.collectedAt||source.collectedAt===old.collectedAt&&source.id>old.id)latest.set(key,source)}
  return [...latest.values()].sort((a,b)=>(a.entityId+"\0"+a.canonicalUrl).localeCompare(b.entityId+"\0"+b.canonicalUrl));
}

export function canonicalUrl(value:string) {
  const url=new URL(value);url.hash="";
  for(const key of [...url.searchParams.keys()])if(/^utm_|^(fbclid|gclid|ref)$/i.test(key))url.searchParams.delete(key);
  url.searchParams.sort();url.hostname=url.hostname.toLowerCase();
  if(url.pathname!=="/")url.pathname=url.pathname.replace(/\/+$/,"");
  return url.toString();
}
const normalized=(s:string)=>s.trim().toLowerCase().replace(/\s+/g," ");
export function metricKey(s:string){const key=normalized(s);if(/^(arr|年度经常性收入|年化经常性收入)$/.test(key))return "arr";if(/^(revenue|营业收入|确认收入|年度收入|收入)$/.test(key))return "revenue";return key}
function numericValue(c:EvidenceClaim){
  const clean=c.value.replace(/[,，\s]/g,"");if(!/^-?\d+(\.\d+)?$/.test(clean))return null;
  const units:Record<string,{base:string;factor:number}>={"":{base:"number",factor:1},"元":{base:"money",factor:1},"万元":{base:"money",factor:1e4},"亿元":{base:"money",factor:1e8},"million":{base:"number",factor:1e6},"billion":{base:"number",factor:1e9},"thousand":{base:"number",factor:1e3},"%":{base:"percent",factor:1},"stars":{base:"stars",factor:1},"downloads":{base:"downloads",factor:1}};
  const unit=units[normalized(c.unit)]??{base:normalized(c.unit),factor:1};
  const n=Number(clean)*unit.factor;return Number.isFinite(n)?{value:n,base:c.currency&&unit.base==="number"?"money":unit.base}:null;
}
export function compareClaims(a:EvidenceClaim,b:EvidenceClaim,sources:SourceItem[]=[],relationships:KnowledgeRelationship[]=[]):EvidenceComparison {
  const sa=sources.find(s=>s.id===a.sourceId),sb=sources.find(s=>s.id===b.sourceId);
  // Unknown provenance is never treated as proof of source independence.
  const independent=!!sa&&!!sb&&sa.id!==sb.id&&sa.lineageKey!==sb.lineageKey&&sa.contentHash!==sb.contentHash&&sa.canonicalUrl!==sb.canonicalUrl;
  const base={independent,hypotheses:[] as string[],priority:"medium" as const};
  const cannot=(finding:string,nextAction:string,hypotheses:string[]=[]):EvidenceComparison=>({...base,comparison:"incomparable",finding,nextAction,hypotheses});
  if(a.subjectId!==b.subjectId&&!confirmedIdentityIds(a.subjectId,relationships).includes(b.subjectId))return cannot("主体不同，尚不能直接比较。","仅在人工确认属于同一主体后进行指标对齐；投资、拥有或维护关系不足以证明主体相同。");
  const am=metricKey(a.metric),bm=metricKey(b.metric);
  if(am!==bm){if(new Set([am,bm]).has("arr")&&new Set([am,bm]).has("revenue"))return cannot("ARR 为时点年化经常性指标，营业收入为期间确认指标，不能直接相减或据此认定财务错误。","索取订阅合同、生效日、收入确认政策及回款流水，对齐时点与会计期间。",["可能存在合同生效时间差异。","可能存在经常性与非经常性收入分类差异；这些解释尚未核实。"]);return cannot("指标口径不同，不能直接比较。","确认指标定义、计算公式与统计边界。");}
  if(!a.period||!b.period||!a.scope||!b.scope)return {...base,comparison:"insufficient",finding:"缺少期间或统计范围，尚无足够证据进行数值比较。",nextAction:"补充精确期间、主体范围与指标定义。"};
  if(normalized(a.period)!==normalized(b.period))return cannot("统计期间或时点不同，差异可能反映时间变化。","获取同一期间或同一时点的披露。");
  if(normalized(a.scope)!==normalized(b.scope))return cannot("统计范围不同，尚不能直接比较。","确认合并范围、产品线、地域及业务口径。");
  if(normalized(a.currency)!==normalized(b.currency))return cannot("币种不一致，尚未使用经确认的汇率换算。","确认币种和适用汇率日期后再比较。");
  if(["arr","revenue"].includes(am)&&(!a.currency||!b.currency||!a.unit||!b.unit))return {...base,comparison:"insufficient",finding:"财务指标缺少明确币种或单位，尚不能比较数值。",nextAction:"补充两份原始披露中的币种与计量单位。"};
  const av=numericValue(a),bv=numericValue(b);
  if(!av||!bv)return {...base,comparison:"insufficient",finding:"当前主张不是可精确比较的数值，需人工核实原文。",nextAction:"查阅原始资料，补充可复核的数值与定义。"};
  if(av.base!==bv.base)return cannot("计量单位不同或无法安全换算。","核对单位并补充明示换算依据。");
  const same=Math.abs(av.value-bv.value)<=Math.max(1,Math.abs(av.value),Math.abs(bv.value))*1e-8;
  if(same)return {...base,comparison:"consistent",priority:"low",finding:independent?"同主体、期间、范围、币种与单位下，数值一致；来源独立性仍需人工核实。":"对齐后的数值一致，但同源、转载或未知来源不能作为独立验证。",nextAction:independent?"核实来源是否独立、是否引用同一披露。":"寻找独立原始证据，避免把转载数量当作证据强度。"};
  return {...base,comparison:"different",priority:"high",finding:`同一比较口径下存在数值差异（${av.value} 与 ${bv.value}），需要复核，不能据此认定欺诈。`,hypotheses:["可能为版本更新、四舍五入、录入错误或尚未披露的口径差异；均为待核实假设。"],nextAction:"核对原件、修订日期和计算明细，请资料提供方解释差异。"};
}

export function deriveFindings(entity:KnowledgeEntity,claims:EvidenceClaim[],sources:SourceItem[],relationships:KnowledgeRelationship[]):Omit<RiskFinding,"id"|"createdAt">[]{
  const results:Omit<RiskFinding,"id"|"createdAt">[]=[];
  const append=(title:string,comparison:EvidenceComparison,cs:EvidenceClaim[],category:RiskFinding["category"]="financial")=>results.push({entityId:entity.id,title,category,claimIds:cs.map(c=>c.id),sourceIds:[...new Set(cs.map(c=>c.sourceId))],reviewStatus:"pending",reviewNote:"",...comparison});
  const scopeIds=new Set(confirmedIdentityIds(entity.id,relationships));
  const own=claims.filter(c=>scopeIds.has(c.subjectId)).slice(0,100);
  sources=sources.filter(s=>scopeIds.has(s.entityId));
  for(let i=0;i<own.length&&results.length<40;i++)for(let j=i+1;j<own.length&&results.length<40;j++){
    const a=own[i],b=own[j];if(a.sourceId===b.sourceId&&metricKey(a.metric)===metricKey(b.metric))continue;
    const keys=[metricKey(a.metric),metricKey(b.metric)];if(keys[0]!==keys[1]&&!(keys.includes("arr")&&keys.includes("revenue")))continue;
    append(keys.includes("arr")&&keys.includes("revenue")?"ARR 与营业收入口径核查":"跨源指标核查",compareClaims(a,b,sources,relationships),[a,b]);if(results.length>=40)break;
  }
  const affirmed=(text:string,pattern:RegExp)=>[...text.matchAll(pattern)].some(m=>!/(未|没有|并非|不代表|不能认定)/.test(text.slice(Math.max(0,(m.index??0)-8),m.index)));
  const researchSources=sources.filter(s=>affirmed(s.excerpt,/(?:研发|研发进展|技术研发)(?:工作|进展|速度)?(?:正常|高速|快速|稳步|持续推进|高速推进)|(?:R&D|research and development)\s+(?:is\s+)?(?:accelerating|progressing normally)/gi));
  const activitySources=sources.filter(s=>s.visibility==="public"&&affirmed(s.excerpt,/(?:公开|开源|GitHub|仓库)(?:[^。；;\n]{0,16})(?:更新|提交|活跃度)(?:数量|频率|次数)?(?:明显|持续|有所)?(?:下降|减少|放缓)|(?:public commits|repository activity|GitHub activity)\s+(?:has\s+)?(?:decreased|declined|slowed)/gi));
  const hiringSources=sources.filter(s=>s.visibility==="public"&&affirmed(s.excerpt,/(?:招聘职位|招聘岗位|招聘数量|招聘人数|开放岗位)(?:数量)?(?:明显|持续|有所)?(?:下降|减少)|(?:job openings|hiring)\s+(?:has\s+)?(?:decreased|declined|slowed)/gi));
  if(researchSources.length&&activitySources.length&&researchSources.some(a=>activitySources.some(b=>a.id!==b.id))){
    const involved=[...new Set([...researchSources,...activitySources,...hiringSources].map(s=>s.id))];
    results.push({entityId:entity.id,title:"公开活动与研发自述需交叉核实",category:"technology",priority:"medium",comparison:"insufficient",finding:"资料同时包含研发正常推进的自述与公开开发活动减少的披露"+(hiringSources.length?"，并包含招聘岗位减少的披露":"")+"。这些信号不能证明研发停滞、经营压力或因果关系。",claimIds:own.filter(c=>involved.includes(c.sourceId)).slice(0,8).map(c=>c.id),sourceIds:involved,hypotheses:["公开项目可能迁移到私有仓库。","产品可能进入成熟维护阶段，公开迭代需求减少。","研发或招聘节奏可能因战略调整而变化。","经营压力也是待核实解释之一，现有证据不能确认。"],nextAction:"先确认来源属于同一主体及相同观察期间；查阅产品 Release，访谈研发负责人，核对团队配置、研发费用和经营现金流。",reviewStatus:"pending",reviewNote:""});
  }
  const unconfirmed=relationships.filter(r=>(r.subjectId===entity.id||r.objectId===entity.id)&&r.status==="suspected");
  if(["repository","model","paper","announcement"].includes(entity.kind)||unconfirmed.length)append("主体关联待确认",{comparison:"insufficient",finding:"公开项目、论文作者、新闻公告或机构之间的关联尚未证明法人归属或代表权限。",priority:"medium",hypotheses:[],nextAction:"核验官网互链、法人名称与维护者授权，人工确认实体关系。",independent:false},own.slice(0,3),"identity");
  if(entity.kind==="fund")append("当前资金能力与合作意愿待确认",{comparison:"insufficient",finding:"官网策略或历史投资记录不代表当前可投余额、决策速度或接洽意愿。",priority:"medium",hypotheses:[],nextAction:"直接确认当前基金主体、可投额度、投资策略与决策流程。",independent:false},own.slice(0,3),"capital");
  if(!results.length)append("证据覆盖不足",{comparison:"insufficient",finding:"现有资料尚不足以形成跨源、同口径核查结论。",priority:"medium",hypotheses:[],nextAction:"补充原始披露、独立来源或授权资料，并明确指标期间与统计范围。",independent:false},own.slice(0,3),"evidence");
  return results.slice(0,40);
}

export function evidenceQueryTerms(query:string){
  const text=normalized(query),terms=new Set<string>();
  for(const token of text.match(/[a-z][a-z0-9_.-]{1,}|\d{4}/g)??[])if(!["the","and","for","please","search","find","analyze"].includes(token))terms.add(token);
  const stop=new Set(["帮我","一下","这个","这家","公司","企业","关于","分析","看看","是否","有没","没有","什么","如何","查询","查找","搜索","情况","请问","我们","他们","它的","一下","目前","现在"]);
  for(const phrase of text.match(/[\u3400-\u9fff]+/g)??[]){if(phrase.length<=4&&!stop.has(phrase))terms.add(phrase);for(let i=0;i<phrase.length-1;i++){const term=phrase.slice(i,i+2);if(!stop.has(term))terms.add(term);}}
  const concepts=[["收入","营收","revenue"],["arr","年化","经常性"],["现金","cash","burn","净消耗"],["基金","fund","venture"],["团队","创始","founder","team"],["融资","fundraising"],["模型","model","hugging"],["客户","customer","client"],["开源","github","repository"],["论文","paper","arxiv"],["投资策略","investment strategy","投资方向"]];
  for(const group of concepts)if(group.some(term=>text.includes(term)))group.forEach(term=>terms.add(term));
  return [...terms].slice(0,60);
}
export function retrieveEvidence(snapshot:KnowledgeSnapshot,query:string,entityId?:string){
  const terms=evidenceQueryTerms(query),score=(text:string)=>terms.reduce((n,t)=>n+(normalized(text).includes(t)?Math.min(t.length,6):0),0);
  const scope=entityId?researchScope(snapshot,entityId):null;
  const ranked=snapshot.entities.filter(e=>!scope||scope.entityIds.includes(e.id)).map(entity=>({entity,score:score(entity.name+" "+entity.summary)*2+snapshot.claims.filter(c=>c.subjectId===entity.id).reduce((n,c)=>Math.max(n,score(c.metric+" "+c.value+" "+c.excerpt)),0)+snapshot.sources.filter(s=>s.entityId===entity.id).reduce((n,s)=>Math.max(n,score(s.title+" "+s.excerpt)),0)}));
  const entities=ranked.filter(e=>entityId||!query.trim()||e.score>0).sort((a,b)=>b.score-a.score).slice(0,20).map(e=>e.entity),ids=new Set(entities.map(e=>e.id));
  const sources=snapshot.sources.filter(s=>ids.has(s.entityId)).sort((a,b)=>score(b.title+" "+b.excerpt)-score(a.title+" "+a.excerpt)).slice(0,40),sourceIds=new Set(sources.map(s=>s.id));
  const claims=snapshot.claims.filter(c=>ids.has(c.subjectId)&&sourceIds.has(c.sourceId)).sort((a,b)=>score(b.excerpt+" "+b.metric)-score(a.excerpt+" "+a.metric)).slice(0,60);
  return {entities,sources,claims,scope,relationships:snapshot.relationships.filter(r=>ids.has(r.subjectId)||ids.has(r.objectId)),findings:snapshot.findings.filter(f=>ids.has(f.entityId)&&f.sourceIds.every(id=>sourceIds.has(id))),limitations:["关键词与概念检索仅覆盖当前账户与当前身份已采集的证据，最多返回 20 个主体、40 个来源。","公开披露和模型抽取均不等于已验证事实；只有人工确认的同一主体关系会扩展研究，其他关联保持独立。"]};
}
export function allowedSource(role:Role,source:DiscoverySource){return role==="investor"||["website","fund","news","fund-news"].includes(source)}
