import {mkdirSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {performance} from 'node:perf_hooks';

// No diagnostic observers: sustained self-play/cost screening, not human fun testing.
const arg=(name:string,fallback:string)=>process.argv.find(v=>v.startsWith('--'+name+'='))?.slice(name.length+3)??fallback;
const out=resolve(arg('out','.local/bot-duel-20261015/crowd')),ticks=Number(arg('ticks','1800'));
const seeds=arg('seeds','4,19,73,11,31,47,101,137').split(',').map(Number),repeats=Number(arg('repeats','1'));
const armNames=arg('arms','baseline,explorer-footprint,explorer-commit').split(',');
const modules=new Map<string,any[]>();
for(const name of armNames){
 const root=resolve(name==='baseline'?'.local/bot-duel-20261015/baseline':'.');
 const load=(file:string)=>import(pathToFileURL(resolve(root,'src/shared',file+'.ts')).href);
 modules.set(name,await Promise.all(['game','bot','bot-identity','bot-director','safe-bot-respawn',...(name==='baseline'||name==='default'?[]:['bot-encounter-experiment'])].map(load)));
}
const layouts=arg('layouts','standard,mini').split(',');
const results:any[]=[];mkdirSync(out,{recursive:true});
const percentile=(values:number[],p:number)=>values[Math.min(values.length-1,Math.floor(values.length*p))]??0;
function run(name:string,seed:number,layout:string,limit:number,repeat:number){
 const [game,bot,identity,director,respawn,experiment]=modules.get(name)!;
 const count=layout==='mini'?4:14,config={mapRadius:layout==='mini'?24:56,maxSlots:count,spawnRadius:1};
 const m=game.createMatch(config,seed,bot.botSpecs(count,0,'bot',{seed}),'duel-crowd-'+seed+'-'+layout);respawn.setSafeBotRespawn(m,true);
 const memories=new Map<string,any>(m.participants.map((p:any)=>{
  const memory=bot.createBotMemory(identity.botSeed(seed,p.slot),'combined',identity.createBotIdentity(identity.botSeed(seed,p.slot),p.personality));
  if(experiment)experiment.setBotEncounterExperiment(memory,name);return [p.participantId,memory];
 }));
 const hash=createHash('sha256'),times:number[]=[],row:any={name,seed,layout,repeat,ticks:0,deaths:0,wallDeaths:0,captures:0,deathCauses:{},territoryCellTicks:0,roles:{}};
 for(let n=0;n<limit&&m.phase==='RUNNING';n++){
  const before=m.eventCounter,start=performance.now(),inputs=director.getBotInputs(m,memories);game.stepMatch(m,inputs);
  const elapsed=performance.now()-start;if(n>=300)times.push(elapsed);
  hash.update(JSON.stringify([...inputs]));hash.update(m.owners);hash.update(Buffer.from(m.trailMasks.buffer));hash.update(JSON.stringify(m.participants.map((p:any)=>[p.lifeId,p.lifeState,p.position,p.direction,p.lastAppliedInputSeq])));
  for(const e of m.events)if(Number(e.eventId.split(':').at(-1))>before){
   if(e.type==='CAPTURE')row.captures++;
   if(e.type==='DEATH'){row.deaths++;row.wallDeaths+=Number(e.reason==='WALL_HIT');const cause=e.deathContext?.cause??e.reason;row.deathCauses[cause]=(row.deathCauses[cause]??0)+1;}
  }
  for(const p of m.participants){
   row.territoryCellTicks+=p.territoryCount;
   const r=row.roles[p.personality]??={aliveTicks:0,exposedTicks:0,trail4Ticks:0,territoryCellTicks:0,deaths:0};
   r.aliveTicks+=Number(p.lifeState==='ALIVE');r.exposedTicks+=Number(p.trailCells.size>0);r.trail4Ticks+=Number(p.trailCells.size>=4);r.territoryCellTicks+=p.territoryCount;
  }
  row.ticks++;
 }
 // Sum final per-participant death counters once, without double-counting roles.
 for(const r of Object.values(row.roles) as any[])r.deaths=0;
 for(const p of m.participants)row.roles[p.personality].deaths+=p.deaths;
 times.sort((a,b)=>a-b);row.cost={mean:times.reduce((a,b)=>a+b,0)/Math.max(1,times.length),p95:percentile(times,.95),p99:percentile(times,.99),samples:times.length};
 row.meanTerritoryPerBot=row.territoryCellTicks/Math.max(1,row.ticks*count);row.hash=hash.digest('hex');row.director=director.botDirector(m).snapshot().stats;
 return row;
}
// Warm each implementation before comparing AB/BA in a single process.
for(const name of armNames)run(name,19,'standard',360,-1);
for(let repeat=0;repeat<repeats;repeat++)for(const [index,seed]of seeds.entries())for(const layout of layouts){
 const order=(index+repeat)%2?[...armNames].reverse():armNames;
 for(const name of order){const row=run(name,seed,layout,ticks,repeat);results.push(row);console.log(JSON.stringify({name,seed,layout,repeat,deaths:row.deaths,wallDeaths:row.wallDeaths,meanTerritory:row.meanTerritoryPerBot,meanMs:row.cost.mean}));}
 writeFileSync(resolve(out,'results.json'),JSON.stringify({protocol:{seeds,ticks,repeats,armNames,layouts,warmup:'360 ticks per implementation; first 300 ticks excluded per measured run',measurement:'observer-free CPU simulation; rendering, Android thermal and human gameplay not measured'},results},null,2)+'\n');
}
