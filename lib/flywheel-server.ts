import {ApiError,db} from "./server";
import {blankWorkspace,normalizeWorkspace,type Role} from "./model";
import {listKnowledge} from "./knowledge-server";
import {buildFlywheel,type FlywheelSnapshot,type FlywheelReport} from "./flywheel";

export async function flywheelReport(user:string,role:Role,save=false):Promise<FlywheelReport>{
 const row=await db().prepare("SELECT data,version FROM workspaces WHERE owner=? AND role=?").bind(user,role).first<{data:string;version:number}>();
 const w=row?normalizeWorkspace({...JSON.parse(row.data),version:row.version}):blankWorkspace();
 const current=buildFlywheel(w,await listKnowledge(user,role),role);
 if(save){
  if(!row)throw new ApiError("请先完成当前身份建档。",409);
  current.id="cycle_"+crypto.randomUUID();
  // Never store a stale report after a concurrent opt-out or clear action.
  const inserted=await db().prepare("INSERT INTO flywheel_evaluations(id,owner,role,created_at,data) SELECT ?,?,?,?,? WHERE EXISTS (SELECT 1 FROM workspaces WHERE owner=? AND role=? AND version=?)").bind(current.id,user,role,current.createdAt,JSON.stringify(current),user,role,w.version).run();
  if(!inserted.meta.changes)throw new ApiError("工作区已更新，请刷新后重新运行本轮评估。",409);
  await db().prepare("DELETE FROM flywheel_evaluations WHERE owner=? AND role=? AND id NOT IN (SELECT id FROM flywheel_evaluations WHERE owner=? AND role=? ORDER BY created_at DESC,id DESC LIMIT 30)").bind(user,role,user,role).run();
 }
 const rows=await db().prepare("SELECT data FROM flywheel_evaluations WHERE owner=? AND role=? ORDER BY created_at DESC,id DESC LIMIT 30").bind(user,role).all<{data:string}>();
 return {current,history:rows.results.map(r=>JSON.parse(r.data) as FlywheelSnapshot)};
}
