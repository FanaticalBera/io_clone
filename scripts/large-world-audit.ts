import {mkdirSync,writeFileSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {Session} from 'node:inspector';
import {createMatch,stepMatch,buildView} from '../src/shared/game.js';
import {botSpecs,createBotMemory,getBotInput,observeBot} from '../src/shared/bot.js';
import {hexDistance,region} from '../src/shared/hex.js';
import {inspectSpawnSpace,watchSpawnAttempts} from '../src/shared/spawn.js';
import {assertOwnershipCounts} from '../src/shared/territory.js';
import {packSnapshot,unpackSnapshot} from '../src/shared/protocol.js';
import type {Personality,MatchState} from '../src/shared/model.js';

export function statistics(values:number[]){
 if(!values.length)return null;const sorted=[...values].sort((a,b)=>a-b),q=(p:number)=>sorted[Math.min(sorted.length-1,Math.floor(sorted.length*p))];
 return {n:values.length,mean:values.reduce((s,n)=>s+n,0)/values.length,median:q(.5),p95:q(.95),p99:q(.99),max:sorted.at(-1)!};
}
export function inspectInitialPlacement(m:MatchState){
 const distances:number[]=[],claimed=new Set<number>(),points=new Set(m.map.controlPoints.map(cp=>cp.cellId));let overlaps=0,outOfMap=0,invalidZones=0,controlPointOverlaps=0;
 for(let i=0;i<m.participants.length;i++)for(let j=i+1;j<m.participants.length;j++)distances.push(hexDistance(m.map.cells[m.participants[i].cellId],m.map.cells[m.participants[j].cellId]));
 const size=1+3*m.config.spawnRadius*(m.config.spawnRadius+1);
 for(const p of m.participants){const zone=region(m.map,p.cellId,m.config.spawnRadius);if(zone.length!==size||p.territoryCount!==size||zone.some(id=>id<0||m.owners[id]!==p.slot+1))invalidZones++;
  for(const id of zone){if(id<0){outOfMap++;continue;}if(claimed.has(id))overlaps++;claimed.add(id);if(points.has(id))controlPointOverlaps++;}
 }
 const owned=m.owners.reduce((n,owner)=>n+Number(owner>0),0);
 return {minDistance:distances.length?Math.min(...distances):null,meanDistance:statistics(distances)?.mean??null,owned,neutral:m.owners.length-owned,overlaps,outOfMap,invalidZones,controlPointOverlaps};
}
export function runLargeWorld(radius:number,count:number,seed:number,minutes:number){
 const initAt=performance.now(),m=createMatch({mapRadius:radius,maxSlots:count},seed,botSpecs(count),`large-${radius}-${count}-${seed}`),memories=m.participants.map(p=>createBotMemory(seed^(p.slot*2654435761))),total=m.owners.length,hz=m.config.simulationHz;
 const initial=inspectInitialPlacement(m);
 const creationMs=performance.now()-initAt,tickMs:number[]=[],observeMs:number[]=[],decisionMs:number[]=[],spawnMs:number[]=[],snapshotBytes:number[]=[],samples:unknown[]=[],checkpoints:{seconds:number;hash:string}[]=[];
 const personalities=Object.fromEntries(['EXPAND','ATTACK','DEFEND','SEEK_POINT'].map(p=>[p,{captures:0,capturedCells:0,deaths:0,kills:0,stolenCells:0,attackEntries:0}])) as Record<Personality,{captures:number;capturedCells:number;deaths:number;kills:number;stolenCells:number;attackEntries:number}>;
 let firstContact:number|null=null,firstKill:number|null=null,captures=0,capturedCells=0,wallDeaths=0,spawnAttempts=0,spawnSuccess=0,spawnBlocked=0,aliveTicks=0,trailTicks=0;
 let captureTickTotal=0,captureTicks=0;const violations:string[]=[],logicalHash=createHash('sha256');
 watchSpawnAttempts(m,a=>{spawnAttempts++;if(a.success)spawnSuccess++;else spawnBlocked++;if(a.success!==(a.validCenterCount>0))violations.push('Spawn outcome mismatch');});
 const start=performance.now();
 while(m.tick<Math.round(minutes*60*hz)&&m.phase==='RUNNING'){
  const before=m.eventCounter,beforeOwners=m.owners.slice(),inputs=new Map();let at=performance.now();
  for(const [i,p]of m.participants.entries()){
   const decision=p.lifeState==='ALIVE'&&m.tick>=memories[i].nextDecisionTick,previous=memories[i].goal,t=performance.now(),obs=observeBot(m,p.participantId);
   const observedAt=performance.now();if(decision)observeMs.push(observedAt-t);
   const input=getBotInput(obs,memories[i]);if(decision)decisionMs.push(performance.now()-observedAt);
   if(previous!=='ATTACK'&&memories[i].goal==='ATTACK')personalities[p.personality!].attackEntries++;
   if(input)inputs.set(p.participantId,input);
  }
  stepMatch(m,inputs);const elapsed=performance.now()-at;tickMs.push(elapsed);
  const events=m.events.filter(e=>Number(e.eventId.split(':').at(-1))>before);let didCapture=false;
  for(const e of events){
   const p=m.participants.find(p=>p.participantId===e.participantId)!,stats=personalities[p.personality!];
   if(e.type==='CAPTURE'){didCapture=true;captures++;capturedCells+=e.amount??0;stats.captures++;stats.capturedCells+=e.amount??0;}
   if(e.type==='DEATH'){stats.deaths++;if(e.killerId){firstKill??=(e.deathContext?.eventTick??e.tick)/hz;personalities[m.participants.find(p=>p.participantId===e.killerId)!.personality!].kills++;}
    if(e.reason==='WALL_HIT')wallDeaths++;if(['EXISTING_TRAIL_CONTACT','PENDING_TRAIL_CONTACT'].includes(e.deathContext?.cause??''))firstContact??=(e.deathContext?.eventTick??e.tick)/hz;
   }
  }
  if(didCapture){captureTickTotal+=elapsed;captureTicks++;for(let id=0;id<total;id++)if(beforeOwners[id]>0&&m.owners[id]>0&&beforeOwners[id]!==m.owners[id])personalities[m.participants.find(p=>p.slot+1===m.owners[id])!.personality!].stolenCells++;}
  const alive=m.participants.filter(p=>p.lifeState==='ALIVE');aliveTicks+=alive.length;trailTicks+=alive.reduce((s,p)=>s+p.trailCells.size,0);
  if(m.tick%hz===0){
   assertOwnershipCounts(m);for(const p of m.participants)for(const id of p.trailCells)if(!(m.trailMasks[id]&(1<<p.slot)))violations.push('Missing trail bit');
   const occupied=m.participants.reduce((s,p)=>s+p.territoryCount,0),leader=Math.max(...m.participants.map(p=>p.territoryCount));
   samples.push({seconds:m.tick/hz,occupiedPercent:occupied*100/total,leaderPercent:leader*100/total,alive:alive.length,spawnBlocked:m.participants.filter(p=>p.lifeState==='SPAWN_BLOCKED').length});
   const view=buildView(m),wire=packSnapshot(view,m.tick,0,null);snapshotBytes.push(Buffer.byteLength(JSON.stringify(wire)));unpackSnapshot(wire);
   logicalHash.update(JSON.stringify({owners:[...m.owners],trails:[...m.trailMasks],participants:m.participants.map(p=>[p.slot,p.position,p.lifeState,p.lifeId,p.kills,p.deaths]),goals:memories.map(memory=>[memory.goal,memory.path]),events:m.events}));
   if(m.tick%(hz*300)===0)checkpoints.push({seconds:m.tick/hz,hash:logicalHash.copy().digest('hex')});
   if(m.tick%(hz*15)===0){at=performance.now();const space=inspectSpawnSpace(m);spawnMs.push(performance.now()-at);(samples.at(-1) as Record<string,unknown>).validSpawnCenters=space.validCenterCount;}
  }
 }
 const durationSeconds=m.tick/hz,deaths=m.participants.reduce((s,p)=>s+p.deaths,0),kills=m.participants.reduce((s,p)=>s+p.kills,0),bytes=statistics(snapshotBytes)!;
 return {radius,count,seed,totalCells:total,durationSeconds,wallSeconds:(performance.now()-start)/1000,creationMs,initial,firstContact,firstKill,deaths,kills,deathsPerMinute:deaths/(durationSeconds/60),killsPerMinute:kills/(durationSeconds/60),meanAlive:aliveTicks/m.tick,meanExposedTrail:trailTicks/aliveTicks,captures,capturedCells,wallDeaths,spawn:{attempts:spawnAttempts,success:spawnSuccess,blocked:spawnBlocked,scansPerSecond:spawnAttempts/durationSeconds},personalities,
  timing:{tick:statistics(tickMs),observation:statistics(observeMs),decision:statistics(decisionMs),sampledSpawnScan:statistics(spawnMs),captureTickMeanMs:captureTicks?captureTickTotal/captureTicks:null},snapshot:{bytes,bytesPerSecondPerClient:bytes.mean*m.config.snapshotHz,serverOutboundBytesPerSecondAtTwoClients:bytes.mean*m.config.snapshotHz*2,serverOutboundBytesPerSecondAtEightClients:bytes.mean*m.config.snapshotHz*8},hash:logicalHash.digest('hex'),checkpoints,violations,samples};
}
// CPU sampling attributes self/inclusive time without touching gameplay functions.
async function cpuProfile(radius:number,count:number,seed:number,ticks=1800){
 const session=new Session();session.connect();const post=(method:string,params={})=>new Promise<any>((resolve,reject)=>session.post(method,params,(error,result)=>error?reject(error):resolve(result)));
 try{await post('Profiler.enable');await post('Profiler.setSamplingInterval',{interval:500});await post('Profiler.start');
  const m=createMatch({mapRadius:radius,maxSlots:count},seed,botSpecs(count)),memories=m.participants.map(p=>createBotMemory(seed^(p.slot*2654435761))),times:number[]=[];
  for(let tick=0;tick<ticks;tick++){const at=performance.now(),inputs=new Map(m.participants.flatMap((p,i)=>{const input=getBotInput(observeBot(m,p.participantId),memories[i]);return input?[[p.participantId,input] as const]:[];}));stepMatch(m,inputs);times.push(performance.now()-at);}
  const {profile}=await post('Profiler.stop'),parents=new Map<number,number>(),nodes=new Map<number,any>(profile.nodes.map((n:any)=>[n.id,n])),costs=new Map<string,{selfMs:number;inclusiveMs:number}>();
  for(const n of profile.nodes)for(const child of n.children??[])parents.set(child,n.id);
  for(let i=0;i<(profile.samples??[]).length;i++){let id=profile.samples[i];const ms=(profile.timeDeltas[i]??0)/1000,seen=new Set<string>();let first=true;
   while(id){const name=nodes.get(id)?.callFrame.functionName??'(unknown)';let cost=costs.get(name);if(!cost){cost={selfMs:0,inclusiveMs:0};costs.set(name,cost);}if(first)cost.selfMs+=ms;if(!seen.has(name))cost.inclusiveMs+=ms;seen.add(name);first=false;id=parents.get(id);}
  }
  return {radius,count,seed,ticks,condition:'Observer-free simulation with V8 statistical CPU sampling; inclusive costs overlap',timing:statistics(times),hotspots:Object.fromEntries(['observeBot','rememberIncursions','shortestPath','returnPath','planExpansion','plannedCapture','planAttack','pruneDisconnectedTerritory','captureCandidates','inspectSpawnSpace','applySimultaneousCaptures'].map(name=>[name,costs.get(name)??{selfMs:0,inclusiveMs:0}]))};
 }finally{session.disconnect();}
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const arg=(key:string,fallback:string)=>{const i=process.argv.indexOf(key);return i<0?fallback:process.argv[i+1];},minutes=Number(arg('--minutes','5')),seeds=arg('--seeds','4,19,73,115').split(',').map(Number),profile=process.argv.includes('--profile');
 const cases=arg('--cases','22/8,48/14,56/14,56/16,64/16').split(',').map(v=>v.split('/').map(Number)),output=resolve(arg('--output',profile?'.local/large-world/profile.json':'.local/large-world/screening.json'));
 if(!Number.isFinite(minutes)||minutes<=0||minutes>20||seeds.some(s=>!Number.isInteger(s)||s<0||s>0xffffffff)||cases.some(([r,n])=>![22,48,56,64].includes(r)||![8,14,16].includes(n)))throw new Error('Invalid audit arguments');
 mkdirSync(dirname(output),{recursive:true});const results=[];
 for(const [radius,count]of cases)for(const seed of seeds){const result=profile?await cpuProfile(radius,count,seed):runLargeWorld(radius,count,seed,minutes);results.push(result);writeFileSync(output,JSON.stringify({condition:profile?'V8 desktop profiling':'Normal deterministic BOT gameplay; window is audit duration, not round limit',results},null,2));console.log(JSON.stringify({radius,count,seed,...(profile?{profile:true}:{minutes,wallSeconds:(result as ReturnType<typeof runLargeWorld>).wallSeconds,deaths:(result as ReturnType<typeof runLargeWorld>).deaths,violations:(result as ReturnType<typeof runLargeWorld>).violations.length})}));}
}
