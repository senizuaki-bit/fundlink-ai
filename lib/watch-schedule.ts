import type {Role} from "./model";
export type WatchSchedule={enabled:boolean;intervalHours:number;entityIds:string[];nextRunAt:string|null;lastRunAt:string|null;lastStatus:string;lastMessage:string;heartbeatAt:string|null;cursor:string|null;cycleFailures:number};
export const defaultWatchSchedule=():WatchSchedule=>({enabled:false,intervalHours:24,entityIds:[],nextRunAt:null,lastRunAt:null,lastStatus:"idle",lastMessage:"尚未启用后台巡检",heartbeatAt:null,cursor:null,cycleFailures:0});
export function scheduleInput(value:unknown):Pick<WatchSchedule,"enabled"|"intervalHours"|"entityIds">{
 if(!value||typeof value!=="object"||Array.isArray(value))throw Error("请提供巡检设置。");
 const p=value as Record<string,unknown>;
 if(typeof p.enabled!=="boolean"||!([1,6,12,24] as unknown[]).includes(p.intervalHours))throw Error("巡检间隔请选择 1、6、12 或 24 小时。");
 if(!Array.isArray(p.entityIds)||p.entityIds.some(id=>typeof id!=="string"||!id||id.length>160))throw Error("请选择有效的关注主体。");
 const entityIds=[...new Set(p.entityIds as string[])];
 if(entityIds.length>6||p.enabled&&!entityIds.length)throw Error("后台巡检需要选择 1–6 个真实主体。");
 return {enabled:p.enabled,intervalHours:p.intervalHours as number,entityIds};
}
export function nextWatchTime(now:string,hours:number){return new Date(Date.parse(now)+hours*3600000).toISOString()}
export function runnerAvailable(heartbeat:string|null,now=Date.now(),running=false){return !!heartbeat&&now-Date.parse(heartbeat)>=-60000&&now-Date.parse(heartbeat)<(running?600000:150000)}
export function watchScope(role:Role){return role==="founder"?"资本机构":"项目"}
