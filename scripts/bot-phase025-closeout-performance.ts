import {execFileSync} from 'node:child_process';
import {performance} from 'node:perf_hooks';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const option=(prefix:string,fallback:string)=>process.argv.find(a=>a.startsWith(prefix))?.slice(prefix.length)??fallback;
const local=option('--local=','../bot-safety-separation'),protocol=JSON.parse(readFileSync(option('--protocol=','evidence/bot-safety-separation/protocol.json'),'utf8')),seeds:number[]=protocol.seeds,arms:string[]=protocol.arms.map((a:any)=>a.name);
const modules=new Map<string,any>(),references=new Map<string,Map<number,number>>();
for(const arm of arms){const definition=protocol.arms.find((a:any)=>a.name===arm),source=resolve(definition.source);
 for(const [file,hash]of Object.entries(definition.sourceHashes))if(createHash('sha256').update(readFileSync(resolve(source,file))).digest('hex')!==hash)throw Error('Source changed '+arm+' '+file);
 const load=(p:string)=>import(pathToFileURL(resolve(source,'src/shared',p+'.ts')).href);
 const [game,bot,identity,director,respawn]=await Promise.all(['game','bot','bot-identity','bot-director','safe-bot-respawn'].map(load));modules.set(arm,{game,bot,identity,director,respawn});
 references.set(arm,new Map(JSON.parse(readFileSync(local+'/'+arm+'.json','utf8')).reports.map((r:any)=>[r.seed,r.deaths])));
}
function run(arm:string,seed:number){const {game,bot,identity,director,respawn}=modules.get(arm),m=game.createMatch({mapRadius:56,spawnRadius:1},seed,bot.botSpecs(14,0,'bot',{seed}));respawn.setSafeBotRespawn(m,true);
 const memories=new Map(m.participants.map((p:any)=>[p.participantId,bot.createBotMemory(identity.botSeed(seed,p.slot),'combined',identity.createBotIdentity(identity.botSeed(seed,p.slot),p.personality))]));
 const startedUtc=new Date().toISOString(),cpuStart=process.cpuUsage(),start=performance.now();for(let i=0;i<3600&&m.phase==='RUNNING';i++)game.stepMatch(m,director.getBotInputs(m,memories));const elapsedMs=performance.now()-start,deaths=m.participants.reduce((n:number,p:any)=>n+p.deaths,0);
 if(m.tick!==3600||deaths!==references.get(arm)!.get(seed))throw Error('Benchmark behavior mismatch '+arm+' seed'+seed);
 const cpu=process.cpuUsage(cpuStart);return {arm,seed,ticks:m.tick,deaths,elapsedMs,msPerTick:elapsedMs/m.tick,startedUtc,endedUtc:new Date().toISOString(),cpuUserMs:cpu.user/1000,cpuSystemMs:cpu.system/1000};
}
// A new external test may start after the initial idle check. Exclude such
// timing rows regardless of their values; never stop another task's process.
const probe="$otherTests=Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'node.exe' -and $_.CommandLine -match 'vitest|playwright.*(cli|workerProcessEntry)' }; $otherTests.ProcessId -join ','";
const otherTests=()=>execFileSync('powershell.exe',['-NoProfile','-Command',probe],{encoding:'utf8',windowsHide:true}).trim();
const waits=new Int32Array(new SharedArrayBuffer(4));
let discardedOverlaps=0,idleWaits=0;
const recordBackground=process.argv.includes('--record-background');
function uncontendedRun(arm:string,seed:number){
 if(recordBackground){const before=otherTests(),row=run(arm,seed),after=otherTests();return {...row,externalTestProcessesBefore:before,externalTestProcessesAfter:after,overlapped:!!(before||after)};}
 for(;;){
 while(otherTests()){idleWaits++;console.error('Waiting for external tests before '+arm+' seed'+seed);Atomics.wait(waits,0,0,30000);}
 const row=run(arm,seed);
 if(!otherTests())return row;
 discardedOverlaps++;console.error('Discarded overlapping timing '+arm+' seed'+seed);
}}
for(const arm of arms){uncontendedRun(arm,19);console.error('Discarded warmup '+arm);}
const batches:any[]=[];
for(let round=0;round<3;round++)for(const [i,seed]of seeds.entries())for(const arm of (()=>{if(arms.length!==2)throw Error('Closing comparison expects two arms');const offset=(round+i)%2;return [...arms.slice(offset),...arms.slice(0,offset)];})()){const row={round,...uncontendedRun(arm,seed)};batches.push(row);writeFileSync(local+'/performance.json',JSON.stringify({method:protocol.cost,batches},null,2));console.error('Cost round'+(round+1)+' seed'+seed+' '+arm+' '+row.msPerTick.toFixed(3)+'ms/tick');}
const median=(a:number[])=>[...a].sort((a,b)=>a-b)[Math.floor(a.length/2)];
const summary=Object.fromEntries(arms.map(arm=>{const rows=batches.filter(r=>r.arm===arm),rounds=[0,1,2].map(round=>rows.filter(r=>r.round===round).reduce((n,r)=>n+r.elapsedMs,0)/(3600*seeds.length));return [arm,{roundMsPerTick:rounds,medianMsPerTick:median(rounds),bySeed:seeds.map(seed=>({seed,samples:rows.filter(r=>r.seed===seed).map(r=>r.msPerTick),medianMsPerTick:median(rows.filter(r=>r.seed===seed).map(r=>r.msPerTick))}))}];}));
writeFileSync(local+'/performance.json',JSON.stringify({method:protocol.cost,resourceGuard:{recordBackground,idleWaits,discardedOverlaps,overlappingRows:batches.filter(r=>r.overlapped).length,probe:recordBackground?'Record external Vitest/Playwright presence before/after every timing; retain all fixed rows, mark overlap, withhold cost certification':'Check external Vitest/Playwright presence before/after every timing; exclude overlap regardless of elapsed value'},warmup:{seed:19,ticks:3600,perArm:1,discarded:true},summary,batches},null,2));console.log(JSON.stringify(summary));