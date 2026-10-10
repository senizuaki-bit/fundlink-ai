"use client";
import {useEffect,useRef} from "react";
import {X,Inbox} from "lucide-react";
export function Modal({title,children,close,wide=false}:{title:string;children:React.ReactNode;close:()=>void;wide?:boolean}){const ref=useRef<HTMLDialogElement>(null);useEffect(()=>{ref.current?.showModal()},[]);return <dialog className={"modal "+(wide?"wide":"")} ref={ref} onCancel={e=>{e.preventDefault();close()}} onClick={e=>{if(e.target===e.currentTarget)close()}}><div className="modal-inner"><div className="modal-header"><h2>{title}</h2><button className="icon-button" aria-label="关闭" onClick={close}><X size={20}/></button></div>{children}</div></dialog>}
export function Empty({title,text,action}:{title:string;text:string;action?:React.ReactNode}){return <div className="empty"><Inbox size={35}/><h3>{title}</h3><p>{text}</p>{action}</div>}
export function Badge({children,tone=""}:{children:React.ReactNode;tone?:string}){return <span className={"badge "+tone}>{children}</span>}
export function download(name:string,content:string){const url=URL.createObjectURL(new Blob([content],{type:"text/plain;charset=utf-8"}));const a=document.createElement("a");a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}
export function SectionHead({kicker,title,text,action}:{kicker:string;title:string;text:string;action?:React.ReactNode}){return <div className="section-heading"><div><div className="section-kicker">{kicker}</div><h1>{title}</h1><p>{text}</p></div>{action}</div>}

