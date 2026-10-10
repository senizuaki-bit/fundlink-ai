import {ApiError,fail,owner,roleOf,sameOrigin} from "@/lib/server";
import {readWatchSchedule,saveWatchSchedule,tickWatchSchedule} from "@/lib/watch-schedule-server";
const reply=(value:unknown)=>Response.json(value,{headers:{"Cache-Control":"private, no-store"}});
export async function GET(request:Request){try{return reply(await readWatchSchedule(await owner(),roleOf(request)))}catch(e){return fail(e)}}
export async function PUT(request:Request){try{
 sameOrigin(request);const user=await owner(),role=roleOf(request);
 const raw=await request.text();if(raw.length>3000)throw new ApiError("巡检设置过大。");
 let input;try{input=JSON.parse(raw)}catch{throw new ApiError("无效的巡检设置。")}
 return reply(await saveWatchSchedule(user,role,input));
}catch(e){return fail(e)}}
export async function POST(request:Request){try{sameOrigin(request);return reply(await tickWatchSchedule(await owner(),roleOf(request)))}catch(e){return fail(e)}}
