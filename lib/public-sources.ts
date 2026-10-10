import {canonicalUrl,type DiscoveryInput,type DiscoverySource,type KnowledgeEntity,type ClaimType} from "./knowledge";

export class PublicSourceError extends Error {status:number;constructor(message:string,status=400){super(message);this.status=status}}
export type PublicRecord = {name:string;kind:KnowledgeEntity["kind"];url:string;type:DiscoverySource;description:string;text:string;publishedAt:string|null;metric:string;claimType:ClaimType;lineageKey?:string;structuredClaims?:{metric:string;value:string;unit:string;period:string;scope:string;excerpt:string}[]};
const MAX_BYTES=1_500_000;
export function validatePublicUrl(input:string){
  let url:URL;try{url=new URL(input)}catch{throw new PublicSourceError("请输入完整的 HTTPS 公开网址。");}
  const host=url.hostname.toLowerCase();
  if(url.protocol!=="https:"||url.username||url.password||(url.port&&url.port!=="443")||!host.includes(".")||host.endsWith(".")||/^[\d.]+$/.test(host)||host.includes(":")||/(^|\.)(localhost|local|internal|lan|home|test|invalid|example|onion)$/.test(host)||host==="metadata.google.internal"||host.endsWith(".workers.dev")&&host.startsWith("localhost"))throw new PublicSourceError("仅支持无凭据、默认端口的公开 HTTPS 域名；不允许本地或内网地址。");
  return url;
}
export function isPublicAddress(ip:string){
  if(ip.includes(":")){
    const s=ip.toLowerCase();
    // Conservatively permit only globally routed unicast IPv6, excluding special-use ranges.
    return /^[23][0-9a-f]{0,3}:/.test(s)&&!/^2001:(?:0:|db8:|10:|20:)/.test(s)&&!/^2002:/.test(s);
  }
  const a=ip.split(".").map(Number);if(a.length!==4||a.some(v=>!Number.isInteger(v)||v<0||v>255))return false;
  return !(a[0]===0||a[0]===10||a[0]===127||a[0]>=224||a[0]===169&&a[1]===254||a[0]===172&&a[1]>=16&&a[1]<=31||a[0]===192&&(a[1]===168||a[1]===0||a[1]===2)||a[0]===100&&a[1]>=64&&a[1]<=127||a[0]===198&&(a[1]===18||a[1]===19||a[1]===51)||a[0]===203&&a[1]===0&&a[2]===113);
}
async function checkDns(hostname:string,fetcher:typeof fetch,signal:AbortSignal){
  const responses=await Promise.all(["A","AAAA"].map(type=>fetcher("https://cloudflare-dns.com/dns-query?name="+encodeURIComponent(hostname)+"&type="+type,{headers:{Accept:"application/dns-json"},signal,redirect:"manual"})));
  const answers: {type:number;data:string}[]=[];
  for(const response of responses){if(!response.ok)throw new PublicSourceError("无法验证公开域名，请稍后重试。",502);const data=JSON.parse(await readLimited(response)) as {Answer?:{type:number;data:string}[]};answers.push(...(data.Answer??[]));}
  const addresses=answers.filter(a=>a.type===1||a.type===28);
  if(!addresses.length||addresses.some(a=>!isPublicAddress(a.data)))throw new PublicSourceError("该域名未解析到允许的公开地址。");
}
async function readLimited(response:Response){
  if(Number(response.headers.get("content-length"))>MAX_BYTES)throw new PublicSourceError("页面超过 1.5 MB 采集上限。");
  if(!response.body)return "";const reader=response.body.getReader();let size=0;const chunks:Uint8Array[]=[];
  try{while(true){const {value,done}=await reader.read();if(done)break;size+=value.byteLength;if(size>MAX_BYTES)throw new PublicSourceError("页面超过 1.5 MB 采集上限。");chunks.push(value)}}finally{await reader.cancel().catch(()=>{});}
  const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength}return new TextDecoder().decode(bytes);
}
export async function fetchPublicPage(input:string,fetcher:typeof fetch=fetch){
  let url=validatePublicUrl(input);const signal=AbortSignal.timeout(18000);
  for(let redirects=0;redirects<=3;redirects++){
    await checkDns(url.hostname,fetcher,signal);
    const response=await fetcher(url.toString(),{signal,redirect:"manual",headers:{Accept:"text/html,text/plain,application/json,application/atom+xml","User-Agent":"FundLink-Research/1.0"}});
    if([301,302,303,307,308].includes(response.status)){const location=response.headers.get("location");await response.body?.cancel();if(!location||redirects===3)throw new PublicSourceError("网页重定向次数过多或缺少目标。");url=validatePublicUrl(new URL(location,url).toString());continue;}
    if(!response.ok)throw new PublicSourceError("公开页面不可用或要求登录，请选择无需登录的资料。",502);
    const type=response.headers.get("content-type")??"";if(!/(text\/|json|xml)/i.test(type))throw new PublicSourceError("仅采集公开文本页面；PDF 请下载后通过资料中心导入。");
    const html=await readLimited(response);return {url:canonicalUrl(url.toString()),html};
  }
  throw new PublicSourceError("无法读取公开页面。",502);
}
function decode(s:string){return s.replace(/&#(x?[\da-f]+);/gi,(_,n:string)=>{const code=parseInt(n.startsWith("x")?n.slice(1):n,n.startsWith("x")?16:10);return code>0&&code<=0x10ffff?String.fromCodePoint(code):""}).replace(/&amp;/g,"&").replace(/&lt;/g,"<").replace(/&gt;/g,">").replace(/&quot;/g,'"').replace(/&#39;|&apos;/g,"'").replace(/&nbsp;/g," ");}
export function cleanPublicText(html:string){return decode(html.replace(/<(script|style|nav|noscript|svg|header|footer)\b[^>]*>[\s\S]*?<\/\1>/gi," ").replace(/<[^>]+>/g," ")).replace(/\s+/g," ").trim().slice(0,50000)}
async function apiJson(url:string,fetcher:typeof fetch=fetch){const res=await fetcher(url,{headers:{Accept:"application/json","User-Agent":"FundLink-Research/1.0"},signal:AbortSignal.timeout(18000),redirect:"manual"});if(!res.ok)throw new PublicSourceError(res.status===403||res.status===429?"公开源暂时限流，请稍后重试。":"公开数据源暂不可用。",502);return JSON.parse(await readLimited(res));}
function date(value:unknown):string|null{if(typeof value!=="string"||!Number.isFinite(Date.parse(value)))return null;return new Date(value).toISOString()}
export async function collectPublicSources(input:DiscoveryInput,environment:Record<string,string|undefined>={},fetcher:typeof fetch=fetch):Promise<{records:PublicRecord[];notice:string}>{
  const query=String(input.query??"").slice(0,180),now=new Date().toISOString();
  if(input.url){const page=await fetchPublicPage(input.url,fetcher);const text=cleanPublicText(page.html);if(text.length<40)throw new PublicSourceError("页面可读文本不足，可能需要 JavaScript 或登录；请另选公开页面。");const title=decode(page.html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]??new URL(page.url).hostname).replace(/\s+/g," ").slice(0,180);const published=page.html.match(/(?:article:published_time|datePublished)["'\s:=]+(?:content=["'])?([^"'<>\s]+)/i)?.[1];const syndication=page.html.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i)?.[1];let lineageKey=new URL(page.url).hostname;try{if(syndication)lineageKey=canonicalUrl(new URL(syndication,page.url).toString())}catch{}
    return {records:[{name:title,kind:input.source==="news"||input.source==="fund-news"?"announcement":input.source==="fund"?"fund":"company",url:page.url,type:input.source,description:text.slice(0,500),text,publishedAt:date(published),metric:"公开页面 · 待核实",claimType:input.source==="news"||input.source==="fund-news"?"public_fact":"self_disclosed",lineageKey}],notice:"官网内容属于主体自述；页面未公开的发布时间保持未知。"};}
  if(input.source==="website"||input.source==="fund")throw new PublicSourceError("请输入企业或基金的公开 HTTPS 网址。");
  if(!query.trim())throw new PublicSourceError("请输入搜索关键词。");
  if(input.source==="github"){
    const data=await apiJson("https://api.github.com/search/repositories?q="+encodeURIComponent(query)+"&sort=updated&per_page=6",fetcher);
    return {records:(data.items??[]).map((x:Record<string,unknown>)=>{const description=String(x.description??"未提供项目简介"),metric=String(x.stargazers_count??0)+" stars",excerpt=String(x.full_name)+"; description: "+description+"; stars: "+String(x.stargazers_count??0)+"; updated_at: "+String(x.updated_at??"");return {name:String(x.full_name),kind:"repository",url:String(x.html_url),type:"github",description,text:excerpt,publishedAt:date(x.updated_at),metric,claimType:"public_fact",lineageKey:"github:"+x.id,structuredClaims:[{metric:"GitHub stars",value:String(x.stargazers_count??0),unit:"stars",period:now,scope:"repository",excerpt}]}}),notice:"仓库不等于公司，Stars 不代表收入或融资意愿。"};
  }
  if(input.source==="huggingface"){
    const data=await apiJson("https://huggingface.co/api/models?search="+encodeURIComponent(query)+"&sort=downloads&direction=-1&limit=6",fetcher);
    return {records:data.map((x:Record<string,unknown>)=>{const excerpt=String(x.id)+"; pipeline_tag: "+String(x.pipeline_tag??"unknown")+"; downloads: "+String(x.downloads??0);return {name:String(x.id),kind:"model",url:"https://huggingface.co/"+String(x.id),type:"huggingface",description:String(x.pipeline_tag??"模型与研究资产"),text:excerpt,publishedAt:date(x.lastModified),metric:String(x.downloads??0)+" 次下载",claimType:"public_fact",lineageKey:"hf:"+x.id,structuredClaims:[{metric:"Hugging Face downloads",value:String(x.downloads??0),unit:"downloads",period:now,scope:"model",excerpt}]}}),notice:"下载量属于平台活动信号，不等于商业客户。"};
  }
  if(input.source==="arxiv"){
    const response=await fetcher("https://export.arxiv.org/api/query?search_query=all:"+encodeURIComponent(query)+"&start=0&max_results=6&sortBy=submittedDate&sortOrder=descending",{signal:AbortSignal.timeout(18000),redirect:"manual",headers:{"User-Agent":"FundLink-Research/1.0"}});if(!response.ok)throw new PublicSourceError("arXiv 暂不可用，请稍后重试。",502);const xml=await readLimited(response);const entries=xml.match(/<entry>[\s\S]*?<\/entry>/g)??[];
    const tag=(entry:string,name:string)=>decode(entry.match(new RegExp("<"+name+"[^>]*>([\\s\\S]*?)</"+name+">"))?.[1]??"").replace(/\s+/g," ").trim();
    return {records:entries.map(entry=>{const name=tag(entry,"title"),description=tag(entry,"summary"),authors=[...entry.matchAll(/<name>([^<]+)<\/name>/g)].map(m=>decode(m[1])).join(", ");const url=tag(entry,"id").replace(/^http:/,"https:").replace(/v\d+$/,"");return {name,kind:"paper",url,type:"arxiv",description,text:name+"\nAuthors: "+authors+"\n"+description,publishedAt:date(tag(entry,"published")),metric:"研究论文 · 商业主体待核实",claimType:"self_disclosed",lineageKey:url}}),notice:"论文作者与商业主体不自动关联；论文结论属于作者披露。"};
  }
  if(!environment.BRAVE_SEARCH_API_KEY?.trim())throw new PublicSourceError("新闻与基金动态搜索尚未配置公开搜索服务。可直接输入官方公告或基金官网 HTTPS 网址采集；当前未执行新闻搜索。",503);
  const url="https://api.search.brave.com/res/v1/news/search?q="+encodeURIComponent(input.source==="fund-news"?query+" venture fund investment":query)+"&count=6";
  const response=await fetcher(url,{headers:{Accept:"application/json","X-Subscription-Token":environment.BRAVE_SEARCH_API_KEY.trim()},signal:AbortSignal.timeout(18000),redirect:"manual"});if(!response.ok)throw new PublicSourceError("新闻搜索服务暂不可用，请稍后重试。",502);
  const data=JSON.parse(await readLimited(response));const records:PublicRecord[]=[];
  for(const x of (data.results??[]).slice(0,6)){try{const u=validatePublicUrl(String(x.url));records.push({name:String(x.title??u.hostname),kind:"announcement",url:canonicalUrl(u.toString()),type:input.source,description:cleanPublicText(String(x.description??"")),text:cleanPublicText(String(x.title??"")+". "+String(x.description??"")),publishedAt:date(x.meta_url?.published??x.page_age),metric:"新闻搜索摘要 · 原文待核实",claimType:"public_fact",lineageKey:u.hostname})}catch{}}
  return {records,notice:"仅采集搜索服务返回的标题和摘要，不声称已读全文；文章涉及的公司或基金须人工确认关联。"};
}
