import type {BehaviorSignal,Workspace} from "./model";

/** Old workspaces with only learning=true have no recorded consent. */
export function hasLearningConsent(w:Partial<Workspace>,now=Date.now()):boolean {
  const consent=w.settings?.learningConsent;
  return w.settings?.learning===true&&consent?.version===1&&!consent.revokedAt
    &&Number.isFinite(Date.parse(consent.grantedAt))&&Date.parse(consent.grantedAt)<=now+60_000;
}
export function consentedSignals(w:Workspace,now=Date.now()):BehaviorSignal[] {
  if(!hasLearningConsent(w,now))return [];
  const since=Date.parse(w.settings.learningConsent!.grantedAt);
  return (w.signals||[]).filter(s=>Date.parse(s.time)>=since&&Date.parse(s.time)<=now+60_000);
}

/** Called at the authenticated state boundary; client-supplied consent stamps are ignored. */
export function applyLearningRequest(input:Workspace,previous:Workspace,now=new Date().toISOString()):Workspace {
  const request=input.settings.learningRequest;
  if(request!==undefined&&!["grant","revoke","clear"].includes(request))throw Error("无效的行为学习授权操作。");
  let consent=previous.settings.learningConsent,enabled=hasLearningConsent(previous);
  const events=[...input.events];
  if(request){
    if(request==="grant"){
      if(!enabled)consent={version:1,grantedAt:now};
      enabled=true;
    }else{
      if(consent)consent={...consent,revokedAt:now};
      enabled=false;
    }
    const title=request==="grant"?"明确授权行为学习":request==="clear"?"清除行为学习记录":"撤回行为学习授权";
    events.unshift({id:crypto.randomUUID(),title,detail:request==="grant"?"仅使用本次授权之后的新行为；不改变硬条件或共享私有资料。":request==="clear"?"学习已关闭，行为信号已清除；收藏、业务记录和明确偏好保留。":"停止新增与使用行为信号；已确认的明确偏好保留。",time:now});
  }
  const {learningRequest:_request,learningConsent:_stamp,...settings}=input.settings;
  void _request;void _stamp;
  const signals=request==="clear"?[]:enabled?(input.signals||[]):(previous.signals||[]);
  return {...input,settings:{...settings,learning:enabled,...(consent?{learningConsent:consent}:{})},signals,events};
}
