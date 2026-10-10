import {ApiError,db} from "./server";
import type {Role} from "./model";
import {watchKnowledge} from "./knowledge-server";
import {defaultWatchSchedule,nextWatchTime,scheduleInput,type WatchSchedule} from "./watch-schedule";
type Row={enabled:number;interval_hours:number;entity_ids:string;next_run_at:string|null;last_run_at:string|null;last_status:string;last_message:string;heartbeat_at:string|null;cursor:string|null;cycle_failures:number;lease_id:string|null;lease_until:string|null};
export async function readWatchSchedule(user:string,role:Role):Promise<WatchSchedule>{
 const row=await db().prepare("SELECT * FROM watch_schedules WHERE owner=? AND role=?").bind(user,role).first<Row>();
 return row?{enabled:!!row.enabled,intervalHours:row.interval_hours,entityIds:JSON.parse(row.entity_ids),nextRunAt:row.next_run_at,lastRunAt:row.last_run_at,lastStatus:row.last_status,lastMessage:row.last_message,heartbeatAt:row.heartbeat_at,cursor:row.cursor,cycleFailures:row.cycle_failures}:defaultWatchSchedule();
}
export async function saveWatchSchedule(user:string,role:Role,input:unknown){
 let parsed;try{parsed=scheduleInput(input)}catch(e){throw new ApiError((e as Error).message)}
 for(const id of (parsed.enabled?parsed.entityIds:[])){
  const exists=await db().prepare("SELECT id FROM knowledge_entities WHERE owner=? AND role=? AND id=?").bind(user,role,id).first();
  if(!exists)throw new ApiError("主体不存在或不属于当前身份。",404);
  const source=await db().prepare("SELECT id FROM source_items WHERE owner=? AND role=? AND entity_id=? AND visibility='public' LIMIT 1").bind(user,role,id).first();
  if(parsed.enabled&&!source)throw new ApiError("所选主体缺少可巡检的公开来源；私有材料不会用于网络巡检。");
 }
 const now=new Date().toISOString();
 await db().prepare("INSERT INTO watch_schedules(owner,role,enabled,interval_hours,entity_ids,next_run_at,last_message) VALUES(?,?,?,?,?,?,?) ON CONFLICT(owner,role) DO UPDATE SET enabled=excluded.enabled,interval_hours=excluded.interval_hours,entity_ids=excluded.entity_ids,next_run_at=excluded.next_run_at,cursor=NULL,cycle_failures=0,revision=watch_schedules.revision+1,last_status='idle',last_message=excluded.last_message")
  .bind(user,role,Number(parsed.enabled),parsed.intervalHours,JSON.stringify(parsed.entityIds),parsed.enabled?now:null,parsed.enabled?"已启用，后台服务可用时开始首次巡检。":"已暂停后台巡检；正在进行的请求可能完成本页读取。").run();
 return readWatchSchedule(user,role);
}
export async function tickWatchSchedule(user:string,role:Role){
 const now=new Date().toISOString(),lease=crypto.randomUUID();
 await db().prepare("INSERT INTO watch_schedules(owner,role,heartbeat_at) VALUES(?,?,?) ON CONFLICT(owner,role) DO UPDATE SET heartbeat_at=excluded.heartbeat_at").bind(user,role,now).run();
 const lock=await db().prepare("UPDATE watch_schedules SET lease_id=?,lease_until=?,last_status='running' WHERE owner=? AND role=? AND enabled=1 AND next_run_at<=? AND (lease_until IS NULL OR lease_until<=?)")
  .bind(lease,nextWatchTime(now,1/6),user,role,now,now).run();
 if(!lock.meta.changes)return {ran:false};
 const owned=await db().prepare("SELECT lease_id,revision FROM watch_schedules WHERE owner=? AND role=? AND lease_id=? AND enabled=1").bind(user,role,lease).first<{lease_id:string;revision:number}>();
 if(!owned)return {ran:false};
 const schedule=await readWatchSchedule(user,role);
 try{
  const result=await watchKnowledge(user,role,schedule.entityIds,{cursor:schedule.cursor??undefined,limit:6});
  const cursor=result.progress.nextCursor;
  const changed=result.events.filter(e=>e.changed).length;
  const failed=result.events.filter(e=>e.status==="failed").length;
  const failures=(schedule.cursor?schedule.cycleFailures:0)+failed;
  const status=failures?"partial":cursor?"continuing":"success";
  const message=`本页 ${result.events.length} 条主体来源记录，${changed} 项内容变化，${failed} 项读取失败。${cursor?`剩余 ${result.progress.remaining} 个网址，下次心跳继续。`:`本轮巡检结束，累计 ${failures} 项读取失败。`}`;
  await db().prepare("UPDATE watch_schedules SET last_run_at=?,last_status=?,last_message=?,cursor=?,cycle_failures=?,next_run_at=?,lease_id=NULL,lease_until=NULL WHERE owner=? AND role=? AND lease_id=? AND revision=?")
   .bind(new Date().toISOString(),status,message,cursor,failures,cursor?now:nextWatchTime(now,schedule.intervalHours),user,role,lease,owned.revision).run();
  return {ran:true,status,changed};
 }catch(e){
  const message=e instanceof ApiError?e.message:"本轮巡检未完成，稍后自动重试；详细失败记录可在证据库查看。";
  await db().prepare("UPDATE watch_schedules SET last_run_at=?,last_status='failed',last_message=?,cursor=NULL,next_run_at=?,lease_id=NULL,lease_until=NULL WHERE owner=? AND role=? AND lease_id=? AND revision=?")
   .bind(now,message,nextWatchTime(now,Math.min(1,schedule.intervalHours)),user,role,lease,owned.revision).run();
  return {ran:true,status:"failed"};
 }finally{
  // A changed schedule keeps the old lease until this worker finishes; only its owner can release it.
  await db().prepare("UPDATE watch_schedules SET lease_id=NULL,lease_until=NULL WHERE owner=? AND role=? AND lease_id=?").bind(user,role,lease).run();
 }
}
