import type {Entity} from "./catalog";
import {hasLearningConsent} from "./learning";
import {addSignal,type BehaviorSignal,type Workspace} from "./model";

/** The activity is genuine, but interactions with sample subjects remain a simulation cohort. */
export function entitySignalMode(entity:Pick<Entity,"real"|"source">):"real"|"simulation" {
  return entity.real===true||entity.source==="public"||entity.source==="authorized"?"real":"simulation";
}

/** One exposure per subject per UTC day within the current, explicitly granted consent period. */
export function hasCandidateExposure(w:Workspace,entityId:string,now=new Date().toISOString()):boolean {
  const since=Date.parse(w.settings.learningConsent?.grantedAt||""),at=Date.parse(now);
  if(!Number.isFinite(at))return false;
  const utcDay=new Date(at).toISOString().slice(0,10);
  return (w.signals||[]).some(signal=>signal.kind==="exposure"&&signal.entityId===entityId
    &&Date.parse(signal.time)>=since&&new Date(signal.time).toISOString().slice(0,10)===utcDay);
}

export function recordCandidateExposure(w:Workspace,entities:Pick<Entity,"id"|"real"|"source">[],context:string,now=new Date().toISOString()):Workspace {
  if(!hasLearningConsent(w)||!Number.isFinite(Date.parse(now))||Date.parse(now)<Date.parse(w.settings.learningConsent!.grantedAt))return w;
  return entities.reduce((state,entity)=>{
    if(hasCandidateExposure(state,entity.id,now))return state;
    const recorded=addSignal(state,entity.id,"exposure",context,{mode:entitySignalMode(entity)});
    // An injected clock keeps day-boundary and consent-cutoff behavior deterministic in verification.
    return {...recorded,signals:(recorded.signals||[]).map((signal,index)=>index===0?{...signal,time:new Date(now).toISOString()}:signal)};
  },w);
}

const stageSignals:Record<string,BehaviorSignal["kind"]>={
  "意向沟通":"contact","双方确认":"mutual","安排会谈":"meeting","尽职调查":"diligence",
  "条款磋商":"terms","决策记录":"decision","已关闭":"closed",
};

/** Current Deal Rooms are simulated; advancing them must never manufacture real counterpart outcomes. */
export function recordDealProgress(w:Workspace,entityId:string,from:string,to:string,detail?:string):Workspace {
  const kind=stageSignals[to];
  if(from===to||!kind)return w;
  return addSignal(w,entityId,kind,detail||`${from} → ${to}`,{mode:"simulation"});
}
