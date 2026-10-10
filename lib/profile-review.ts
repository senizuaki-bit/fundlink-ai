import {type Profile,type Role} from "./model";
import {profileFieldKeys,profileFieldOrigin} from "./profile-fields";

export type ProfileReviewRequest={key:string;value:string;action:"verify"|"retract";confirmed:true;version:number;reference?:string;documentId?:string;reviewNote:string};
export function parseProfileReview(input:unknown,role:Role):ProfileReviewRequest{
  if(!input||typeof input!=="object"||Array.isArray(input))throw Error("核验请求格式不正确。");
  const p=input as Record<string,unknown>;
  if(typeof p.key!=="string"||!profileFieldKeys(role).has(p.key))throw Error("当前身份不支持核验此字段。");
  if(typeof p.value!=="string"||!p.value.trim()||p.value.length>12000)throw Error("请先填写并保存字段内容。");
  if(!Number.isInteger(p.version)||Number(p.version)<0)throw Error("请刷新画像后再核验。");
  if(p.action!=="verify"&&p.action!=="retract")throw Error("请选择核验或撤销核验。");
  if(p.confirmed!==true)throw Error("请明确确认已人工核对当前字段与所列资料。");
  if(typeof p.reviewNote!=="string"||p.reviewNote.trim().length<12||p.reviewNote.length>2000)throw Error("请填写至少 12 字的核对说明，包含资料位置、时间或数据口径。");
  let reference:string|undefined,documentId:string|undefined;
  if(p.action==="verify"){
    if(typeof p.documentId==="string"&&p.documentId.trim()){
      if(!/^[a-zA-Z0-9-]{8,100}$/.test(p.documentId))throw Error("资料标识不正确。");
      documentId=p.documentId;
    }else{
      if(typeof p.reference!=="string"||p.reference.length>2000)throw Error("请提供可追溯的公开来源网址，或选择资料库文件。");
      let url:URL;try{url=new URL(p.reference.trim())}catch{throw Error("来源需为完整的 HTTP 或 HTTPS 网址。");}
      if(!["http:","https:"].includes(url.protocol)||url.username||url.password||!url.hostname.includes("."))throw Error("来源需为不含凭据的公开 HTTP 或 HTTPS 网址。");
      reference=url.href;
    }
  }
  return {key:p.key,value:p.value,action:p.action,confirmed:true,version:Number(p.version),reference,documentId,reviewNote:p.reviewNote.trim()};
}

// The authenticated route supplies the reviewer and resolves document ownership.
// This records the user's evidence review, not an independent platform certification.
export function applyProfileReview(profile:Profile,review:ProfileReviewRequest,reviewedBy:string,time:string,resolvedDocument?:{id:string;name:string}):Profile{
  const current=review.key==="name"?profile.name:profile.answers[review.key]||"";
  if(current!==review.value)throw Error("字段已变化，请重新查看当前内容后核验。");
  if(!reviewedBy.trim())throw Error("缺少核验人。");
  if(review.action==="retract"&&profile.provenance?.[review.key]?.origin!=="verified")throw Error("该字段没有可撤销的人工核验。");
  if(review.action==="verify"&&review.documentId&&(!resolvedDocument||resolvedDocument.id!==review.documentId))throw Error("核验资料不存在或无访问权限。");
  const reference=review.action==="verify"?(resolvedDocument?"资料库："+resolvedDocument.name+" ["+resolvedDocument.id+"]":review.reference):profile.provenance?.[review.key]?.reference;
  if(review.action==="verify"&&!reference)throw Error("缺少可追溯来源。");
  const origin=review.action==="verify"?"verified":profileFieldOrigin(review.key);
  const entry={origin,time,reference,reviewNote:review.reviewNote,reviewedBy} as const;
  return {...profile,provenance:{...profile.provenance,[review.key]:entry},history:[{id:crypto.randomUUID(),key:review.key,before:current,after:current,...entry},...(profile.history||[])].slice(0,200)};
}
