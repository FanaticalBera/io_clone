import {mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {resolve, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {performance} from 'node:perf_hooks';
import {createMatch, stepMatch} from '../src/shared/game.js';
import {botSpecs, createBotMemory, getBotInput, observeBotForTick} from '../src/shared/bot.js';
import {watchSpawnAttempts} from '../src/shared/spawn.js';
import {assertOwnershipCounts} from '../src/shared/territory.js';
import type {MatchState, Participant} from '../src/shared/model.js';

export const thresholds = [50,75,90,95,99,100] as const;
export type Times = Record<string,number|null>;
const emptyTimes = ():Times => Object.fromEntries(thresholds.map(t=>[t,null]));
export function recordThresholds(times:Times,cells:number,total:number,seconds:number):void {
 for(const t of thresholds)if(times[t]===null && cells*100>=t*total)times[t]=seconds;
}
export function statistics(values:number[]) {
 if(!values.length)return null;
 const a=[...values].sort((x,y)=>x-y),q=(p:number)=>a[Math.max(0,Math.ceil(p*a.length)-1)];
 return {n:a.length,mean:a.reduce((s,x)=>s+x,0)/a.length,median:q(.5),p75:q(.75),p90:q(.9),p95:q(.95),p99:q(.99),min:a[0],max:a[a.length-1]};
}
interface Life {
 participantId:string;slot:number;lifeId:number;startedSeconds:number;endedSeconds:number|null;
 durationSeconds:number;endReason:string;maxCells:number;maxPercent:number;peakSeconds:number;
 kills:number;deaths:number;thresholdTimes:Times;
}
interface Sample {
 seconds:number;leaderId:string;leaderLifeId:number;leaderCells:number;leaderPercent:number;
 neutralCells:number;alive:number;deadWait:number;spawnBlocked:number;territoryCounts:number[];
 deaths:number;respawns:number;blockedAttempts:number;
}
interface Episode {
 threshold:number;startSeconds:number;endSeconds:number;durationSeconds:number;leaderId:string;leaderLifeId:number;
 peakPercent:number;minLeaderPercent:number;leaderChanges:number;leaderDeaths:number;respawns:number;
 blockedAttempts:number;blockedParticipantSeconds:number;maxNeutralCells:number;retreatBelowThreshold:boolean;
}
export interface RunOptions {seed:number;minutes:number;instrument?:boolean;sampleSeconds?:number;retainTickTiming?:boolean;variant?:'production'|'no-respawn'}
export function logicalHash(m:MatchState,memories:ReturnType<typeof createBotMemory>[]) {
 return createHash('sha256').update(JSON.stringify({tick:m.tick,owners:[...m.owners],trails:[...m.trailMasks],participants:m.participants.map(p=>({...p,trailCells:[...p.trailCells],spawnCells:[...p.spawnCells]})),events:m.events,outcome:m.outcome,memories:memories.map(x=>({...x,knownHome:[...x.knownHome],grievances:[...x.grievances],random:undefined}))})).digest('hex');
}
export function runSeed(options:RunOptions) {
 const {seed,minutes,instrument=true,sampleSeconds=5,variant='production'}=options;
 const m=createMatch({},seed,botSpecs(16),`classic-validation-${seed}`),hz=m.config.simulationHz,total=m.map.cells.length;
 const memories=m.participants.map(p=>createBotMemory(seed^(p.slot*2654435761)));
 const times=emptyTimes(),thresholdParticipants:Record<string,{participantId:string;lifeId:number}|null>=Object.fromEntries(thresholds.map(t=>[t,null]));
 const lives:Life[]=[],active=new Map<string,Life>(),samples:Sample[]=[],episodes:Episode[]=[];
 const tickTimes:number[]=[],engineTimes:number[]=[],spawnEvents:unknown[]=[];
 const afterThreshold=Object.fromEntries([90,95,99].map(t=>[t,{deaths:0,respawns:0,blockedAttempts:0,blockedParticipantSeconds:0}]));
 let deaths=0,respawns=0,blockedAttempts=0,blockedParticipantTicks=0,aliveTicks=0,maxCells=0,peakSeconds=0;
 let lastLeaderKey='',leaderChanges=0;
 const pending=new Map<number,Episode>();
 const checkpoints:unknown[]=[];
 function startLife(p:Participant) {
  const row:Life={participantId:p.participantId,slot:p.slot,lifeId:p.lifeId,startedSeconds:m.tick/hz,endedSeconds:null,durationSeconds:0,endReason:'HORIZON',maxCells:p.territoryCount,maxPercent:p.territoryCount*100/total,peakSeconds:m.tick/hz,kills:0,deaths:0,thresholdTimes:emptyTimes()};
  lives.push(row);active.set(p.participantId,row);
 }
 if(instrument) {
  m.participants.forEach(startLife);
  watchSpawnAttempts(m,a=>{
   if(a.success){respawns++;startLife(m.participants.find(p=>p.participantId===a.participantId)!);}else blockedAttempts++;
   for(const t of [90,95,99])if(times[t]!==null){if(a.success)afterThreshold[t].respawns++;else afterThreshold[t].blockedAttempts++;}
   for(const e of pending.values()){if(a.success)e.respawns++;else e.blockedAttempts++;}
   const leaderAfter=Math.max(...m.participants.map(p=>p.territoryCount));
   spawnEvents.push({...a,seconds:a.tick/hz,leaderCellsAfterSpawn:leaderAfter,leaderCellsDelta:leaderAfter-a.leaderCells});
  });
 }
 function sample():Sample {
  const leader=m.participants.reduce((a,b)=>b.territoryCount>a.territoryCount?b:a);
  return {seconds:m.tick/hz,leaderId:leader.participantId,leaderLifeId:leader.lifeId,leaderCells:leader.territoryCount,leaderPercent:leader.territoryCount*100/total,
   neutralCells:total-m.participants.reduce((s,p)=>s+p.territoryCount,0),alive:m.participants.filter(p=>p.lifeState==='ALIVE').length,
   deadWait:m.participants.filter(p=>p.lifeState==='DEAD_WAIT').length,spawnBlocked:m.participants.filter(p=>p.lifeState==='SPAWN_BLOCKED').length,
   territoryCounts:m.participants.map(p=>p.territoryCount),deaths,respawns,blockedAttempts};
 }
 function newEpisode(t:number,state:Sample):Episode {
  return {threshold:t,startSeconds:state.seconds,endSeconds:state.seconds,durationSeconds:0,leaderId:state.leaderId,leaderLifeId:state.leaderLifeId,peakPercent:maxCells*100/total,minLeaderPercent:state.leaderPercent,leaderChanges:0,leaderDeaths:0,respawns:0,blockedAttempts:0,blockedParticipantSeconds:0,maxNeutralCells:state.neutralCells,retreatBelowThreshold:false};
 }
 if(instrument)samples.push(sample());
 const started=performance.now();
 while(m.tick<Math.round(minutes*60*hz)&&m.phase==='RUNNING') {
  const beforeEvent=m.eventCounter,at=performance.now(),inputs=new Map();
  for(const [i,p]of m.participants.entries())if(p.lifeState==='ALIVE') {
   const memory=memories[i];memory.seq=Math.max(memory.seq,p.lastAppliedInputSeq);
   const input=getBotInput(observeBotForTick(m,p.participantId,memory),memory);if(input)inputs.set(p.participantId,input);
  }
  const engineAt=performance.now();stepMatch(m,inputs);
  const ended=performance.now();tickTimes.push(ended-at);engineTimes.push(ended-engineAt);
  // Experiment-only control: retire dead BOTs after normal death resolution.
  if(variant==='no-respawn')for(const p of m.participants)if(p.lifeState==='DEAD_WAIT'||p.lifeState==='SPAWN_BLOCKED')p.lifeState='ELIMINATED';
  if(!instrument)continue;
  // Thresholds and peaks are observed at tick boundaries, consistently for matches and lives.
  for(const p of m.participants) {
   const row=active.get(p.participantId)!;
   if(p.territoryCount>row.maxCells){row.maxCells=p.territoryCount;row.maxPercent=p.territoryCount*100/total;row.peakSeconds=m.tick/hz;}
   if(p.lifeState==='ALIVE')recordThresholds(row.thresholdTimes,p.territoryCount,total,m.tick/hz-row.startedSeconds);
  }
  const events=m.events.filter(e=>Number(e.eventId.slice(e.eventId.lastIndexOf(':')+1))>beforeEvent);
  if(events.length!==m.eventCounter-beforeEvent)throw new Error('Telemetry event retention overflow');
  for(const e of events)if(e.type==='DEATH'&&e.killerId)active.get(e.killerId)!.kills++;
  for(const e of events)if(e.type==='DEATH') {
   deaths++;const row=active.get(e.participantId)!;row.deaths=1;row.endReason=e.deathContext?.cause??e.reason??'DEATH';
   row.endedSeconds=(e.deathContext?.eventTick??e.tick)/hz;row.durationSeconds=row.endedSeconds-row.startedSeconds;
   for(const t of [90,95,99])if(times[t]!==null)afterThreshold[t].deaths++;
   for(const ep of pending.values())if(ep.leaderId===e.participantId&&ep.leaderLifeId===e.lifeId)ep.leaderDeaths++;
  }
  const state=sample(),key=state.leaderId+':'+state.leaderLifeId,changed=!!lastLeaderKey&&key!==lastLeaderKey;
  aliveTicks+=state.alive;blockedParticipantTicks+=state.spawnBlocked;
  for(const t of [90,95,99])if(times[t]!==null)afterThreshold[t].blockedParticipantSeconds+=state.spawnBlocked/hz;
  if(changed)leaderChanges++;lastLeaderKey=key;
  const newRecord=state.leaderCells>maxCells;
  if(newRecord){maxCells=state.leaderCells;peakSeconds=m.tick/hz;}
  recordThresholds(times,state.leaderCells,total,state.seconds);
  for(const t of thresholds)if(times[t]!==null&&thresholdParticipants[t]===null)thresholdParticipants[t]={participantId:state.leaderId,lifeId:state.leaderLifeId};
  for(const t of [90,95,99]) {
   if(times[t]===null)continue;
   const ep=pending.get(t);
   if(ep) {
    ep.minLeaderPercent=Math.min(ep.minLeaderPercent,state.leaderPercent);ep.maxNeutralCells=Math.max(ep.maxNeutralCells,state.neutralCells);
    if(changed)ep.leaderChanges++;
    ep.retreatBelowThreshold ||= state.leaderPercent<t;
    ep.blockedParticipantSeconds+=state.spawnBlocked/hz;
    if(newRecord||m.phase!=='RUNNING'){ep.endSeconds=state.seconds;ep.durationSeconds=state.seconds-ep.startSeconds;if(ep.durationSeconds>=30)episodes.push(ep);pending.delete(t);}
   }
   if(!pending.has(t)&&m.phase==='RUNNING')pending.set(t,newEpisode(t,state));
  }
  if(m.tick%Math.round(hz*sampleSeconds)===0||m.phase!=='RUNNING'){assertOwnershipCounts(m);samples.push(state);}
  if(m.tick===hz*600||m.tick===hz*900)checkpoints.push({...state,maxCells,maxPercent:maxCells*100/total,thresholdTimes:{...times}});
 }
 const wallSeconds=(performance.now()-started)/1000;
 if(instrument) {
  for(const ep of pending.values()){ep.endSeconds=m.tick/hz;ep.durationSeconds=ep.endSeconds-ep.startSeconds;if(ep.durationSeconds>=30)episodes.push(ep);}
  for(const p of m.participants){const row=active.get(p.participantId)!;if(row.endedSeconds===null){row.endedSeconds=m.tick/hz;row.durationSeconds=row.endedSeconds-row.startedSeconds;row.endReason=m.outcome?(p.participantId===m.outcome.winnerId?'FULL_CAPTURE_WIN':'FULL_CAPTURE_LOSS'):'HORIZON';}}
  assertOwnershipCounts(m);
  if(deaths!==m.participants.reduce((s,p)=>s+p.deaths,0))throw new Error('Death count mismatch');
  if(respawns!==m.participants.reduce((s,p)=>s+p.lifeId-1,0))throw new Error('Respawn count mismatch');
  if(lives.reduce((s,l)=>s+l.kills,0)!==m.participants.reduce((s,p)=>s+p.kills,0))throw new Error('Life kill count mismatch');
 }
 return {seed,variant,config:m.config,totalCells:total,simulationSeconds:m.tick/hz,horizonMinutes:minutes,wallSeconds,maxCells,maxPercent:maxCells*100/total,peakSeconds,
  thresholdTimes:times,thresholdParticipants,success:m.outcome?.reason==='FULL_CAPTURE',winner:m.outcome,final:sample(),deaths,respawns,blockedAttempts,
  blockedParticipantSeconds:blockedParticipantTicks/hz,meanAlive:m.tick?aliveTicks/m.tick:0,leaderChanges,afterThreshold,checkpoints,lives,samples,spawnEvents,stagnation:episodes,
  timing:{botAndEngine:statistics(tickTimes),engine:statistics(engineTimes),includesTelemetryHooks:instrument,excludesPostTickCollection:true},hash:logicalHash(m,memories),
  ...(options.retainTickTiming?{tickTiming:tickTimes,engineTiming:engineTimes}:{})};
}
export type Run = ReturnType<typeof runSeed>;
export function summarize(runs:Run[]) {
 const pairs=thresholds.slice(0,-1).map((t,i)=>[t,thresholds[i+1]]);
 const segments=(rows:{thresholdTimes:Times}[])=>Object.fromEntries(pairs.map(([a,b])=>[`${a}-${b}`,{started:rows.filter(r=>r.thresholdTimes[a]!==null).length,completed:rows.filter(r=>r.thresholdTimes[b]!==null).length,
  incomplete:rows.filter(r=>r.thresholdTimes[a]!==null&&r.thresholdTimes[b]===null).length,times:statistics(rows.filter(r=>r.thresholdTimes[a]!==null&&r.thresholdTimes[b]!==null).map(r=>r.thresholdTimes[b]!-r.thresholdTimes[a]!))}]));
 return {n:runs.length,successes:runs.filter(r=>r.success).length,
  thresholds:Object.fromEntries(thresholds.map(t=>[t,{reached:runs.filter(r=>r.thresholdTimes[t]!==null).length,rate:runs.filter(r=>r.thresholdTimes[t]!==null).length/runs.length,times:statistics(runs.flatMap(r=>r.thresholdTimes[t]===null?[]:[r.thresholdTimes[t]!]))}])),
  matchSegments:segments(runs),lifeSegments:segments(runs.flatMap(r=>r.lives)),successfulMatchSegments:segments(runs.filter(r=>r.success)),
  failedMaxDistribution:Object.fromEntries([[0,75],[75,90],[90,95],[95,99],[99,100]].map(([a,b])=>[`${a}-${b}`,runs.filter(r=>!r.success&&r.maxPercent>=a&&r.maxPercent<b).length])),
  maxPercent:statistics(runs.map(r=>r.maxPercent)),lifeMaxPercent:statistics(runs.flatMap(r=>r.lives.map(l=>l.maxPercent))),
  deaths:runs.reduce((s,r)=>s+r.deaths,0),respawns:runs.reduce((s,r)=>s+r.respawns,0),blockedAttempts:runs.reduce((s,r)=>s+r.blockedAttempts,0),
  totalLives:runs.reduce((s,r)=>s+r.lives.length,0),meanAlive:statistics(runs.map(r=>r.meanAlive)),wallSeconds:runs.reduce((s,r)=>s+r.wallSeconds,0),
  totalTicks:runs.reduce((s,r)=>s+r.simulationSeconds*r.config.simulationHz,0),stagnationEpisodes:runs.reduce((s,r)=>s+r.stagnation.length,0)};
}
export function sourceHashes() {
 return Object.fromEntries(['config','game','engine','bot','bot-experiment','bot-steering','bot-opportunity','bot-expansion','movement','capture','territory','spawn','life','modes','starting-anchors','random','state','scoring','run','wall-margin'].map(f=>[f,createHash('sha256').update(readFileSync(resolve('src/shared',f+'.ts'))).digest('hex')]));
}
async function main() {
 const args=process.argv.slice(2),arg=(name:string,fallback:string)=>args.find(a=>a.startsWith('--'+name+'='))?.split('=').slice(1).join('=')??fallback;
 const count=Number(arg('seeds','100')),minutes=Number(arg('minutes','20')),first=Number(arg('first','1')),output=resolve(arg('output','evidence/classic-100-validation.json'));
 if(!Number.isInteger(count)||count<1||!Number.isInteger(first)||first<0||!Number.isFinite(minutes)||minutes<=0)throw new Error('Invalid experiment arguments');
 const variant=arg('variant','production');if(variant!=='production'&&variant!=='no-respawn')throw new Error('Invalid variant');
 mkdirSync(dirname(output),{recursive:true});const sources=sourceHashes(),runs:Run[]=[];
 const ticks:number[]=[],engines:number[]=[];
 const persist=(finished=false)=>writeFileSync(output,JSON.stringify({schemaVersion:1,variant,condition:variant==='production'?'Production Classic, 16 BOTs, default config, default combined AI; no rule overrides':'Control only: dead BOTs retired by harness after normal step; all other defaults unchanged',createdAt:new Date().toISOString(),seedRange:[first,first+count-1],horizonMinutes:minutes,sourceHashes:sources,
  methodology:{threshold:'End-of-tick integer cell counts; no rounded HUD percentages',life:'participantId + lifeId; thresholdTimes are seconds since spawn; peaks sampled at tick boundaries',quantiles:'nearest rank ceil(p*n)',stagnation:'after first reaching 90/95/99, at least 30 simulated seconds without a new all-time end-of-tick leader cell record; one episode per threshold',timing:'BOT observations + inputs + stepMatch, and stepMatch alone; includes spawn hooks, excludes post-tick telemetry, startup and output; desktop elapsed time, not process CPU utilization',samplingSeconds:5},summary:summarize(runs),pooledTiming:finished?{botAndEngine:statistics(ticks),engine:statistics(engines)}:null,runs},null,2));
 for(let seed=first;seed<first+count;seed++) {
  const r=runSeed({seed,minutes,variant,retainTickTiming:true});
  for(const x of r.tickTiming!)ticks.push(x);for(const x of r.engineTiming!)engines.push(x);
  delete r.tickTiming;delete r.engineTiming;runs.push(r);persist();
  console.log(JSON.stringify({completed:runs.length,target:count,seed,minutes:r.simulationSeconds/60,maxPercent:r.maxPercent,success:r.success,deaths:r.deaths,wallSeconds:r.wallSeconds}));
 }
 persist(true);
 if(JSON.stringify(sources)!==JSON.stringify(sourceHashes()))throw new Error('Production source changed during experiment');
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))await main();


