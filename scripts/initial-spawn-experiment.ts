import {mkdirSync,writeFileSync,renameSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createMatch,stepMatch} from '../src/shared/game.js';
import {botSpecs,createBotMemory,getBotInput,observeBot} from '../src/shared/bot.js';
import {hexDistance,START_ANCHORS} from '../src/shared/hex.js';

const stats=(values:number[])=>values.length?{mean:values.reduce((s,n)=>s+n,0)/values.length,min:Math.min(...values),max:Math.max(...values)}:null;
type Placement='fixed'|'scaled';
// Run the unchanged normal game path. The fixed baseline is collected BEFORE
// changing createMap, and verified against its actual anchors, not injected.
export function runInitialSpawnExperiment(radius:number,seed:number,placement:Placement,seconds=300){
 const m=createMatch({mapRadius:radius},seed,botSpecs(8),`initial-${radius}-${seed}`),hz=m.config.simulationHz;
 const anchors=m.map.anchors.map(id=>({q:m.map.cells[id].q,r:m.map.cells[id].r}));
 const isFixed=JSON.stringify(anchors)===JSON.stringify(START_ANCHORS);
 if((placement==='fixed')!==isFixed)throw new Error(`Actual ${radius} anchors do not match requested ${placement} baseline`);
 const memories=m.participants.map(p=>createBotMemory(seed+p.slot));
 const starts=m.participants.map(p=>({participantId:p.participantId,slot:p.slot,cellId:p.cellId,q:m.map.cells[p.cellId].q,r:m.map.cells[p.cellId].r,lifeId:p.lifeId}));
 const departures=starts.map(p=>({participantId:p.participantId,seconds:null as number|null,deathSeconds:null as number|null}));
 const initialDistances:number[]=[],samples:{seconds:number;alive:number;pairDistanceHex:number|null;leaderPercent:number}[]=[],deathTimes:number[]=[],causes:Record<string,number>={};
 for(let i=0;i<starts.length;i++)for(let j=i+1;j<starts.length;j++)initialDistances.push(hexDistance(starts[i],starts[j]));
 let firstContact:number|null=null,firstKill:number|null=null,trailCellsTicks=0,aliveTicks=0,peakLeaderCells=19;
 const sample=()=>{const alive=m.participants.filter(p=>p.lifeState==='ALIVE'),distances:number[]=[];
  for(let i=0;i<alive.length;i++)for(let j=i+1;j<alive.length;j++)distances.push(hexDistance(m.map.cells[alive[i].cellId],m.map.cells[alive[j].cellId]));
  samples.push({seconds:m.tick/hz,alive:alive.length,pairDistanceHex:stats(distances)?.mean??null,leaderPercent:Math.max(...m.participants.map(p=>p.territoryCount))*100/m.map.cells.length});};
 sample();const wallStart=performance.now();
 while(m.tick<Math.round(seconds*hz)&&m.phase==='RUNNING'){
  const before=m.eventCounter,alive=m.participants.filter(p=>p.lifeState==='ALIVE');aliveTicks+=alive.length;trailCellsTicks+=alive.reduce((n,p)=>n+p.trailCells.size,0);
  const inputs=new Map(m.participants.flatMap((p,i)=>{const input=getBotInput(observeBot(m,p.participantId),memories[i]);return input?[[p.participantId,input] as const]:[];}));stepMatch(m,inputs);
  for(const e of m.events)if(Number(e.eventId.split(':').at(-1))>before&&e.type==='DEATH'){
   const time=(e.deathContext?.eventTick??e.tick)/hz,cause=e.deathContext?.cause??e.reason??'UNKNOWN';deathTimes.push(time);causes[cause]=(causes[cause]??0)+1;
   if(e.killerId)firstKill??=time;if(cause==='EXISTING_TRAIL_CONTACT'||cause==='PENDING_TRAIL_CONTACT')firstContact??=time;
   const index=starts.findIndex(p=>p.participantId===e.participantId);if(index>=0&&departures[index].deathSeconds===null)departures[index].deathSeconds=time;
  }
  for(const [i,p] of m.participants.entries())if(departures[i].seconds===null&&departures[i].deathSeconds===null&&p.lifeState==='ALIVE'&&p.lifeId===starts[i].lifeId&&hexDistance(starts[i],m.map.cells[p.cellId])>=10)departures[i].seconds=m.tick/hz;
  peakLeaderCells=Math.max(peakLeaderCells,...m.participants.map(p=>p.territoryCount));if(m.tick%hz===0)sample();
 }
 if(samples.at(-1)!.seconds!==m.tick/hz)sample();
 return {schema:1,radius,seed,placement,config:m.config,mode:m.gameMode,totalCells:m.map.cells.length,anchors,starts,initialPairDistanceHex:stats(initialDistances)!,durationSeconds:m.tick/hz,wallSeconds:(performance.now()-wallStart)/1000,
  firstDirectTrailContactSeconds:firstContact,firstKillSeconds:firstKill,deathsBySeconds:Object.fromEntries([60,180,300].map(t=>[String(t),deathTimes.filter(x=>x<=t).length])),deathCauses:causes,deathTimes,
  meanPairDistanceHex:stats(samples.flatMap(s=>s.pairDistanceHex===null?[]:[s.pairDistanceHex]))?.mean??null,peakLeaderPercent:peakLeaderCells*100/m.map.cells.length,endLeaderPercent:samples.at(-1)!.leaderPercent,meanTrailCellsPerAliveParticipant:aliveTicks?trailCellsTicks/aliveTicks:null,
  initialDeparture:{centerDistanceThresholdHex:10,distanceBeyondInitialZoneHex:8,firstLifeOnly:true,observed:stats(departures.flatMap(p=>p.seconds===null?[]:[p.seconds])),participants:departures.map(p=>({...p,status:p.seconds!==null?'REACHED':p.deathSeconds!==null?'DIED_BEFORE_THRESHOLD':'NOT_REACHED_UNVERIFIED'}))},samples};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const arg=(key:string,fallback:string)=>{const i=process.argv.indexOf(key);return i<0?fallback:process.argv[i+1];};
 const radius=Number(arg('--radius','32')),placement=arg('--placement','scaled') as Placement,seeds=arg('--seeds','4,19,73,115').split(',').map(Number),output=resolve(arg('--output',`.local/evidence/initial-spawn/R${radius}-${placement}.json`));
 if(![32,36,40].includes(radius)||!['fixed','scaled'].includes(placement)||seeds.some(s=>!Number.isSafeInteger(s)||s<0||s>0xffffffff))throw new Error('Invalid experiment arguments');
 mkdirSync(dirname(output),{recursive:true});const runs:ReturnType<typeof runInitialSpawnExperiment>[]=[];
 for(const seed of seeds){const run=runInitialSpawnExperiment(radius,seed,placement);runs.push(run);writeFileSync(output+'.progress.json',JSON.stringify({method:'normal initial spawn and movement; Classic; 8 unchanged BOTs; 300 seconds',runs},null,2));console.log(JSON.stringify({radius,placement,seed,firstContact:run.firstDirectTrailContactSeconds,firstKill:run.firstKillSeconds,deaths:run.deathsBySeconds,wallSeconds:run.wallSeconds}));}
 renameSync(output+'.progress.json',output);
}
