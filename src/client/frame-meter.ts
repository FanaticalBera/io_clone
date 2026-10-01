export function startFrameMeter():void{
 if(new URLSearchParams(location.search).get('metrics')!=='1')return;
 const output=document.createElement('output');output.style.cssText='position:fixed;bottom:8px;left:50%;transform:translateX(-50%);padding:6px 10px;background:#08121fe8;color:#cbe5df;border:1px solid #527b78;border-radius:6px;font:11px monospace;pointer-events:none;z-index:50';
 output.setAttribute('aria-label','최근 30초 프레임 측정');document.body.append(output);
 let previous=0,lastReport=0;const frames:{at:number;dt:number}[]=[];
 document.addEventListener('visibilitychange',()=>{previous=0;frames.length=0;});
 const sample=(at:number)=>{if(!document.hidden){if(previous)frames.push({at,dt:at-previous});previous=at;
  while(frames.length&&at-frames[0].at>30000)frames.shift();
  if(at-lastReport>=1000){lastReport=at;const duration=frames.reduce((n,f)=>n+f.dt,0),fps=duration?frames.length*1000/duration:0;const sorted=frames.map(f=>f.dt).sort((a,b)=>b-a),worst=sorted.slice(0,Math.max(1,Math.ceil(sorted.length*.01)));
   const low=worst.length?1000/(worst.reduce((n,dt)=>n+dt,0)/worst.length):0;
   output.textContent='30s 평균 '+fps.toFixed(1)+' FPS · '+(duration/1000).toFixed(0)+'s 측정 · 1% '+low.toFixed(0)+(output.dataset.rtt?' · RTT '+output.dataset.rtt+'ms':'');
   output.dataset.fps=fps.toFixed(2);output.dataset.lowFps=low.toFixed(2);}
 }else previous=0;requestAnimationFrame(sample);};requestAnimationFrame(sample);
}

