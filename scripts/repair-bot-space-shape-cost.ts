import {readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {performance} from 'node:perf_hooks';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const root=resolve('../bot-space-shape-adoption'),p=JSON.parse(readFileSync(resolve(root,'protocol.json'),'utf8'));
const original=JSON.parse(readFileSync(resolve(root,'performance.json'),'utf8'));assert.equal(original.batches.length,48);assert(original.summary);
const target=resolve(root,'performance-verified.json');
const modules=new Map<string,any>(),references=new Map<string,Map<number,number>>();
for(const arm of p.arms){
 for(const [file,hash]of Object.entries(arm.sourceHashes))assert.equal(createHash('sha256').update(readFileSync(resolve(arm.source,file))).digest('hex'),hash);
 const load=(f:string)=>import(pathToFileURL(resolve(arm.source,'src/shared',f+'.ts')).href);
 modules.set(arm.name,await Promise.all(['game','bot','bot-identity','bot-director','safe-bot-respawn'].map(load)));
 references.set(arm.name,new Map(JSON.parse(readFileSync(resolve(root,arm.name+'.json'),'utf8')).reports.map((r:any)=>[r.seed,r.deaths])));
}
const probe="$tests=Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'node.exe' -and $_.CommandLine -match 'vitest|playwright.*(cli|workerProcessEntry)' }; $tests.ProcessId -join ','";
const external=()=>execFileSync('powershell.exe',['-NoProfile','-Command',probe],{encoding:'utf8',windowsHide:true}).trim();
function run(arm:string,seed:number){
 assert.equal(external(),'');const [game,bot,identity,director,respawn]=modules.get(arm);
 const m=game.createMatch({mapRadius:56,spawnRadius:1,maxSlots:14},seed,bot.botSpecs(14,0,'bot',{seed}));respawn.setSafeBotRespawn(m,true);
 const memories=new Map(m.participants.map((p:any)=>[p.participantId,bot.createBotMemory(identity.botSeed(seed,p.slot),'combined',identity.createBotIdentity(identity.botSeed(seed,p.slot),p.personality))]));
 const startedUtc=new Date().toISOString(),cpuStart=process.cpuUsage(),start=performance.now();
 for(let t=0;t<3600;t++)game.stepMatch(m,director.getBotInputs(m,memories));
 const elapsedMs=performance.now()-start,cpu=process.cpuUsage(cpuStart),deaths=m.participants.reduce((n:number,p:any)=>n+p.deaths,0);
 assert.equal(m.tick,3600);assert.equal(deaths,references.get(arm)!.get(seed));assert.equal(external(),'');
 return {round:0,arm,seed,ticks:m.tick,deaths,elapsedMs,msPerTick:elapsedMs/3600,startedUtc,endedUtc:new Date().toISOString(),cpuUserMs:cpu.user/1000,cpuSystemMs:cpu.system/1000,repaired:true};
}
// One brief fixture diagnostic was run after cost dispatch. Its exact overlap
// was not recorded, so replace the first two seed pairs without looking at
// their timing values. Preserve all originals, including the entire first run.
for(const arm of p.arms){run(arm.name,19);console.error('Repair warmup '+arm.name);}
const replacements:any[]=[];
for(const [arm,seed]of [['baseline',4],['candidate',4],['candidate',19],['baseline',19]]as const){const row=run(arm,seed);replacements.push(row);console.error('Repair round1 seed'+seed+' '+arm+' '+row.msPerTick.toFixed(3));}
const batches=original.batches.map((r:any)=>r.round===0&&[4,19].includes(r.seed)?replacements.find(v=>v.arm===r.arm&&v.seed===r.seed)!:r);
const median=(xs:number[])=>[...xs].sort((a,b)=>a-b)[Math.floor(xs.length/2)];
const summary=Object.fromEntries(p.arms.map((arm:any)=>{const rows=batches.filter((r:any)=>r.arm===arm.name),rounds=[0,1,2].map(round=>rows.filter((r:any)=>r.round===round).reduce((n:number,r:any)=>n+r.elapsedMs,0)/(3600*p.seeds.length));return [arm.name,{roundMsPerTick:rounds,medianMsPerTick:median(rounds),bySeed:p.seeds.map((seed:number)=>({seed,samples:rows.filter((r:any)=>r.seed===seed).map((r:any)=>r.msPerTick),medianMsPerTick:median(rows.filter((r:any)=>r.seed===seed).map((r:any)=>r.msPerTick))}))}];}));
writeFileSync(target,JSON.stringify({method:p.cost,originalFile:'performance.json',replacementReason:'Potential overlap with one brief fixture diagnostic; first round seed4/19 pairs replaced regardless of measured values. Originals preserved.',replacedOriginals:original.batches.filter((r:any)=>r.round===0&&[4,19].includes(r.seed)),additionalWarmup:{seed:19,perArm:1,discarded:true},resourceGuard:original.resourceGuard,batches,summary},null,2)+'\n');
console.log(JSON.stringify(summary));
