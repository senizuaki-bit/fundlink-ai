import type {Role} from "./model";
import type {RankedCandidate} from "./matching";

/** Both product surfaces receive the same server-side matching result. */
export type RecommendationFeed={
 role:Role;
 workspaceVersion:number;
 generatedAt:string;
 evaluated:RankedCandidate[];
 order:{entityId:string;rankScore:number;explorationReason:string}[];
 pipeline:{version:number;eventCount:number};
};

/** Restore server order without rerunning feedback learning in the browser. */
export function rankedRecommendations(feed:RecommendationFeed):RankedCandidate[]{
 const byId=new Map(feed.evaluated.map(candidate=>[candidate.entity.id,candidate])),seen=new Set<string>();
 return feed.order.flatMap(item=>{
  const candidate=byId.get(item.entityId);
  if(!candidate||!candidate.match.eligible||seen.has(item.entityId))return [];
  seen.add(item.entityId);return [{...candidate,rankScore:item.rankScore,explorationReason:item.explorationReason}];
 });
}
