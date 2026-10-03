import {mkdirSync,writeFileSync,renameSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createMatch,stepMatch} from '../src/shared/game.js';
import {botSpecs,createBotMemory,getBotInput,observeBot} from '../src/shared/bot.js';
import {inspectSpawnSpace,watchSpawnAttempts,type SpawnAttemptTrace} from '../src/shared/spawn.js';
import {createMode,type GameModeId} from '../src/shared/modes.js';
import {hexDistance} from '../src/shared/hex.js';
import {EXPERIMENT_MAP_RADII} from '../src/shared/map-experiment.js';

export const OCCUPANCY_BANDS=[{label:'0–25%',from:0,to:25},{label:'25–50%',from:25,to:50},{label:'50–70%',from:50,to:70},{label:'70–80%',from:70,to:80},{label:'80–90%',from:80,to:90},{label:'90–95%',from:90,to:95},{label:'95%+',from:95,to:Infinity}];
const bandIndex=(percent:number)=>OCCUPANCY_BANDS.findIndex(b=>percent>=b.from&&percent<b.to);
interface Sample {seconds:number;leaderPercent:number;occupiedPercent:number;neutralCells:number;neutralPercent:number;validCenters:number;alive:number;deadWait:number;spawnBlocked:number;pairDistanceHex:number|null;exposedTrailMean:number|null}
function emptyBand(){return {reachedAtSeconds:null as number|null,secondsInBand:0,samples:[] as Sample[],attempts:[] as SpawnAttemptTrace[]};}
function statistics(values:number[]){return values.length?{mean:values.reduce((s,n)=>s+n,0)/values.length,min:Math.min(...values),max:Math.max(...values)}:null;}
function finishBands(bands:ReturnType<typeof emptyBand>[]){return bands.map((b,i)=>({band:OCCUPANCY_BANDS[i].label,status:b.reachedAtSeconds===null?'NOT_REACHED_UNVERIFIED':'REACHED',reachedAtSeconds:b.reachedAtSeconds,secondsInBand:b.secondsInBand,sampleCount:b.samples.length,
 neutralCellCount:statistics(b.samples.map(s=>s.neutralCells)),neutralPercentage:statistics(b.samples.map(s=>s.neutralPercent)),validSpawnCenterCount:statistics(b.samples.map(s=>s.validCenters)),aliveParticipantCount:statistics(b.samples.map(s=>s.alive)),deadWaitParticipantCount:statistics(b.samples.map(s=>s.deadWait)),spawnBlockedParticipantCount:statistics(b.samples.map(s=>s.spawnBlocked)),
 respawnAttempts:b.reachedAtSeconds===null?null:b.attempts.length,successfulRespawns:b.reachedAtSeconds===null?null:b.attempts.filter(a=>a.success).length,failedBlockedRespawns:b.reachedAtSeconds===null?null:b.attempts.filter(a=>!a.success).length,retryAttempts:b.reachedAtSeconds===null?null:b.attempts.filter(a=>a.stateBefore==='SPAWN_BLOCKED').length,
 respawnSuccessRate:b.attempts.length?b.attempts.filter(a=>a.success).length/b.attempts.length:null,validCentersAtAttempts:statistics(b.attempts.map(a=>a.validCenterCount))}));}

// Baseline AI, normal spawn, steering, capture, death and respawn only. Neither
// ownership/trails/positions nor bot goals are injected by this experiment.
export function runMapExperiment(radius:number,seed:number,mode:GameModeId,minutes=20){
 const m=createMatch({mapRadius:radius},seed,botSpecs(8),`map-${radius}-${seed}-${mode}`,createMode(mode)),memories=m.participants.map(p=>createBotMemory(seed+p.slot)),hz=m.config.simulationHz,total=m.map.cells.length;
 const leaderBands=OCCUPANCY_BANDS.map(emptyBand),occupiedBands=OCCUPANCY_BANDS.map(emptyBand),samples:Sample[]=[],attempts:SpawnAttemptTrace[]=[],violations:string[]=[],survival:number[]=[],births=new Map(m.participants.map(p=>[p.participantId,0])),holdStarts=new Set<string>(),holdLengths:number[]=[];
 let deaths=0,kills=0,captures=0,capturedCells=0,firstContact:number|null=null,firstBlocked:number|null=null,firstZeroCenters:number|null=null,peakCells=19,holdCancelled=0,blockedTransitions=0,blockedSeconds=0,aliveSeconds=0,trailCellSeconds=0,lastSampleTick=-1;
 const firstThresholds:Record<string,number|null>=Object.fromEntries([25,50,70,80,90,95,100].map(p=>[String(p),null])),deathCauses:Record<string,number>={};
 const recordReached=(bands:typeof leaderBands,percent:number,time:number)=>{const b=bands[bandIndex(percent)];if(b.reachedAtSeconds===null)b.reachedAtSeconds=time;return b;};
 watchSpawnAttempts(m,a=>{attempts.push(a);recordReached(leaderBands,a.leaderCells*100/total,a.tick/hz).attempts.push(a);recordReached(occupiedBands,100-a.neutralCells*100/total,a.tick/hz).attempts.push(a);
  if(a.success!==(a.validCenterCount>0))violations.push(`tick ${a.tick}: spawn space/outcome mismatch`);
  if(!a.success){firstBlocked??=a.tick/hz;if(a.stateBefore!=='SPAWN_BLOCKED')blockedTransitions++;}
 });
 const sample=()=>{
  if(lastSampleTick===m.tick)return;lastSampleTick=m.tick;
  const alive=m.participants.filter(p=>p.lifeState==='ALIVE'),neutral=m.owners.reduce((n,owner)=>n+Number(owner===0),0),leader=Math.max(...m.participants.map(p=>p.territoryCount)),space=inspectSpawnSpace(m);let pair=0,pairs=0;
  for(let i=0;i<alive.length;i++)for(let j=i+1;j<alive.length;j++){pair+=hexDistance(m.map.cells[alive[i].cellId],m.map.cells[alive[j].cellId]);pairs++;}
  if(total-neutral!==m.participants.reduce((n,p)=>n+p.territoryCount,0))violations.push(`tick ${m.tick}: ownership count`);
  const s:Sample={seconds:m.tick/hz,leaderPercent:leader*100/total,occupiedPercent:100-neutral*100/total,neutralCells:neutral,neutralPercent:neutral*100/total,validCenters:space.validCenterCount,alive:alive.length,deadWait:m.participants.filter(p=>p.lifeState==='DEAD_WAIT').length,spawnBlocked:m.participants.filter(p=>p.lifeState==='SPAWN_BLOCKED').length,pairDistanceHex:pairs?pair/pairs:null,exposedTrailMean:alive.length?alive.reduce((n,p)=>n+p.trailCells.size,0)/alive.length:null};
  samples.push(s);recordReached(leaderBands,s.leaderPercent,s.seconds).samples.push(s);recordReached(occupiedBands,s.occupiedPercent,s.seconds).samples.push(s);if(space.validCenterCount===0)firstZeroCenters??=s.seconds;
 };
 sample();const wallStart=performance.now();
 while(m.tick<Math.round(minutes*60*hz)&&m.phase==='RUNNING'){
  const leader=Math.max(...m.participants.map(p=>p.territoryCount)),owned=m.participants.reduce((n,p)=>n+p.territoryCount,0),before=m.eventCounter,oldHolds=[...m.modeState.holds];
  recordReached(leaderBands,leader*100/total,m.tick/hz).secondsInBand+=1/hz;recordReached(occupiedBands,owned*100/total,m.tick/hz).secondsInBand+=1/hz;
  const alive=m.participants.filter(p=>p.lifeState==='ALIVE');aliveSeconds+=alive.length/hz;trailCellSeconds+=alive.reduce((n,p)=>n+p.trailCells.size,0)/hz;blockedSeconds+=m.participants.filter(p=>p.lifeState==='SPAWN_BLOCKED').length/hz;
  const inputs=new Map(m.participants.flatMap((p,i)=>{const input=getBotInput(observeBot(m,p.participantId),memories[i]);return input?[[p.participantId,input] as const]:[];}));stepMatch(m,inputs);
  for(const e of m.events)if(Number(e.eventId.split(':').at(-1))>before){
   if(e.type==='SPAWN')births.set(e.participantId,e.tick);
   if(e.type==='CAPTURE'){captures++;capturedCells+=e.amount??0;}
   if(e.type==='DEATH'){deaths++;if(e.killerId)kills++;const time=e.deathContext?.eventTick??e.tick;survival.push((time-births.get(e.participantId)!)/hz);const cause=e.deathContext?.cause??e.reason??'UNKNOWN';deathCauses[cause]=(deathCauses[cause]??0)+1;if(cause==='EXISTING_TRAIL_CONTACT'||cause==='PENDING_TRAIL_CONTACT')firstContact??=time/hz;}
  }
  const peak=Math.max(...m.participants.map(p=>p.territoryCount));peakCells=Math.max(peakCells,peak);for(const key of Object.keys(firstThresholds))if(firstThresholds[key]===null&&peak*100>=Number(key)*total)firstThresholds[key]=m.tick/hz;
  const liveHolds=new Set(m.modeState.holds.map(h=>h.participantId+':'+h.startedAtTick));for(const h of m.modeState.holds)holdStarts.add(h.participantId+':'+h.startedAtTick);
  for(const h of oldHolds)if(!liveHolds.has(h.participantId+':'+h.startedAtTick)){holdLengths.push((m.tick-h.startedAtTick)/hz);if(m.outcome?.winnerId!==h.participantId)holdCancelled++;}
  if(m.tick%hz===0)sample();
 }
 sample();for(const h of m.modeState.holds)holdLengths.push(Math.max(0,(m.tick-h.startedAtTick)/hz));
 const duration=m.tick/hz,late=samples.filter(s=>s.seconds>=duration*.8),successful=attempts.filter(a=>a.success).length;
 return {radius,seed,mode,config:m.config,modeConfig:m.gameMode,totalCells:total,cellsPerParticipant:total/8,initialOwnedPercent:152*100/total,initialAnchors:m.map.anchors.map(id=>({q:m.map.cells[id].q,r:m.map.cells[id].r})),durationSeconds:duration,wallSeconds:(performance.now()-wallStart)/1000,
 deaths,kills,deathsPerMatchMinute:deaths/(duration/60),killsPerMatchMinute:kills/(duration/60),deathsPerParticipantMinute:deaths/(8*duration/60),killsPerParticipantMinute:kills/(8*duration/60),deathCauses,completedLifeSeconds:statistics(survival),completedLives:survival.length,censoredAliveLives:m.participants.filter(p=>p.lifeState==='ALIVE').map(p=>({participantId:p.participantId,seconds:(m.tick-births.get(p.participantId)!)/hz})),
 pairDistanceHex:statistics(samples.flatMap(s=>s.pairDistanceHex===null?[]:[s.pairDistanceHex])),firstDirectTrailContactSeconds:firstContact,peakTerritoryCells:peakCells,peakTerritoryPercent:peakCells*100/total,firstThresholdSeconds:firstThresholds,captures,capturedCells,capturedCellsPerMatchMinute:capturedCells/(duration/60),capturedPercentEquivalentPerMatchMinute:capturedCells*100/total/(duration/60),meanExposedTrailCells:aliveSeconds?trailCellSeconds/aliveSeconds:null,
 hold:{started:holdStarts.size,cancelled:holdCancelled,won:m.outcome?.reason==='HELD_TERRITORY',longestObservedSeconds:holdLengths.length?Math.max(...holdLengths):null},classicWon:m.outcome?.reason==='FULL_CAPTURE',outcome:m.outcome,
 respawn:{attempts:attempts.length,successful,failedBlocked:attempts.length-successful,retries:attempts.filter(a=>a.stateBefore==='SPAWN_BLOCKED').length,firstBlockedSeconds:firstBlocked,blockedTransitions,blockedParticipantSeconds:blockedSeconds,firstZeroValidCentersSeconds:firstZeroCenters},lateAliveCount:statistics(late.map(s=>s.alive)),leaderBands:finishBands(leaderBands),occupiedBands:finishBands(occupiedBands),violations,samples,spawnAttempts:attempts};
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const arg=(key:string,fallback:string)=>{const i=process.argv.indexOf(key);return i<0?fallback:process.argv[i+1];};
 const radius=Number(arg('--radius','22')),minutes=Number(arg('--minutes','20')),seeds=arg('--seeds','4,19,73,115').split(',').map(Number),output=resolve(arg('--output',`.local/evidence/map-size-scaled/R${radius}.json`));
 if(!EXPERIMENT_MAP_RADII.some(r=>r===radius)||!Number.isFinite(minutes)||minutes<=0||minutes>120||seeds.some(s=>!Number.isSafeInteger(s)||s<0))throw new Error('Invalid experiment arguments');
 mkdirSync(dirname(output),{recursive:true});const runs:ReturnType<typeof runMapExperiment>[]=[];
 for(const seed of seeds)for(const mode of ['classic','hold'] as const){const result=runMapExperiment(radius,seed,mode,minutes);runs.push(result);writeFileSync(output+'.progress.json',JSON.stringify({schema:1,method:'normal movement; radius only; leader and global occupied bands separately',sampleIntervalSeconds:1,minutes,seeds,runs},null,2));console.log(JSON.stringify({radius,seed,mode,minutes:result.durationSeconds/60,peak:result.peakTerritoryPercent,deaths:result.deaths,failedSpawns:result.respawn.failedBlocked,wallSeconds:result.wallSeconds,violations:result.violations.length}));}
 // Interrupted reruns never replace a completed baseline with partial data.
 renameSync(output+'.progress.json',output);
}
