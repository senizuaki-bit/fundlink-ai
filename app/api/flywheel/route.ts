import {ApiError,fail,owner,roleOf,sameOrigin} from "@/lib/server";
import {flywheelReport} from "@/lib/flywheel-server";
export async function GET(request:Request){try{return Response.json(await flywheelReport(await owner(),roleOf(request)),{headers:{"Cache-Control":"no-store"}})}catch(e){return fail(e)}}
export async function POST(request:Request){try{
 sameOrigin(request);const user=await owner(),role=roleOf(request);
 if(Number(request.headers.get("content-length"))>2000)throw new ApiError("请求内容过大。");
 const raw=await request.text();if(raw.length>1000)throw new ApiError("请求内容过大。");
 let body:{action?:string};try{body=JSON.parse(raw)}catch{throw new ApiError("请求格式不正确。")}
 if(body?.action!=="evaluate")throw new ApiError("请选择运行本轮评估。");
 return Response.json(await flywheelReport(user,role,true),{headers:{"Cache-Control":"no-store"}});
}catch(e){return fail(e)}}
