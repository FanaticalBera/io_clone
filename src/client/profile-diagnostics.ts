// Opt-in development diagnostics; never stores or exposes wallet contents.
const enabled=typeof window!=='undefined'&&(import.meta.env.DEV||import.meta.env.MODE==='test')&&new URLSearchParams(location.search).get('debugProfile')==='1';
const lines:string[]=[];let output:HTMLPreElement|null=null;
export function profileTrace(stage:string,error?:unknown):void {
 if(!enabled)return;
 try{const detail=error instanceof Error?error.name+': '+error.message:error===undefined?'':String(error);
  lines.push(new Date().toISOString()+' '+stage+(detail?' · '+detail:''));if(lines.length>120)lines.shift();if(output)output.textContent=lines.join('\n');
 }catch{}
}
if(enabled){
 const panel=document.createElement('aside');panel.id='profile-diagnostics';panel.style.cssText='position:fixed;z-index:10000;right:8px;bottom:8px;width:min(560px,95vw);max-height:48vh;overflow:auto;padding:10px;background:#fff;color:#182c38;border:1px solid #708c88;font:12px/1.4 monospace;pointer-events:auto';
 const title=document.createElement('strong');title.textContent='게임 프로필 진단';panel.append(title);
 const copy=document.createElement('button');copy.textContent='진단 결과 복사';copy.id='profile-diagnostics-copy';copy.style.margin='0 8px';
 copy.onclick=()=>{const box=document.createElement('textarea');box.value=lines.join('\n');panel.append(box);box.select();try{copy.textContent=document.execCommand('copy')?'복사 완료':'아래 내용을 복사해 주세요';}catch{copy.textContent='아래 내용을 복사해 주세요';}box.remove();};panel.append(copy);
 const probe=document.createElement('button');probe.id='profile-diagnostics-write';probe.textContent='쓰기 접근 검사';
 probe.onclick=()=>{probe.disabled=true;let db:IDBDatabase|undefined,tx:IDBTransaction|undefined,read=false,finished=false;
  const finish=(stage:string,error?:unknown)=>{if(finished)return;finished=true;clearTimeout(timer);db?.close();probe.disabled=false;profileTrace(stage,error);};
  const timer=setTimeout(()=>{try{tx?.abort();}catch{}finish('WRITE_PROBE_TIMEOUT');},15000);
  profileTrace('WRITE_PROBE_START (no data changes)');
  try{const open=indexedDB.open('hexhold.player-profile');open.onupgradeneeded=()=>open.transaction?.abort();open.onerror=()=>finish('WRITE_PROBE_OPEN_ERROR',open.error);open.onblocked=()=>finish('WRITE_PROBE_BLOCKED');
   open.onsuccess=()=>{db=open.result;if(finished){db.close();return;}try{tx=db.transaction('meta','readwrite');const get=tx.objectStore('meta').get('profile');
    get.onsuccess=()=>{read=true;profileTrace('WRITE_PROBE_GET_OK');tx?.abort();};get.onerror=()=>profileTrace('WRITE_PROBE_GET_ERROR',get.error);
    tx.onabort=()=>finish(read?'WRITE_PROBE_OK (intentionally aborted, no writes)':'WRITE_PROBE_ABORT',read?undefined:tx?.error);tx.oncomplete=()=>finish('WRITE_PROBE_COMPLETE (no writes)');
   }catch(error){finish('WRITE_PROBE_ERROR',error);}};
  }catch(error){finish('WRITE_PROBE_ERROR',error);}
 };panel.append(probe);
 output=document.createElement('pre');output.style.cssText='white-space:pre-wrap;overflow-wrap:anywhere;margin:8px 0 0';panel.append(output);document.body.append(panel);
 const toggle=document.createElement('button');toggle.id='profile-diagnostics-toggle';toggle.textContent='접기';panel.prepend(toggle);
 toggle.onclick=()=>{const collapsed=!output!.hidden;output!.hidden=collapsed;title.hidden=copy.hidden=probe.hidden=collapsed;toggle.textContent=collapsed?'진단 열기':'접기';panel.style.width=collapsed?'auto':'min(560px,95vw)';panel.style.right=collapsed?'auto':'8px';panel.style.left=collapsed?'8px':'auto';};
 profileTrace('BOOT UA='+navigator.userAgent);profileTrace('Origin='+location.origin+' secureContext='+window.isSecureContext);
 window.addEventListener('error',event=>profileTrace('WINDOW_ERROR',event.error??event.message));
 window.addEventListener('unhandledrejection',event=>profileTrace('UNHANDLED_REJECTION',event.reason));
}
