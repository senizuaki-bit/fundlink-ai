import {ApiError,db,fail,owner,roleOf,sameOrigin} from "@/lib/server";
import {blankWorkspace,normalizeWorkspace,type Workspace} from "@/lib/model";
import {applyLearningRequest} from "@/lib/learning";
import {prepareWorkspace} from "@/lib/workspace-state";
import {prepareFlywheelState,changedBusinessEntities} from "@/lib/flywheel-state";
import {workspaceProjectionStatements} from "@/lib/platform-flywheel-server";
export async function GET(request:Request){try{const user=await owner(),role=roleOf(request);const row=await db().prepare("SELECT data,version FROM workspaces WHERE owner=? AND role=?").bind(user,role).first<{data:string;version:number}>();return Response.json(row?normalizeWorkspace({...JSON.parse(row.data),version:row.version}):normalizeWorkspace(blankWorkspace()),{headers:{"Cache-Control":"no-store"}})}catch(e){return fail(e)}}
export async function PUT(request:Request){try{
 sameOrigin(request);const user=await owner(),role=roleOf(request);
 if(Number(request.headers.get("content-length"))>900000)throw new ApiError("工作区资料过大。");
 const raw=await request.text();if(raw.length>800000)throw new ApiError("资料过大，请减少内容。");
 let input:Workspace;try{input=JSON.parse(raw)}catch{throw new ApiError("无效的 JSON。");}
 if(!input||typeof input!=="object"||Array.isArray(input)||!input.profile||!input.settings||!Number.isInteger(input.version)||!Array.isArray(input.saved)||!Array.isArray(input.events)||!Array.isArray(input.deals))throw new ApiError("资料格式不完整。");
 const now=new Date().toISOString();
 await db().prepare("INSERT INTO workspaces(owner,role,data,version,updated_at) VALUES(?,?,?,0,?) ON CONFLICT(owner,role) DO NOTHING").bind(user,role,JSON.stringify(blankWorkspace()),now).run();
 const prev=await db().prepare("SELECT data,version FROM workspaces WHERE owner=? AND role=?").bind(user,role).first<{data:string;version:number}>();
 if(!prev||prev.version!==input.version)throw new ApiError("工作区在其他窗口已更新。请重新加载再保存。",409);
 const previous=JSON.parse(prev.data) as Workspace;
 let p:Workspace;try{p=prepareWorkspace(prepareFlywheelState(applyLearningRequest(input,previous,now),previous,now,input.settings.learningRequest==="clear"),previous,now)}catch(e){throw new ApiError(e instanceof Error?e.message:"资料格式不正确。");}
 for(const id of changedBusinessEntities(p,previous)){
  const entity=await db().prepare("SELECT id FROM knowledge_entities WHERE id=? AND owner=? AND role=?").bind(id,user,role).first();
  if(!entity)throw new ApiError("实际业务反馈的主体不存在或不属于当前身份。",404);
 }
 const text=JSON.stringify(p);if(text.length>800000)throw new ApiError("资料过大，请减少内容。");
 const update=db().prepare("UPDATE workspaces SET data=?,version=version+1,updated_at=? WHERE owner=? AND role=? AND version=?").bind(text,now,user,role,p.version);
 const projection=await workspaceProjectionStatements(user,role,p,p.version,text,now);
 const cleanup=input.settings.learningRequest==="clear"?[db().prepare("DELETE FROM flywheel_evaluations WHERE owner=? AND role=? AND EXISTS (SELECT 1 FROM workspaces WHERE owner=? AND role=? AND version=? AND updated_at=? AND data=?)").bind(user,role,user,role,p.version+1,now,text)]:[];
 // State and derived events commit together; all projection statements use the same version/data guard.
 const results=await db().batch([update,...projection,...cleanup]);
 const r=results[0];
 if(!r.meta.changes)throw new ApiError("工作区在其他窗口已更新。请重新加载再保存。",409);
 return Response.json({version:p.version+1,provenance:p.profile.provenance,history:p.profile.history,deals:p.deals,settings:p.settings,signals:p.signals,events:p.events,businessFeedback:p.businessFeedback});
}catch(e){return fail(e)}}
