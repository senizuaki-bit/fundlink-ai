import {ApiError,db,fail,owner,roleOf,sameOrigin} from "@/lib/server";
import {normalizeWorkspace} from "@/lib/model";
import {applyProfileReview,parseProfileReview} from "@/lib/profile-review";

export async function POST(request:Request){try{
  sameOrigin(request);const user=await owner(),role=roleOf(request);
  const raw=await request.text();if(raw.length>18000)throw new ApiError("核验内容过长。");
  let review;try{review=parseProfileReview(JSON.parse(raw),role)}catch(e){throw new ApiError(e instanceof Error?e.message:"核验内容无效。");}
  const row=await db().prepare("SELECT data,version FROM workspaces WHERE owner=? AND role=?").bind(user,role).first<{data:string;version:number}>();
  if(!row)throw new ApiError("请先建立画像。",404);
  if(row.version!==review.version)throw new ApiError("画像已在其他操作中变化，请刷新后重新核验。",409);
  let document:undefined|{id:string;name:string};
  if(review.documentId){
    const record=await db().prepare("SELECT id,name FROM documents WHERE id=? AND owner=? AND role=?").bind(review.documentId,user,role).first<{id:string;name:string}>();
    if(!record)throw new ApiError("核验资料不存在或无访问权限。",404);
    document=record;
  }
  const now=new Date().toISOString(),workspace=normalizeWorkspace(JSON.parse(row.data));
  try{workspace.profile=applyProfileReview(workspace.profile,review,user,now,document)}catch(e){throw new ApiError(e instanceof Error?e.message:"核验失败。");}
  workspace.events=[{id:crypto.randomUUID(),title:review.action==="verify"?"人工核验画像字段":"撤销画像核验",detail:review.key+" · "+review.reviewNote,time:now},...workspace.events].slice(0,200);
  workspace.version=row.version+1;
  const result=await db().prepare("UPDATE workspaces SET data=?,version=version+1,updated_at=? WHERE owner=? AND role=? AND version=?").bind(JSON.stringify(workspace),now,user,role,row.version).run();
  if(!result.meta.changes)throw new ApiError("画像已发生变化，请刷新后重新核验。",409);
  return Response.json({workspace},{headers:{"Cache-Control":"no-store"}});
}catch(e){return fail(e)}}
