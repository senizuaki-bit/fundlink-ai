import type {BehaviorSignal,Role,Workspace} from "./model";
import {consentedSignals,hasLearningConsent} from "./learning";

/** One internal event vocabulary for both sides. No document text, notes or profile values belong here. */
export type PlatformEventType="exposure"|"view"|"search"|"batch"|"save"|"research"|"interest"|"contact"|"mutual"|"reply"|"meeting"|"diligence"|"terms"|"decision"|"closed"|"won"|"lost"|"reject"|"riskreview"|"entitylink"|"sourcecollected";
export type PlatformEvent={
 id:string;owner:string;actorRole:Role;actorKey:string;companyKey:string;investorKey:string;subjectKey:string;
 entityId:string;stream:"workspace"|"evidence";sourceEventId:string;sourceType:"signal"|"business_feedback"|"source"|"risk_review"|"entity_link";
 sourceKind:string;type:PlatformEventType;observedAt:string;isSimulation:boolean;provenance:"observed"|"self_reported"|"simulation";
 learningEligible:boolean;reasonCode:"fit_mismatch"|"skip"|null;feedbackId:string|null;outcome:BusinessStage|null;
};
type BusinessStage=NonNullable<Workspace["businessFeedback"]>[number]["stage"];
export type PlatformSubject={id:string;key:string;simulation:boolean};
export type PlatformIdentityContext={actorKey:string;subjects:Map<string,PlatformSubject>};
export type PlatformPair={companyKey:string;investorKey:string;status:"one_sided_observation"|"one_sided_report"|"both_sides_reported"|"simulation";actorRoles:Role[];eventCount:number;reportedStages:PlatformEventType[];lastObservedAt:string};

export async function opaquePlatformKey(namespace:string,...parts:string[]){
 const bytes=new TextEncoder().encode(JSON.stringify([namespace,...parts]));
 const digest=await crypto.subtle.digest("SHA-256",bytes);
 return namespace+":"+[...new Uint8Array(digest)].map(n=>n.toString(16).padStart(2,"0")).join("");
}
export function orientedPair(role:Role,actorKey:string,subjectKey:string){
 return role==="investor"?{companyKey:subjectKey,investorKey:actorKey}:{companyKey:actorKey,investorKey:subjectKey};
}
const outcomeType:Record<BusinessStage,PlatformEventType>={positive_reply:"reply",meeting:"meeting",diligence:"diligence",terms:"terms",won:"won",lost:"lost"};
const validKinds=new Set<BehaviorSignal["kind"]>(["exposure","view","search","batch","save","research","interest","contact","mutual","reply","meeting","diligence","terms","decision","closed","reject","risk_review"]);
const validDate=(time:string,now:number)=>Number.isFinite(Date.parse(time))&&Date.parse(time)<=now+60_000;

/** Input is the server-validated workspace, not an arbitrary browser event batch. */
export async function projectWorkspaceEvents(owner:string,role:Role,w:Workspace,identity:PlatformIdentityContext,now=Date.now()):Promise<PlatformEvent[]>{
 const events:PlatformEvent[]=[],grant=Date.parse(w.settings.learningConsent?.grantedAt||"");
 for(const s of consentedSignals(w,now)){
  const subject=identity.subjects.get(s.entityId);if(!subject||!validKinds.has(s.kind)||!validDate(s.time,now))continue;
  const feedback=s.feedbackId?w.businessFeedback?.find(f=>f.id===s.feedbackId&&f.entityId===s.entityId):undefined;
  // A reference to a removed business record is never retained as observed business evidence.
  if(s.feedbackId&&!feedback)continue;
  const simulation=subject.simulation||s.mode==="simulation";
  const businessKind=["contact","mutual","reply","meeting","diligence","terms","decision","closed"].includes(s.kind);
  const isSimulation=simulation||businessKind&&!feedback;
  const type=s.kind==="risk_review"?"riskreview":feedback?outcomeType[feedback.stage]:s.kind;
  const reasonCode=s.kind==="reject"&&/行业|方向|阶段|不符|金额|资源/.test(s.detail||"")?"fit_mismatch":s.kind==="batch"&&/跳过/.test(s.detail||"")?"skip":null;
  events.push({id:await opaquePlatformKey("event",owner,role,"signal",s.id),owner,actorRole:role,actorKey:identity.actorKey,...orientedPair(role,identity.actorKey,subject.key),subjectKey:subject.key,entityId:s.entityId,stream:"workspace",sourceEventId:s.id,sourceType:"signal",sourceKind:s.kind,type,observedAt:s.time,isSimulation,provenance:isSimulation?"simulation":feedback?"self_reported":"observed",learningEligible:!feedback||Date.parse(feedback.occurredAt)>=grant&&Date.parse(feedback.recordedAt)>=grant,reasonCode,feedbackId:feedback?.id||null,outcome:feedback?.stage||null});
 }
 // Business records survive learning opt-out as operational data. They are never counted twice as signals.
 for(const f of w.businessFeedback||[]){
  const subject=identity.subjects.get(f.entityId);if(!subject||subject.simulation||!outcomeType[f.stage]||!validDate(f.occurredAt,now))continue;
  events.push({id:await opaquePlatformKey("event",owner,role,"business_feedback",f.id),owner,actorRole:role,actorKey:identity.actorKey,...orientedPair(role,identity.actorKey,subject.key),subjectKey:subject.key,entityId:f.entityId,stream:"workspace",sourceEventId:f.id,sourceType:"business_feedback",sourceKind:f.stage,type:outcomeType[f.stage],observedAt:f.occurredAt,isSimulation:false,provenance:"self_reported",learningEligible:hasLearningConsent(w,now)&&Date.parse(f.occurredAt)>=grant&&Date.parse(f.recordedAt)>=grant,reasonCode:null,feedbackId:f.id,outcome:f.stage});
 }
 return events;
}

/** These canonical enum labels are the only text exported to learning consumers. */
export function platformLearningSignals(events:PlatformEvent[]):BehaviorSignal[]{
 return events.filter(e=>e.stream==="workspace"&&e.sourceType==="signal"&&e.learningEligible&&validKinds.has(e.sourceKind as BehaviorSignal["kind"])).map(e=>({id:e.sourceEventId,entityId:e.entityId,kind:e.sourceKind as BehaviorSignal["kind"],time:e.observedAt,mode:e.isSimulation?"simulation":"real",...(e.reasonCode?{detail:e.reasonCode==="fit_mismatch"?"方向不符":"跳过"}:{}),...(e.feedbackId?{feedbackId:e.feedbackId}:{}),...(e.outcome?{outcome:e.outcome}:{})}));
}

/** Exact oriented keys only. A both-sided report is not independently verified agreement or a closed deal. */
export function summarizePlatformPairs(events:PlatformEvent[]):PlatformPair[]{
 const groups=new Map<string,PlatformEvent[]>();
 for(const e of events){if(e.stream!=="workspace")continue;const key=JSON.stringify([e.companyKey,e.investorKey,e.isSimulation]);const group=groups.get(key)||[];group.push(e);groups.set(key,group)}
 return [...groups.values()].map(group=>{
  const reported=group.filter(e=>e.provenance==="self_reported"),reportedRoles=new Set(reported.map(e=>e.actorRole)),first=group[0];
  const unique=group.filter(e=>!(e.sourceType==="signal"&&e.feedbackId&&group.some(other=>other.sourceType==="business_feedback"&&other.owner===e.owner&&other.actorRole===e.actorRole&&other.feedbackId===e.feedbackId)));
  return {companyKey:first.companyKey,investorKey:first.investorKey,status:first.isSimulation?"simulation":reportedRoles.size===2?"both_sides_reported":reported.length?"one_sided_report":"one_sided_observation",actorRoles:[...new Set(group.map(e=>e.actorRole))].sort(),eventCount:unique.length,reportedStages:[...new Set(reported.map(e=>e.type))],lastObservedAt:group.map(e=>e.observedAt).sort().at(-1)!} as PlatformPair;
 });
}
