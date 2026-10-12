import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {performance,PerformanceObserver} from 'node:perf_hooks';
const local=resolve('../bot-phase025-closeout'),protocol=JSON.parse(readFileSync('evidence/bot-phase025-closeout/protocol.json','utf8'));
const definition=protocol.arms.find((a:any)=>a.name==='current');
for(const [name,hash] of Object.entries(definition.sourceHashes))if(createHash('sha256').update(readFileSync(resolve(definition.source,name))).digest('hex')!==hash)throw Error('Frozen source changed '+name);
const oldPath=resolve('../bot-perf-rp-review/performance.json'),oldBytes=readFileSync(oldPath),oldHash=createHash('sha256').update(oldBytes).digest('hex');
const previous=JSON.parse(oldBytes.toString()),old=previous.batches.find((r:any)=>r.arm==='optimized'&&r.seed===11&&r.round===2);
const reference=JSON.parse(readFileSync(resolve('../bot-perf-rp-review/optimized.json'),'utf8')).reports.find((r:any)=>r.seed===11);
const load=(p:string)=>import(pathToFileURL(resolve(definition.source,'src/shared',p+'.ts')).href);
const [game,bot,identity,director,respawn]=await Promise.all(['game','bot','bot-identity','bot-director','safe-bot-respawn'].map(load));
const probe=()=>{const ps=JSON.parse(readFileSync(resolve(local,'background-before.json'),'utf8').replace(/^\uFEFF/,''));return ps;};
function run(seed:number,diagnostic=false){
 const match=game.createMatch({mapRadius:56,spawnRadius:1},seed,bot.botSpecs(14,0,'bot',{seed}));respawn.setSafeBotRespawn(match,true);
 const memories=new Map<string,any>(match.participants.map((p:any)=>[p.participantId,bot.createBotMemory(identity.botSeed(seed,p.slot),'combined',identity.createBotIdentity(identity.botSeed(seed,p.slot),p.personality))]));
 const heapBefore=process.memoryUsage(),gcRows:any[]=[],slowTicks:{tick:number;ms:number}[]=[],blockRows:any[]=[];
 const observer=diagnostic?new PerformanceObserver(list=>{for(const e of list.getEntries())gcRows.push({startTime:e.startTime,duration:e.duration,detail:(e as any).detail});}):null;observer?.observe({entryTypes:['gc']});
 const start=performance.now(),startCpu=process.cpuUsage();let blockTime=start,blockCpu=process.cpuUsage();
 for(let i=0;i<3600&&match.phase==='RUNNING';i++){
  const t=diagnostic?performance.now():0;game.stepMatch(match,director.getBotInputs(match,memories));
  if(diagnostic){const ms=performance.now()-t;slowTicks.push({tick:match.tick,ms});if(match.tick%300===0){const cpu=process.cpuUsage(blockCpu);blockRows.push({lastTick:match.tick,wallMs:performance.now()-blockTime,cpuMs:(cpu.user+cpu.system)/1000});blockTime=performance.now();blockCpu=process.cpuUsage();}}
 }
 const elapsedMs=performance.now()-start,cpu=process.cpuUsage(startCpu),heapAfter=process.memoryUsage(),end=performance.now();
 const deaths=match.participants.reduce((n:number,p:any)=>n+p.deaths,0),nextRng=Object.fromEntries([...memories].map(([id,memory])=>[id,memory.random()]));
 return {row:{seed,ticks:match.tick,deaths,elapsedMs,msPerTick:elapsedMs/match.tick,cpuUserMs:cpu.user/1000,cpuSystemMs:cpu.system/1000,cpuTotalMs:(cpu.user+cpu.system)/1000,wallMinusCpuMs:elapsedMs-(cpu.user+cpu.system)/1000,heapBefore,heapAfter,slowestTicks:slowTicks.sort((a,b)=>b.ms-a.ms).slice(0,10),blocks:blockRows,nextRng},observer,gcRows,start,end};
}
const warmup=run(19);console.error('Diagnostic warmup discarded');
const {row,observer,gcRows,start,end}=run(11,true);await new Promise<void>(resolve=>setImmediate(resolve));observer?.disconnect();
if(row.ticks!==3600||row.deaths!==reference.deaths||JSON.stringify(row.nextRng)!==JSON.stringify(reference.equivalenceProof.nextRng))throw Error('Diagnostic behavior changed');
if(createHash('sha256').update(readFileSync(oldPath)).digest('hex')!==oldHash)throw Error('Original sample changed');
const output={purpose:'One cause-only seed11 repeat, not a replacement or added cost sample. Per-tick clocks and GC observer only in diagnostic; no behavior observers.',atUtc:new Date().toISOString(),node:process.version,old,oldFileSha256:oldHash,warmup:{seed:19,ticks:3600,discarded:true},diagnostic:row,gc:gcRows.filter(r=>r.startTime>=start&&r.startTime<=end),backgroundBefore:probe(),preservedOriginal:true,behaviorCheck:'3600 ticks, deaths, all next RNG values identical to original optimized seed11 audit'};
writeFileSync(resolve(local,'outlier-diagnostic.json'),JSON.stringify(output,null,2));console.log(JSON.stringify({msPerTick:row.msPerTick,wallMs:row.elapsedMs,cpuMs:row.cpuTotalMs,slowest:row.slowestTicks.slice(0,3),deaths:row.deaths,gcCount:output.gc.length}));
