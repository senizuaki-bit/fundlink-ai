"use client";
import {useEffect,useRef,useState} from "react";
import {Mic,Square} from "lucide-react";

type RecognitionResult={isFinal:boolean;0:{transcript:string}};
type Recognition={lang:string;continuous:boolean;interimResults:boolean;onresult:((event:{results:ArrayLike<RecognitionResult>})=>void)|null;onerror:((event:{error:string})=>void)|null;onend:(()=>void)|null;start:()=>void;stop:()=>void;abort:()=>void};
type SpeechWindow=Window&{SpeechRecognition?:new()=>Recognition;webkitSpeechRecognition?:new()=>Recognition};

export default function VoiceInput({disabled,onCommit,onActive}:{disabled:boolean;onCommit:(text:string)=>void;onActive:(active:boolean)=>void}){
  const [listening,setListening]=useState(false),[transcript,setTranscript]=useState(""),[error,setError]=useState("");
  const recognition=useRef<Recognition|null>(null),timer=useRef<ReturnType<typeof setTimeout>|null>(null);
  const onActiveRef=useRef(onActive);
  useEffect(()=>{onActiveRef.current=onActive},[onActive]);
  useEffect(()=>()=>{
    if(timer.current)clearTimeout(timer.current);
    const current=recognition.current;
    if(current){current.onresult=null;current.onerror=null;current.onend=null;current.abort()}
    onActiveRef.current(false);
  },[]);

  function start(){
    if(disabled||listening)return;
    const Constructor=(window as SpeechWindow).SpeechRecognition||(window as SpeechWindow).webkitSpeechRecognition;
    if(!Constructor){setError("当前浏览器不支持语音转写，请直接输入文字，或使用设备键盘的语音输入。");return}
    setError("");setTranscript("");
    const current=new Constructor();recognition.current=current;
    current.lang="zh-CN";current.continuous=true;current.interimResults=true;
    current.onresult=event=>setTranscript(Array.from(event.results).map(result=>result[0].transcript).join("").slice(0,12000));
    current.onerror=event=>{
      const messages:Record<string,string>={"not-allowed":"麦克风权限未开启，可允许后重试或直接输入文字。","audio-capture":"未找到可用麦克风，请检查设备后重试。","no-speech":"未识别到语音，请重试或直接输入文字。",network:"浏览器语音服务暂不可用，请重试或直接输入文字。"};
      if(event.error!=="aborted")setError(messages[event.error]||"语音转写未完成，请重试或直接输入文字。");
      setListening(false);onActiveRef.current(false);
    };
    current.onend=()=>{setListening(false);onActiveRef.current(false);if(timer.current)clearTimeout(timer.current)};
    try{current.start();setListening(true);onActiveRef.current(true);timer.current=setTimeout(()=>current.stop(),60000)}catch{setError("无法启动语音输入，请直接输入文字。");setListening(false);onActiveRef.current(false)}
  }
  return <div style={{margin:"12px 0"}}>
    <div className="row" style={{flexWrap:"wrap"}}>
      <button className="secondary" type="button" disabled={disabled} onClick={()=>listening?recognition.current?.stop():start()}>{listening?<Square size={15}/>:<Mic size={15}/>} {listening?"停止转写":"语音输入"}</button>
      <small className="muted">点击后才开启麦克风。转写由浏览器提供，可能使用浏览器的在线语音服务。</small>
    </div>
    {listening&&<p role="status">正在听你说… 最长 60 秒，停止后可检查文字。</p>}
    {error&&<p role="alert" className="notice">{error}</p>}
    {!!transcript&&<div className="panel" style={{marginTop:12}}>
      <label className="field" style={{marginTop:0}}>转写预览 · 请核对金额、币种和日期<textarea aria-label="编辑语音转写" value={transcript} disabled={listening||disabled} maxLength={12000} onChange={event=>setTranscript(event.target.value)}/></label>
      <div className="row" style={{flexWrap:"wrap"}}>
        <button className="primary" type="button" disabled={listening||disabled||!transcript.trim()} onClick={()=>{onCommit(transcript.trim());setTranscript("")}}>采用这段转写</button>
        <button className="quiet" type="button" disabled={listening||disabled} onClick={()=>setTranscript("")}>丢弃转写</button>
      </div>
    </div>}
  </div>;
}
