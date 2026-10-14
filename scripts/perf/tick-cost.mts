// Node tick cost (performance PRD M2-b), following the bot freeze cost protocol
// (evidence/bot-inner-anchor-adoption/cost.json): observer-free 120 s runs, 8 seeds x 3 rounds,
// AB/BA order alternating by round+seed, one discarded seed-19 warmup per arm, and rows that overlap an
// external Vitest/Playwright/perf process are excluded. Adds per-tick p50/p95/max and a bot/engine split.
//   node scripts/perf/tick-cost.mts --arms frozen=.local/perf/frozen-cb15860,candidate=. --out .local/perf/tick-cost.json
import {execFileSync} from 'node:child_process';
import {mkdirSync,writeFileSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {loadModules,createScenario,FREEZE_SEEDS,type ScenarioName,type Modules} from './scenario.mts';
const args=new Map<string,string>();
for(let i=2;i<process.argv.length;i+=2)args.set(process.argv[i].replace(/^--/,''),process.argv[i+1]??'');
const arms=(args.get('arms')??'current=.').split(',').map(a=>{const [name,dir]=a.split('=');return {name,dir:resolve(dir)};});
const seeds=(args.get('seeds')??FREEZE_SEEDS.join(',')).split(',').map(Number),rounds=Number(args.get('rounds')??3),ticks=Number(args.get('ticks')??3600);
const scenario=(args.get('scenario')??'bots14') as ScenarioName;
const busyPattern=/vitest|playwright|trajectory-equivalence|run-autoplay|tick-cost-other/i;
function externalLoad():string[]{
 if(process.platform!=='win32')return [];
 try{const out=execFileSync('powershell',['-NoProfile','-Command',"Get-CimInstance Win32_Process -Filter \"Name='node.exe'\" | ForEach-Object { \"$($_.ProcessId) $($_.CommandLine)\" }"],{encoding:'utf8',timeout:20000});
  return out.split(/\r?\n/).filter(line=>busyPattern.test(line)&&!line.startsWith(String(process.pid)+' '));}catch{return ['probe-failed'];}
}
const q=(sorted:Float64Array,p:number)=>sorted[Math.min(sorted.length-1,Math.floor(p*sorted.length))];
function run(m:Modules,seed:number){
 const s=createScenario(m,scenario,seed),total=new Float64Array(ticks);let bot=0,engine=0;
 for(let t=0;t<ticks;t++){const a=performance.now();const inputs=s.inputs();const b=performance.now();s.step(inputs);const c=performance.now();total[t]=c-a;bot+=b-a;engine+=c-b;}
 const sum=total.reduce((n,v)=>n+v,0),sorted=total.slice().sort();
 return {msPerTick:sum/ticks,p50:q(sorted,.5),p95:q(sorted,.95),p99:q(sorted,.99),max:sorted[ticks-1],botMsPerTick:bot/ticks,engineMsPerTick:engine/ticks,deaths:s.match.participants.reduce((n:number,p:any)=>n+p.deaths,0)};
}
const modules=new Map<string,Modules>();for(const arm of arms)modules.set(arm.name,await loadModules(arm.dir));
for(const arm of arms){run(modules.get(arm.name)!,19);console.error('warmup',arm.name,'seed 19 discarded');}
const rows:any[]=[];
for(let round=0;round<rounds;round++)for(const [i,seed]of seeds.entries())for(const arm of (round+i)%2?[...arms].reverse():arms){
 const before=externalLoad(),result=run(modules.get(arm.name)!,seed),after=externalLoad();
 const row={round,seed,arm:arm.name,...result,overlap:before.length>0||after.length>0,overlapWith:[...new Set([...before,...after])].map(l=>l.slice(0,160))};rows.push(row);
 console.error(`round ${round} seed ${seed} ${arm.name}: ${result.msPerTick.toFixed(3)} ms/tick p95 ${result.p95.toFixed(2)} max ${result.max.toFixed(1)}${row.overlap?' (OVERLAP, excluded)':''}`);
}
const median=(v:number[])=>{const s=[...v].sort((a,b)=>a-b);return s.length?s[Math.floor((s.length-1)/2)]:NaN;};
const summary=Object.fromEntries(arms.map(arm=>{
 const mine=rows.filter(r=>r.arm===arm.name&&!r.overlap);
 const roundMs=[...Array(rounds).keys()].map(r=>{const x=mine.filter(v=>v.round===r);return x.length===seeds.length?x.reduce((n,v)=>n+v.msPerTick,0)/x.length:NaN;}).filter(Number.isFinite);
 const bySeed=seeds.map(seed=>{const x=mine.filter(v=>v.seed===seed);return {seed,samples:x.length,msPerTick:median(x.map(v=>v.msPerTick)),p95:median(x.map(v=>v.p95)),max:median(x.map(v=>v.max)),botMsPerTick:median(x.map(v=>v.botMsPerTick)),engineMsPerTick:median(x.map(v=>v.engineMsPerTick))};});
 return [arm.name,{dir:arm.dir,roundMsPerTick:roundMs,medianMsPerTick:median(roundMs),seedMedianP95:median(bySeed.map(s=>s.p95)),seedMedianMax:median(bySeed.map(s=>s.max)),botShare:median(bySeed.map(s=>s.botMsPerTick/s.msPerTick)),bySeed}];
}));
const comparison=arms.length===2?(()=>{const [a,b]=arms.map(x=>summary[x.name]);const pairs=a.bySeed.map((s:any,i:number)=>(b.bySeed[i].msPerTick-s.msPerTick)/s.msPerTick*100);return {baseline:arms[0].name,candidate:arms[1].name,medianPercent:median(pairs),perSeedPercent:pairs};})():null;
const report={tool:'perf-tick-cost v1',scenario,ticks,seeds,rounds,method:'Observer-free, warmup seed19 discarded per arm, AB/BA alternating by round+seed, overlapping rows excluded; median of round mean ms/tick plus per-seed medians of p95/max.',node:process.version,summary,comparison,rows};
const out=args.get('out');if(out){mkdirSync(dirname(resolve(out)),{recursive:true});writeFileSync(resolve(out),JSON.stringify(report,null,1)+'\n');}
for(const [name,s]of Object.entries(summary))console.error(name,'median ms/tick',(s as any).medianMsPerTick?.toFixed(3),'p95',(s as any).seedMedianP95?.toFixed(2),'max',(s as any).seedMedianMax?.toFixed(1),'bot share',((s as any).botShare*100).toFixed(0)+'%');
if(comparison)console.error('candidate vs baseline median',comparison.medianPercent.toFixed(2)+'%');
