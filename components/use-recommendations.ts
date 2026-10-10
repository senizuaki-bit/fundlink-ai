"use client";
import {useEffect,useState} from "react";
import type {RecommendationFeed} from "@/lib/recommendations";
import type {SectionProps} from "./workspace";

/** Invalidate server results immediately while an optimistic workspace edit is saving. */
export function useRecommendations(p:SectionProps,query=""){
 const {role,w,knowledge,saving}=p;
 const [attempt,setAttempt]=useState(0);
 const [result,setResult]=useState<{key:string;knowledge:typeof knowledge;feed?:RecommendationFeed;error?:string}|null>(null);
 const key=JSON.stringify([role,w.version,query,attempt]);
 useEffect(()=>{
  if(saving)return;
  const controller=new AbortController();
  const params=new URLSearchParams({role,query,version:String(w.version)});
  void fetch("/api/recommendations?"+params,{cache:"no-store",signal:controller.signal}).then(async response=>{
   const data=await response.json() as RecommendationFeed&{error?:string};
   if(!response.ok)throw Error(data.error||"推荐暂时不可用，请重试。");
   if(data.role!==role||data.workspaceVersion!==w.version)throw Error("画像已更新，请重新加载推荐。");
   if(!controller.signal.aborted)setResult({key,knowledge,feed:data});
  }).catch(error=>{if(!controller.signal.aborted)setResult({key,knowledge,error:error instanceof Error?error.message:"推荐加载失败"})});
  return()=>controller.abort();
 },[key,role,w.version,query,knowledge,saving]);
 const current=!saving&&result?.key===key&&result.knowledge===knowledge?result:null;
 async function retry(){await p.refreshWorkspace();setAttempt(value=>value+1)}
 return {feed:current?.feed,error:current?.error,loading:!current,retry};
}
