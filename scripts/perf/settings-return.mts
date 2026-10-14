// Measure rendered movement as well as FPS: 60 renders/s can still display 30 Hz position jumps.
// Node 24, debug apk-perf, an unlocked phone, and adb-forward.mts are required.
// node scripts/perf/settings-return.mts --cdp http://127.0.0.1:9234 --out .local/settings-return.json
import {chromium} from '@playwright/test';
import {mkdirSync,writeFileSync} from 'node:fs';
import {dirname} from 'node:path';
const args=new Map<string,string>();
for(let i=2;i<process.argv.length;i+=2)args.set(process.argv[i].replace(/^--/,''),process.argv[i+1]??'');
const cdp=args.get('cdp');if(!cdp)throw Error('--cdp is required');
const out=args.get('out')??'.local/settings-return.json',url=new URL(args.get('url')??'https://localhost/');
for(const [key,value]of Object.entries({metrics:'1',perf:'autoplay',perfSeed:args.get('seed')??'137',perfRoundSeconds:'900',perfRounds:'1'}))url.searchParams.set(key,value);
const browser=await chromium.connectOverCDP(cdp),page=browser.contexts()[0].pages()[0];
if(!page)throw Error('No game WebView found');
page.setDefaultTimeout(20000);page.setDefaultNavigationTimeout(20000);
const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
async function sample(){return page.evaluate(async()=>{
 const w=window as any,read=w.__HEXHOLD_PERF__?.renderState??w.__HEXHOLD_FRAME_STATE__;
 if(typeof read!=='function')throw Error('This measurement build needs the read-only renderState probe');
 const frames:any[]=[];let done=false,last=-1;
 const collect=()=>{const s=read();if(s.renderedAt!==last){last=s.renderedAt;frames.push(s);}if(!done)requestAnimationFrame(collect);};requestAnimationFrame(collect);
 await new Promise(r=>setTimeout(r,3000));done=true;
 let moving=0,stopped=0;
 for(let i=1;i<frames.length;i++){const a=frames[i-1],b=frames[i];if(a.lifeId!==b.lifeId||a.lifeState!=='ALIVE'||b.lifeState!=='ALIVE')continue;
  if(Math.hypot(b.camera.x-a.camera.x,b.camera.y-a.camera.y)>1e-6)moving++;else stopped++;
 }
 return {frames:frames.length,moving,stopped,movingPercent:Math.round(100*moving/Math.max(1,moving+stopped)),stats:w.__HEXHOLD_PERF__.snapshot(2)};
});}
try{
 await page.goto(url.toString(),{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>(window as any).__HEXHOLD_PERF__?.info.mode==='autoplay');
 await page.evaluate(async()=>{(window as any).settingsProbeWakeLock=await navigator.wakeLock.request('screen');});
 await page.waitForTimeout(10000);
 const before=await sample(),cycles=[];
 for(let i=0;i<Number(args.get('cycles')??3);i++){
  await page.locator('#settings').click();await page.waitForTimeout(1000);await page.locator('#settings-close').click();
  cycles.push(await sample());console.log('cycle',i+1,JSON.stringify(cycles.at(-1)));
 }
 mkdirSync(dirname(out),{recursive:true});writeFileSync(out,JSON.stringify({url:url.toString(),measuredAt:new Date().toISOString(),before,cycles,errors},null,2)+'\n');
}finally{
 await page.evaluate(async()=>{await (window as any).settingsProbeWakeLock?.release();}).catch(()=>{});await browser.close();
}
