import {ApiError,fail,owner,roleOf,runtimeEnv,sameOrigin} from "@/lib/server";
import {modelAnswer,modelConfig,modelStatus,ModelServiceError} from "@/lib/ai-provider";
import {parseProfileExtraction,profileExtractionMessages,ProfileExtractionError,ruleProfileExtraction} from "@/lib/profile-extraction";
import {questions} from "@/lib/model";

export async function POST(request:Request){
  try{
    sameOrigin(request);
    await owner();
    const role=roleOf(request);
    if(Number(request.headers.get("content-length"))>65000)throw new ApiError("请提供 12,000 字以内的资料节选。",413);
    const body=await request.text();
    if(body.length>50000)throw new ApiError("请提供 12,000 字以内的资料节选。",413);
    let input:unknown;
    try{input=JSON.parse(body)}catch{throw new ApiError("资料格式无效，请重试。");}
    if(!input||typeof input!=="object"||Array.isArray(input))throw new ApiError("资料格式无效。");
    const p=input as Record<string,unknown>;
    if(typeof p.text!=="string"||p.text.trim().length<2||p.text.length>12000)throw new ApiError("请输入 2–12,000 字的描述或资料节选。");
    if(p.questionKey!==undefined&&(typeof p.questionKey!=="string"||!questions[role].some(q=>q.key===p.questionKey)))throw new ApiError("当前身份不支持这个画像维度。");
    const text=p.text.trim(),config=modelConfig(runtimeEnv);
    const result=config?parseProfileExtraction(await modelAnswer(config,profileExtractionMessages(role,text,p.questionKey as string|undefined)),text,role):ruleProfileExtraction(text,role);
    return Response.json({...result,...modelStatus(runtimeEnv)},{headers:{"Cache-Control":"no-store"}});
  }catch(error){
    return fail(error instanceof ModelServiceError?new ApiError(error.message,error.status):error instanceof ProfileExtractionError?new ApiError(error.message,502):error);
  }
}
