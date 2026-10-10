import {ApiError,fail,owner,roleOf,sameOrigin} from "@/lib/server";
import {discoverKnowledge} from "@/lib/knowledge-server";
import type {DiscoverySource} from "@/lib/knowledge";
export async function POST(request:Request){
  try{sameOrigin(request);const user=await owner(),role=roleOf(request);const p=await request.json() as Record<string,unknown>;
    const source=String(p.source??(role==="investor"?"github":"fund")) as DiscoverySource;
    if(!["github","huggingface","arxiv","website","fund","news","fund-news"].includes(source))throw new ApiError("不支持该公开来源。");
    return Response.json(await discoverKnowledge(user,role,{source,query:String(p.query??"").slice(0,180),url:p.url?String(p.url):undefined,entityId:p.entityId?String(p.entityId):undefined}),{headers:{"Cache-Control":"private, no-store"}});
  }catch(e){return fail(e)}
}
