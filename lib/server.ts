import {env} from "cloudflare:workers";
import {getChatGPTUser} from "@/app/chatgpt-auth";
export async function owner(){const u=await getChatGPTUser();if(!u)throw new ApiError("请先登录后再继续。",401);return u.userId}
export function db(){if(!env.DB)throw new ApiError("数据服务暂不可用，请稍后重试。",503);return env.DB}
export function bucket(){if(!env.BUCKET)throw new ApiError("文件服务暂不可用，请稍后重试。",503);return env.BUCKET}
export class ApiError extends Error{constructor(message:string,public status=400){super(message)}}
export function roleOf(request:Request){const r=new URL(request.url).searchParams.get("role");if(r!=="investor"&&r!=="founder")throw new ApiError("请选择投资或融资身份。");return r}
export function sameOrigin(request:Request){const o=request.headers.get("origin");if(o&&o!==new URL(request.url).origin)throw new ApiError("请求来源不匹配。",403)}
export function fail(e:unknown){if(!(e instanceof ApiError))console.error(e);return Response.json({error:e instanceof ApiError?e.message:"操作未完成，请保留输入并重试。"}, {status:e instanceof ApiError?e.status:503})}
export const runtimeEnv=env as unknown as Record<string,string>;

