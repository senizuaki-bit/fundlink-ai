import {ApiError,fail,owner,roleOf,sameOrigin} from "@/lib/server";
import {addManualClaim,deleteKnowledge,discoverKnowledge,listKnowledge,relateKnowledge,researchKnowledge,retrieveKnowledge,reviewFinding,watchKnowledge} from "@/lib/knowledge-server";
import type {DiscoverySource,ReviewStatus} from "@/lib/knowledge";
const response=(data:unknown)=>Response.json(data,{headers:{"Cache-Control":"private, no-store"}});
export async function GET(request:Request){try{const user=await owner(),role=roleOf(request),url=new URL(request.url);if(url.searchParams.has("query"))return response(await retrieveKnowledge(user,role,url.searchParams.get("query")??"",url.searchParams.get("entityId")??undefined));return response(await listKnowledge(user,role));}catch(e){return fail(e)}}
export async function POST(request:Request){try{
  sameOrigin(request);const user=await owner(),role=roleOf(request);if(Number(request.headers.get("content-length"))>150000)throw new ApiError("请求内容过大。");const p=await request.json() as Record<string,unknown>,action=String(p.action??"list");
  if(action==="list")return response(await listKnowledge(user,role));
  if(action==="query")return response(await retrieveKnowledge(user,role,String(p.query??"").slice(0,500),p.entityId?String(p.entityId):undefined));
  if(action==="research")return response(await researchKnowledge(user,role,String(p.entityId??"")));
  if(action==="search"||action==="ingest"){
    const source=String(p.source??(role==="founder"?"fund":"website")) as DiscoverySource;if(!["github","huggingface","arxiv","website","fund","news","fund-news"].includes(source))throw new ApiError("不支持该公开来源。");
    return response(await discoverKnowledge(user,role,{source,query:String(p.query??"").slice(0,180),url:p.url?String(p.url):undefined,entityId:p.entityId?String(p.entityId):undefined}));
  }
  if(action==="manual-claim")return response(await addManualClaim(user,role,p));
  if(action==="relate")return response(await relateKnowledge(user,role,p));
  if(action==="review")return response(await reviewFinding(user,role,String(p.id??""),p.status as ReviewStatus,String(p.note??"")));
  if(action==="delete")return response(await deleteKnowledge(user,role,{id:String(p.id??""),kind:String(p.kind??"entity")}));
  if(action==="watch-check")return response(await watchKnowledge(user,role,Array.isArray(p.entityIds)?p.entityIds.map(String):undefined,{cursor:typeof p.cursor==="string"?p.cursor:undefined}));
  throw new ApiError("不支持该知识库操作。");
}catch(e){return fail(e)}}
