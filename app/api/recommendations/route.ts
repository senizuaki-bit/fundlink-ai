import {ApiError,fail,owner,roleOf} from "@/lib/server";
import {getRecommendations} from "@/lib/recommendation-server";

export async function GET(request:Request){
 try{
  const user=await owner(),role=roleOf(request),params=new URL(request.url).searchParams;
  const query=params.get("query")||"",rawVersion=params.get("version");
  if(rawVersion!==null&&!/^\d+$/.test(rawVersion))throw new ApiError("工作区版本格式不正确。");
  const version=rawVersion===null?undefined:Number(rawVersion);
  return Response.json(await getRecommendations(user,role,query,version),{headers:{"Cache-Control":"no-store"}});
 }catch(error){const response=fail(error);response.headers.set("Cache-Control","no-store");return response;}
}
