// Measurement driver (performance PRD M3/M4). Opens the game in autoplay measurement mode, samples the
// in-page meter (window.__HEXHOLD_PERF__) every interval and, for a phone, battery temperature via adb.
//
// PC (Playwright Chromium against a running dev/test server):
//   node scripts/perf/run-autoplay.mts --url "http://127.0.0.1:5181/" --out .local/perf/pc.json
// Phone (measurement APK, WebView debugging forwarded with scripts/perf/adb-forward.mts):
//   node scripts/perf/run-autoplay.mts --cdp http://127.0.0.1:9222 --url "https://localhost/" --adb <serial> --out .local/perf/s24.json
// Query parameters for autoplay (seed, rounds, followed bot, colour style) are added here and recorded.
import {chromium,type Page} from '@playwright/test';
import {execFileSync} from 'node:child_process';
import {mkdirSync,writeFileSync} from 'node:fs';
import {dirname} from 'node:path';
const args=new Map<string,string>();
for(let i=2;i<process.argv.length;i+=2)args.set(process.argv[i].replace(/^--/,''),process.argv[i+1]??'');
const base=args.get('url')??'http://127.0.0.1:5181/',out=args.get('out')??'.local/perf/run.json';
const seed=args.get('seed')??'137',rounds=args.get('rounds')??'3',follow=args.get('follow')??'0',color=args.get('color')??'pastel',roundSeconds=args.get('round-seconds')??'240';
const sampleSeconds=Number(args.get('sample')??30),maxSeconds=Number(args.get('max')??(Number(rounds)*Number(roundSeconds)+120));
const extra=args.get('params')??'';
const adbPath=args.get('adb-path')??process.env.ADB??'adb',serial=args.get('adb');
const width=Number(args.get('width')??915),height=Number(args.get('height')??412);
const url=new URL(base);
for(const [k,v]of Object.entries({metrics:'1',perf:'autoplay',perfSeed:seed,perfRounds:rounds,perfFollow:follow,perfColor:color,perfRoundSeconds:roundSeconds}))url.searchParams.set(k,v);
for(const pair of extra.split('&').filter(Boolean)){const [k,v='']=pair.split('=');url.searchParams.set(k,v);}
function adb(...command:string[]):string{return execFileSync(adbPath,['-s',serial!,...command],{encoding:'utf8',timeout:15000});}
function device(){
 if(!serial)return null;
 try{
  const battery=adb('shell','dumpsys','battery'),temp=/temperature:\s*(\d+)/.exec(battery)?.[1],level=/level:\s*(\d+)/.exec(battery)?.[1];
  const ac=/(AC|USB|Wireless) powered:\s*true/.test(battery);
  let thermal:number|null=null;try{thermal=Number(/Thermal Status:\s*(\d+)/.exec(adb('shell','dumpsys','thermalservice'))?.[1]??NaN);}catch{}
  return {batteryC:temp?Number(temp)/10:null,batteryLevel:level?Number(level):null,charging:ac,thermalStatus:Number.isFinite(thermal)?thermal:null};
 }catch(error){return {error:String(error)};}
}
const browser=args.has('cdp')?await chromium.connectOverCDP(args.get('cdp')!):await chromium.launch({headless:args.get('headed')!=='1',args:['--enable-gpu','--ignore-gpu-blocklist']});
let page:Page;
if(args.has('cdp')){const context=browser.contexts()[0];page=context.pages()[0]??await context.newPage();}
else page=await (await browser.newContext({viewport:{width,height},deviceScaleFactor:Number(args.get('dpr')??2.625),isMobile:false})).newPage();
const errors:string[]=[];page.on('pageerror',error=>errors.push(String(error)));
await page.goto(url.toString());
await page.waitForFunction(()=>!!(window as any).__HEXHOLD_PERF__,undefined,{timeout:30000});
// Keep the phone screen on for the run without changing device settings (Screen Wake Lock, released on exit).
if(args.has('cdp'))console.error('wake lock',await page.evaluate(async()=>{try{await (navigator as any).wakeLock.request('screen');return 'on';}catch(e){return 'unavailable: '+e;}}));
const startedAt=Date.now(),samples:unknown[]=[];
const record=async()=>{const snapshot=await page.evaluate(s=>(window as any).__HEXHOLD_PERF__.snapshot(s),sampleSeconds);
 samples.push({elapsedSeconds:Math.round((Date.now()-startedAt)/1000),device:device(),...snapshot});
 const s=snapshot as any;console.error(`[${Math.round((Date.now()-startedAt)/1000)}s] render ${s.spans.rendersPerSecond}/s, cpu p95 ${s.frames.frameCpu.p95}ms, js ${s.spans.jsMsPerSecond}ms/s`);};
const save=async(final:boolean)=>{
 const result={url:url.toString(),startedAt:new Date(startedAt).toISOString(),sampleSeconds,deviceAtStart:samples.length?(samples[0] as any).device:null,samples,errors,
  ...(final?{final:await page.evaluate(()=>(window as any).__HEXHOLD_PERF__.snapshot()),rows:await page.evaluate(()=>(window as any).__HEXHOLD_PERF__.rows(0))}:{})};
 mkdirSync(dirname(out),{recursive:true});writeFileSync(out,JSON.stringify(result,null,1)+'\n');
};
const startDevice=device();if(startDevice)console.error('device at start',startDevice);
while((Date.now()-startedAt)/1000<maxSeconds){
 await page.waitForTimeout(sampleSeconds*1000);await record();await save(false);
 if(await page.evaluate(()=>(window as any).__HEXHOLD_PERF__.info.done===true))break;
}
await save(true);console.error('saved',out,errors.length?'errors: '+errors.length:'');
if(!args.has('cdp'))await browser.close();else await browser.close().catch(()=>{});
