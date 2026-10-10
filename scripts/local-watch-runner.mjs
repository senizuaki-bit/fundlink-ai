/** Local preview only; uses the same loopback mock sign-in as the local browser. */
export function startLocalWatchRunner(baseUrl){
 const url=new URL(baseUrl);if(url.protocol!=='http:'||url.hostname!=='127.0.0.1')throw Error('Local watch runner requires an IPv4 loopback URL.');
 let running=false,stopped=false;
 async function tick(){
  if(running||stopped)return;running=true;
  try{
   const login=await fetch(url.origin+'/signin-with-chatgpt?return_to=/',{redirect:'manual',signal:AbortSignal.timeout(5000)});
   const cookie=login.headers.get('set-cookie')?.split(';')[0];
   if(login.status!==302||!cookie)return;
   for(const role of ['investor','founder']){
    if(stopped)break;
    await fetch(url.origin+'/api/watch-schedule?role='+role,{method:'POST',headers:{cookie,Origin:url.origin},signal:AbortSignal.timeout(240000)});
   }
  }catch{/* Startup, restart and network failures are retried on the next heartbeat. */}
  finally{running=false}
 }
 const initial=setTimeout(()=>void tick(),5000);initial.unref();
 const timer=setInterval(()=>void tick(),60000);timer.unref();
 return ()=>{stopped=true;clearTimeout(initial);clearInterval(timer)};
}
