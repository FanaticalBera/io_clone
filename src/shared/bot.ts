import type {MatchState,MapDefinition,PublicParticipant,DirectionInput,Personality} from './model.js';
import {hexDistance} from './hex.js';
import {seededRandom} from './random.js';
import {normalizeDirection,stepSteering,setMovementNormalCaching} from './movement.js';
import {botOptions,type BotVariant} from './bot-experiment.js';
import {moveSpeed} from './config.js';
import {botSteeringTarget} from './bot-steering.js';
import {GAME_MODES,type GameModeConfig} from './modes.js';
import {evaluateShadowOpportunities,shadowTravelSeconds,type ShadowOpportunity} from './bot-opportunity.js';
import {expansionSides,EXPANSION_SHAPES,type ExpansionShape} from './bot-expansion.js';
export type {ExpansionShape} from './bot-expansion.js';
export interface BotObservation {
 matchId:string; tick:number; config:MatchState['config']; map:MapDefinition; owners:Uint8Array;gameMode:GameModeConfig;
 self:PublicParticipant; ownTrail:number[]; others:PublicParticipant[]; trails:{cellId:number;slot:number}[];
}
export type BotGoal='EXPAND'|'STEAL'|'SEEK_POINT'|'ATTACK'|'RETURN'|'ESCAPE';
export interface BotTraits {readonly expansionScale:number;readonly riskScale:number;readonly stealScale:number}
export interface BotMemory { traits:Readonly<BotTraits>; path:number[]; nextDecisionTick:number; seq:number; random:()=>number; goal:BotGoal; lastCell:number; lastProgressTick:number; plannedLifeId:number; attackTarget:number|null; attackSlot:number|null; knownHome:Set<number>; grievances:Map<number,{amount:number;tick:number}>;expansion?:ExpansionPlan;lastExpansionShape?:ExpansionShape }
const memoryVariants=new WeakMap<BotMemory,BotVariant>();
export function createBotMemory(seed:number,variant:BotVariant='combined'):BotMemory {
 // Independent stream: traits neither consume decision RNG nor change on respawn.
 const random=seededRandom(seed),traitRandom=seededRandom(seed^0x51f15e),scale=()=>.9+traitRandom()*.2;
 const traits=Object.freeze({expansionScale:scale(),riskScale:scale(),stealScale:scale()});
 const memory:BotMemory={traits,path:[],nextDecisionTick:0,seq:0,random,goal:'EXPAND',lastCell:-1,lastProgressTick:0,plannedLifeId:0,attackTarget:null,attackSlot:null,knownHome:new Set(),grievances:new Map()};memoryVariants.set(memory,variant);return memory;
}
export interface BotAttackTrace {target:number;slot:number;distance:number;interrupt:boolean;reason:string;seconds?:number;returnTime?:number|null;counterTime?:number;returnSeconds?:number;etaMargin?:number;qualityBonus?:number;score?:number}
export interface ExpansionPlan {shape:ExpansionShape;pathLength:number;externalLength:number;captureSize:number;stolenCells:number;earlyClosed:boolean;downScaled?:boolean;threatDistance?:number}
export interface BotDecisionTrace {tick:number;from:BotGoal;to:BotGoal;ownTrail:number;attackTarget:number|null;attacks:BotAttackTrace[];personality?:Personality;traits?:Readonly<BotTraits>;lookAheadUsed?:number;attackSlot?:number|null;pathLength?:number;exitReason?:string;shadow?:ShadowOpportunity;expansionCandidates?:ExpansionShape[];expansionAccepted?:ExpansionShape[];expansionPlan?:ExpansionPlan;expansionPath?:number[];earlyClosure?:boolean}
const botObservers=new WeakMap<BotMemory,(trace:BotDecisionTrace)=>void>();
const decisionTraces=new WeakMap<BotMemory,BotDecisionTrace>();
// Optional tactical audit: production decisions do not allocate trace records.
export function watchBotDecisions(memory:BotMemory,observer:(trace:BotDecisionTrace)=>void):()=>void {
 botObservers.set(memory,observer);return()=>botObservers.delete(memory);
}
function publicParticipant(p:MatchState['participants'][number]):PublicParticipant {
 const {trailCells:_,spawnCells:__,trailOriginCellId:___,...rest}=p;return {...rest,position:{...p.position},direction:{...p.direction},targetDirection:p.targetDirection?{...p.targetDirection}:null,protected:false};
}
const observationVariants=new WeakMap<BotObservation,BotVariant>();
// Explicit opponent snapshot: do not copy or read hidden targetDirection/run/input
// data. Keep targetDirection null for compatibility with public movement types.
function observableParticipant(p:MatchState['participants'][number]):PublicParticipant {
 return {participantId:p.participantId,slot:p.slot,nickname:p.nickname,kind:p.kind,personality:p.personality,
 position:{...p.position},direction:{...p.direction},targetDirection:null,cellId:p.cellId,lifeId:p.lifeId,lifeState:p.lifeState,
 territoryCount:p.territoryCount,controlScore:p.controlScore,kills:p.kills,deaths:p.deaths,respawnAtTick:p.respawnAtTick,
 protectedUntilTick:p.protectedUntilTick,deathReason:p.deathReason,deathContext:p.deathContext,lastAppliedInputSeq:0,run:null,protected:false};
}
export function observeBot(match:MatchState,participantId:string,variant:BotVariant='combined',steeringOnly=false):BotObservation {
 const self=match.participants.find(p=>p.participantId===participantId);if(!self)throw new Error('Unknown bot');
 const origin=match.map.cells[self.cellId]??{q:0,r:0},range=match.config.botObservationRange,options=botOptions(variant);
 setMovementNormalCaching(match.map,options.cache);
 const snapshot=options.fair?observableParticipant:publicParticipant;
 const others:PublicParticipant[]=[],trails:{cellId:number;slot:number}[]=[];
 // Between decisions only the live near-head/near-trail predicates used by
 // botLookAhead are needed. Preserve observation range and source order.
 for(const p of match.participants)if(p!==self){
  if(p.lifeState==='ALIVE'&&hexDistance(origin,match.map.cells[p.cellId])<=Math.min(range,steeringOnly?3:range)&&(!steeringOnly||others.length===0))others.push(snapshot(p));
  if(!steeringOnly||trails.length===0)for(const cellId of p.trailCells)if(hexDistance(origin,match.map.cells[cellId])<=Math.min(range,steeringOnly?2:range)){trails.push({cellId,slot:p.slot});if(steeringOnly)break;}
 }
 const obs:BotObservation={matchId:match.matchId,tick:match.tick,config:match.config,map:match.map,owners:match.owners,gameMode:match.gameMode,
 self:publicParticipant(self),ownTrail:steeringOnly?[]:[...self.trailCells],others,trails};
 observationVariants.set(obs,variant);return obs;
}
export function observeBotForTick(match:MatchState,participantId:string,memory:BotMemory):BotObservation {
 const variant=memoryVariants.get(memory)??'combined',self=match.participants.find(p=>p.participantId===participantId);
 const light=botOptions(variant).cache&&self?.lifeId===memory.plannedLifeId&&match.tick<memory.nextDecisionTick;
 return observeBot(match,participantId,variant,light);
}
function observedHeading(obs:BotObservation,p:PublicParticipant){
 return botOptions(observationVariants.get(obs)??'combined').fair?p.direction:p.targetDirection??p.direction;
}
const forecastCache=new WeakMap<MapDefinition,{tick:number;entries:Map<string,{signature:string;cells:number[]}>}>();
function forecastHead(obs:BotObservation,enemy:PublicParticipant):number[] {
 const options=botOptions(observationVariants.get(obs)??'combined'),intent=observedHeading(obs,enemy);
 let cache=forecastCache.get(obs.map);
 if(options.cache&&cache?.tick!==obs.tick){cache={tick:obs.tick,entries:new Map()};forecastCache.set(obs.map,cache);}
 const signature=[enemy.lifeId,enemy.cellId,enemy.position.x,enemy.position.y,enemy.direction.x,enemy.direction.y,intent.x,intent.y,obs.config.simulationHz,obs.config.moveCellsPerSecond,obs.config.hexSideWorldUnits,obs.config.turnRadiansPerSecond,obs.map.side].join(':');
 const previous=cache?.entries.get(enemy.participantId);
 if(options.cache&&previous?.signature===signature)return previous.cells;
 const cells=[enemy.cellId];let position=enemy.position,cellId=enemy.cellId,heading=enemy.direction;
 for(let tick=0;tick<obs.config.simulationHz;tick++){const next=stepSteering(obs.map,position,cellId,heading,intent,obs.config);if(next.blocked)break;position=next.position;heading=next.direction;cellId=next.cellId;cells.push(cellId);}
 if(options.cache)cache!.entries.set(enemy.participantId,{signature,cells});return cells;
}
export interface BotTickMetric {tick:number;slot:number;lifeId:number;goal:BotGoal;from:BotGoal;reason:'LIFE'|'URGENT'|'REGULAR';nextDecisionTick:number;attackTarget:number|null;attackSlot:number|null}
const tickObservers=new WeakMap<BotMemory,(metric:BotTickMetric)=>void>();
export function watchBotTicks(memory:BotMemory,observer:(metric:BotTickMetric)=>void):()=>void {tickObservers.set(memory,observer);return()=>tickObservers.delete(memory);}
export function shortestPath(map:MapDefinition,start:number,goal:(id:number)=>boolean,allowed:(id:number)=>boolean=()=>true,maxLength=24):number[]|null {
 if(start<0)return null;if(goal(start))return [];
 const parents=new Int32Array(map.cells.length);parents.fill(-2);parents[start]=-1;
 const depths=new Uint16Array(map.cells.length),queue=[start];let found=-1;
 for(let head=0;head<queue.length&&found<0;head++){
 if(depths[queue[head]]>=maxLength)continue;
 for(const n of map.cells[queue[head]].neighbors){
  if(n<0||parents[n]!==-2||!allowed(n))continue;
  parents[n]=queue[head];depths[n]=depths[queue[head]]+1;queue.push(n);if(goal(n)){found=n;break;}
 }}
 if(found<0)return null;
 const path:number[]=[];for(let id=found;id!==start;id=parents[id])path.push(id);path.reverse();
 return path.length<=maxLength?path:null;
}
export function returnPath(obs:BotObservation):number[]|null {
 // Enemy trails are cuttable, not walls. Prefer a safe route, but never abandon
 // the only way home just because an opponent has drawn across it.
 const threatened=new Set(obs.others.flatMap(p=>[p.cellId,...obs.map.cells[p.cellId].neighbors.filter(id=>id>=0)]));
 return shortestPath(obs.map,obs.self.cellId,id=>obs.owners[id]===obs.self.slot+1,id=>!threatened.has(id),24)
  ??shortestPath(obs.map,obs.self.cellId,id=>obs.owners[id]===obs.self.slot+1,()=>true,24);
}
const behavior:Record<Personality,{length:number;width:number;attack:number;pointWeight:number;risk:number;trailLimit:number;steal:number;attackRange:number}>={
 EXPAND:{length:5,width:4,attack:0.08,pointWeight:4,risk:0.7,trailLimit:20,steal:0.3,attackRange:6},
 ATTACK:{length:3,width:2,attack:0.85,pointWeight:3,risk:0.4,trailLimit:18,steal:0.5,attackRange:9},
 DEFEND:{length:2,width:2,attack:0.02,pointWeight:1,risk:1.3,trailLimit:12,steal:0.1,attackRange:5},
 SEEK_POINT:{length:3,width:3,attack:0.2,pointWeight:30,risk:0.8,trailLimit:18,steal:3,attackRange:7}
};
const individualSettings=new WeakMap<BotMemory,Map<Personality,typeof behavior[Personality]>>();
function settingsFor(obs:BotObservation,memory:BotMemory){
 const personality=obs.self.personality??'EXPAND';let cache=individualSettings.get(memory);
 if(!cache){cache=new Map();individualSettings.set(memory,cache);}
 let settings=cache.get(personality);if(!settings){const base=behavior[personality],t=memory.traits;
  settings={...base,length:base.length*t.expansionScale,width:base.width*t.expansionScale,risk:base.risk*t.riskScale,steal:base.steal*t.stealScale};cache.set(personality,settings);
 }return settings;
}
// Remember only territory changes currently observable around the bot. Repeated
// small captures accumulate, then cool down; a new life gets a fresh baseline.
function rememberIncursions(obs:BotObservation,memory:BotMemory):void {
 const origin=obs.map.cells[obs.self.cellId],owner=obs.self.slot+1;
 for(const [slot,record]of memory.grievances){record.amount*=Math.exp(-(obs.tick-record.tick)/(obs.config.simulationHz*30));record.tick=obs.tick;if(record.amount<.1)memory.grievances.delete(slot);}
 for(const id of memory.knownHome)if(hexDistance(origin,obs.map.cells[id])<=obs.config.botObservationRange){
  const next=obs.owners[id];if(next!==owner&&next!==0){const slot=next-1,record=memory.grievances.get(slot)??{amount:0,tick:obs.tick};record.amount=Math.min(32,record.amount+1);memory.grievances.set(slot,record);}
 }
 memory.knownHome=new Set(obs.map.cells.filter(c=>obs.owners[c.id]===owner&&hexDistance(origin,c)<=obs.config.botObservationRange).map(c=>c.id));
}
function travelSeconds(obs:BotObservation,p:PublicParticipant,path:number[]):number {
 if(!path.length)return 0;
 const first=obs.map.cells[path[0]].center,dx=first.x-p.position.x,dy=first.y-p.position.y,distance=Math.hypot(dx,dy);
 const dot=distance?Math.max(-1,Math.min(1,(p.direction.x*dx+p.direction.y*dy)/distance)):1;
 const estimate=(distance+Math.max(0,path.length-1)*Math.sqrt(3)*obs.map.side)/moveSpeed(obs.config)+Math.acos(dot)/obs.config.turnRadiansPerSecond;
 if(path.length>3)return estimate;
 // Close duels depend on entering a cell, not reaching its centre. Use the
 // shared steering step for a short horizon without changing actual movement.
 let position=p.position,heading=p.direction,cellId=p.cellId,index=0;
 const reach=moveSpeed(obs.config)/obs.config.turnRadiansPerSecond+moveSpeed(obs.config)/obs.config.simulationHz;
 for(let tick=0;tick<Math.ceil(Math.min(3,estimate+1)*obs.config.simulationHz);tick++){
  if(cellId===path.at(-1))return tick/obs.config.simulationHz;
  while(index<path.length-1&&cellId===path[index]&&Math.hypot(obs.map.cells[cellId].center.x-position.x,obs.map.cells[cellId].center.y-position.y)<reach)index++;
  const target=obs.map.cells[path[index]].center,intent=normalizeDirection(target.x-position.x,target.y-position.y)??heading;
  const next=stepSteering(obs.map,position,cellId,heading,intent,obs.config);if(next.blocked)return Infinity;
  position=next.position;heading=next.direction;cellId=next.cellId;
 }
 return Infinity;
}
interface AttackPlan {path:number[];score:number;goal:'ATTACK';target:number;slot:number;urgent:boolean;seconds:number;totalSeconds:number}
function observedReturnSeconds(obs:BotObservation,victim:PublicParticipant,home:number[]):number {
 const earliest=travelSeconds(obs,victim,home);if(!home.length)return earliest;
 const target=obs.map.cells[home[0]].center,toward=normalizeDirection(target.x-victim.position.x,target.y-victim.position.y);
 // A head already turning home gets the conservative immediate-return estimate.
 // Otherwise forecast only half a second from its observed heading. The opponent
 // can react and close sooner, so every subsequent decision rechecks the line.
 const intent=observedHeading(obs,victim);
 if(toward&&intent.x*toward.x+intent.y*toward.y>.55)return earliest;
 let position=victim.position,heading=victim.direction,cellId=victim.cellId;
 const ticks=Math.ceil(obs.config.simulationHz*.5);
 for(let tick=1;tick<=ticks;tick++){
  const next=stepSteering(obs.map,position,cellId,heading,intent,obs.config);if(next.blocked)return earliest;
  position=next.position;heading=next.direction;cellId=next.cellId;
  if(obs.owners[cellId]===victim.slot+1)return Math.min(earliest,tick/obs.config.simulationHz);
 }
 const back=shortestPath(obs.map,cellId,id=>obs.owners[id]===victim.slot+1,()=>true,24);
 return back?Math.min(earliest+.5,ticks/obs.config.simulationHz+travelSeconds(obs,{...victim,position,direction:heading,cellId},back)):earliest;
}
function planAttack(obs:BotObservation,memory:BotMemory,interrupt=false,locked=false):AttackPlan|null {
 if(!obs.trails.length)return null;
 const settings=settingsFor(obs,memory),owner=obs.self.slot+1,counts=new Map<number,number>();
 for(const trail of obs.trails)counts.set(trail.slot,(counts.get(trail.slot)??0)+1);
 const threshold=obs.self.personality==='DEFEND'?1.5:obs.self.personality==='ATTACK'?2.5:4.5;
 const incursions=new Set(obs.trails.filter(t=>obs.owners[t.cellId]===owner||obs.map.cells[t.cellId].neighbors.some(id=>id>=0&&obs.owners[id]===owner)).map(t=>t.slot));
 const valuable=(cellId:number,slot:number)=>obs.owners[cellId]===owner||incursions.has(slot)||(counts.get(slot)??0)>=5||(memory.grievances.get(slot)?.amount??0)>=threshold;
 const ordinary=!interrupt&&obs.trails.length>0&&memory.random()<settings.attack;
 const targets=[...obs.trails].sort((a,b)=>hexDistance(obs.map.cells[a.cellId],obs.map.cells[obs.self.cellId])-hexDistance(obs.map.cells[b.cellId],obs.map.cells[obs.self.cellId]));
 // Do not lay our approach across an observed head's immediate forward path.
 // This is a short prediction from public position/heading, not future inputs.
 const headPaths=new Set<number>();
 for(const enemy of obs.others)for(const cellId of forecastHead(obs,enemy))headPaths.add(cellId);
 let best:AttackPlan|null=null;const returnTimes=new Map<number,number|null>();
 // Reserve candidates for each observed opponent; one long nearby trail must
 // not consume every evaluation and hide another opponent entering our home.
 const perSlot=new Map<number,number>();
 const lockedTarget=locked&&obs.trails.some(t=>t.slot===memory.attackSlot&&t.cellId===memory.attackTarget)?memory.attackTarget:null;
 const considered=targets.filter(t=>!locked||(t.slot===memory.attackSlot&&(lockedTarget!==null?t.cellId===lockedTarget:obs.others.some(p=>p.slot===t.slot)))).filter(t=>{const count=perSlot.get(t.slot)??0;perSlot.set(t.slot,count+1);return count<3;}).slice(0,12);
 for(const target of considered){
  const trace=decisionTraces.get(memory);const record:BotAttackTrace|undefined=trace?{target:target.cellId,slot:target.slot,distance:hexDistance(obs.map.cells[target.cellId],obs.map.cells[obs.self.cellId]),interrupt,reason:'SELECTABLE'}:undefined;
  if(record)trace!.attacks.push(record);
  const reward=valuable(target.cellId,target.slot),range=obs.self.personality==='DEFEND'?settings.attackRange:reward?Math.max(8,settings.attackRange):settings.attackRange;
  const outward=shortestPath(obs.map,obs.self.cellId,id=>id===target.cellId,id=>id===target.cellId||!headPaths.has(id),range);
  if(!outward){if(record)record.reason='NO_APPROACH';continue;}
  const back=shortestPath(obs.map,target.cellId,id=>obs.owners[id]===owner,()=>true,10);
  if(!back||outward.length+back.length>18||obs.ownTrail.length+outward.filter(id=>obs.owners[id]!==owner).length+back.length>settings.trailLimit){if(record)record.reason='TRAIL_BUDGET';continue;}
  if(!returnTimes.has(target.slot)){
   const victim=obs.others.find(p=>p.slot===target.slot),home=victim&&shortestPath(obs.map,victim.cellId,id=>obs.owners[id]===target.slot+1,()=>true,24);
   returnTimes.set(target.slot,home&&victim?observedReturnSeconds(obs,victim,home):null);
  }
  const seconds=travelSeconds(obs,obs.self,outward),returnTime=returnTimes.get(target.slot);
  if(record){record.seconds=seconds;record.returnTime=returnTime;record.returnSeconds=back.length/obs.config.moveCellsPerSecond;}
  const margin=!locked&&obs.self.personality==='ATTACK'?(outward.length>=6?.4:outward.length>=4?.25:.1):.1;
  if(record)record.etaMargin=margin;
  if(returnTime!==null&&returnTime!==undefined&&seconds+margin>=returnTime){if(record)record.reason='VICTIM_RETURNS_FIRST';continue;}
  const opportunity=outward.length<=4&&seconds<=1.25&&returnTime!==null&&returnTime!==undefined&&seconds+.2<returnTime;
  if(!locked&&!reward&&!ordinary&&!opportunity&&!(obs.self.personality==='ATTACK'&&returnTime!==null&&returnTime!==undefined)){if(record)record.reason='LOW_PRIORITY';continue;}
  // Compare the cut with a counter-cut of our already exposed line. A cheap
  // winning strike can beat retreat; a duel we arrive at too late cannot.
  let counterTime=Infinity;
  for(const enemy of obs.others)if(obs.ownTrail.length){
   const nearest=obs.ownTrail.reduce((best,id)=>hexDistance(obs.map.cells[enemy.cellId],obs.map.cells[id])<hexDistance(obs.map.cells[enemy.cellId],obs.map.cells[best])?id:best);
   const route=shortestPath(obs.map,enemy.cellId,id=>id===nearest,()=>true,8);if(route)counterTime=Math.min(counterTime,travelSeconds(obs,enemy,route));
  }
  if(record)record.counterTime=counterTime;
  if(counterTime<=seconds+.05){if(record)record.reason='COUNTER_CUT_FIRST';continue;}
  if(!locked&&obs.self.personality==='ATTACK'){
   const exposed=[...obs.ownTrail,...outward,...back].filter(id=>obs.owners[id]!==owner);
   const total=seconds+back.length/obs.config.moveCellsPerSecond;
   if(obs.others.some(p=>p.slot!==target.slot&&exposed.some(id=>hexDistance(obs.map.cells[p.cellId],obs.map.cells[id])/obs.config.moveCellsPerSecond<=total+.15))){
    if(record)record.reason='UNSAFE_RETURN';continue;
   }
  }
  // A thief keeps its territory route unless a short interception lies on it,
  // a very close cut is clear, or its own exposed line needs a counterstrike.
  if(!locked&&obs.self.personality==='SEEK_POINT'){
   const onRoute=memory.path.slice(0,6).some(id=>hexDistance(obs.map.cells[id],obs.map.cells[target.cellId])<=1);
   const defending=incursions.has(target.slot)&&outward.length<=4;
   if(outward.length>4||(!onRoute&&!defending&&outward.length>2)||(!opportunity&&!defending)){
    // A short, demonstrably safe interception is not a long kill diversion.
    // Reassess this candidate independently of the optional diagnostic trace:
    // conservative opponent bounds and shared steering must permit cut+home.
    const close=opportunity&&outward.length<=3&&back.length<=3&&evaluateShadowOpportunities({...obs,trails:[target]},
     {path:(_map,start)=>start===obs.self.cellId?outward:back,seconds:shadowTravelSeconds}).candidates[0];
    if(!close||close.reason!=='CLEAR_KILL_OPPORTUNITY'||close.returnSeconds===null||close.returnSeconds>2){
     if(record)record.reason='STEAL_DIVERSION_LIMIT';continue;
    }
   }
  }
  const urgent=outward.length<=2&&seconds<=.75&&opportunity;
  const defenseBonus=obs.self.personality==='DEFEND'&&incursions.has(target.slot)?12:0;
  const advantage=returnTime===null||returnTime===undefined?0:Math.max(0,returnTime-seconds);
  const qualityBonus=obs.self.personality==='ATTACK'?Math.min(12,advantage*6)+(opportunity?12:0)-Math.max(0,outward.length-4)*3:0;
  const score=qualityBonus+defenseBonus+(reward?60:opportunity?50+settings.attack*15:50*settings.attack)-seconds*8-back.length*.3+(obs.owners[target.cellId]===owner?15:0)+Math.min(12,memory.grievances.get(target.slot)?.amount??0);
  if(record){record.qualityBonus=qualityBonus;record.score=score;}
  if(!best||score>best.score)best={path:[...outward,...back],score,goal:'ATTACK',target:target.cellId,slot:target.slot,urgent,seconds,totalSeconds:seconds+back.length/obs.config.moveCellsPerSecond};
 }
 return best;
}
// Evaluate the same enclosure rule as capture: home plus the planned trail
// blocks flood-fill from the outer edge. Retracing a line has no area bonus.
const plannedCaptureWork=new WeakMap<MapDefinition,{blocked:Uint8Array;visited:Uint8Array;queue:Int32Array;boundary:number[]}>();
export function plannedCapture(obs:BotObservation,path:number[]):number[] {
 // Profiling R56/16 identified candidate flood fills as the main hotspot.
 // Reuse storage and index exterior seeds, retaining the same full-map flood,
 // neighbor order and ascending result order (no local approximation).
 let work=plannedCaptureWork.get(obs.map);if(!work){const count=obs.map.cells.length;
  work={blocked:new Uint8Array(count),visited:new Uint8Array(count),queue:new Int32Array(count),boundary:obs.map.cells.filter(c=>c.neighbors.includes(-1)).map(c=>c.id)};plannedCaptureWork.set(obs.map,work);
 }
 const owner=obs.self.slot+1,{blocked,visited,queue,boundary}=work;blocked.fill(0);visited.fill(0);for(const id of path)blocked[id]=1;
 let tail=0;
 for(const id of boundary)if(obs.owners[id]!==owner&&!blocked[id]){visited[id]=1;queue[tail++]=id;}
 for(let head=0;head<tail;head++)for(const id of obs.map.cells[queue[head]].neighbors){
  if(id<0||visited[id]||obs.owners[id]===owner||blocked[id])continue;visited[id]=1;queue[tail++]=id;
 }
 const result:number[]=[];for(let id=0;id<obs.map.cells.length;id++)if(obs.owners[id]!==owner&&!visited[id])result.push(id);return result;
}
// A shortened enclosure avoids retracing the existing trail. Emergency escape
// still uses returnPath; this is only a pre-emptive, area-preserving closure.
export function earlyClosurePath(obs:BotObservation,remaining:number[],trailLimit:number):number[]|null {
 if(!obs.ownTrail.length||remaining.length<5)return null;
 const owner=obs.self.slot+1,used=new Set(obs.ownTrail),forbidden=new Set(obs.trails.map(t=>t.cellId));
 const safe=(id:number)=>!used.has(id)&&!forbidden.has(id)&&obs.others.every(p=>hexDistance(obs.map.cells[p.cellId],obs.map.cells[id])>2);
 const back=shortestPath(obs.map,obs.self.cellId,id=>obs.owners[id]===owner,safe,Math.min(10,remaining.length-3));
 if(!back||!back.length)return null;
 const external=new Set([...obs.ownTrail,...back].filter(id=>obs.owners[id]!==owner));
 if(external.size>trailLimit||plannedCapture(obs,[...obs.ownTrail,...back]).length<=external.size)return null;
 return back;
}
function planExpansion(obs:BotObservation,memory:BotMemory):number[] {
 const settings=settingsFor(obs,memory),forbidden=new Set(obs.trails.map(t=>t.cellId));
 const owner=obs.self.slot+1,own=obs.map.cells.filter(c=>obs.owners[c.id]===owner);
 const boundary=own.filter(c=>c.neighbors.some(n=>n>=0&&obs.owners[n]!==owner)).sort((a,b)=>hexDistance(a,obs.map.cells[obs.self.cellId])-hexDistance(b,obs.map.cells[obs.self.cellId]));
 // Only nearby, visible borders influence the thief's choice of launch point.
 if(obs.self.personality==='SEEK_POINT'){
  const rank=(cell:typeof own[number])=>hexDistance(cell,obs.map.cells[obs.self.cellId])-(hexDistance(cell,obs.map.cells[obs.self.cellId])<obs.config.botObservationRange&&cell.neighbors.some(id=>id>=0&&obs.owners[id]!==0&&obs.owners[id]!==owner)?3:0);
  boundary.sort((a,b)=>rank(a)-rank(b));
 }
 const candidates:{path:number[];score:number;goal:BotGoal;target?:number;slot?:number;expansion?:ExpansionPlan}[]=[];
 memory.attackTarget=null;memory.attackSlot=null;
 const attack=planAttack(obs,memory);if(attack)candidates.push(attack);
 for(const cp of GAME_MODES[obs.gameMode.id].usesControlPoints?obs.map.controlPoints:[])if(obs.owners[cp.cellId]!==owner){
  const outward=shortestPath(obs.map,obs.self.cellId,id=>id===cp.cellId,id=>!forbidden.has(id),12);
  const used=new Set(outward??[]);
  const back=outward&&shortestPath(obs.map,cp.cellId,id=>obs.owners[id]===owner,id=>!used.has(id)&&!forbidden.has(id),12);
  if(outward&&back&&outward.length+back.length<=24)candidates.push({path:[...outward,...back],score:settings.pointWeight-outward.length*0.3,goal:'SEEK_POINT'});
 }
 const crowded=obs.others.some(p=>hexDistance(obs.map.cells[p.cellId],obs.map.cells[obs.self.cellId])<=6);
 // The explorer's extra reach is for quiet space. Visible opponents keep its
 // footprint at the Phase 1 size even before they enter the crowded radius.
 const cautiousExplorer=obs.self.personality==='EXPAND'&&obs.others.length>0;
 const loopLength=cautiousExplorer?Math.min(settings.length,4):settings.length;
 const loopWidth=cautiousExplorer?Math.min(settings.width,3):settings.width;
 for(const [anchorIndex,anchor] of boundary.slice(0,6).entries())for(let d=0;d<6;d++){
  const prefix=shortestPath(obs.map,obs.self.cellId,id=>id===anchor.id,id=>obs.owners[id]===owner,10);if(!prefix)continue;
  let current=anchor.id;const path=[...prefix];let valid=true,leftHome=false,closed=false;
  let length=crowded?1+Math.floor(memory.random()*2):Math.max(2,Math.floor(loopLength-1+memory.random()*3));
  let width=crowded?1:Math.max(1,Math.floor(loopWidth-1+memory.random()*3));
  const bevel=crowded?0:Math.floor(memory.random()*3);
  const naturalClosure=!crowded&&memory.random()<.35;
  const shape:ExpansionShape=obs.self.personality==='DEFEND'||crowded?(naturalClosure?'NATURAL':bevel?'BEVEL':'RHOMBUS'):EXPANSION_SHAPES[(anchorIndex*6+d+memory.seq)%EXPANSION_SHAPES.length];
  // Only an explorer near observed pressure scales down. Quiet-space reach
  // and all hard path/trail/proximity limits remain intact.
  const nearestHead=Math.min(...obs.others.map(p=>hexDistance(anchor,obs.map.cells[p.cellId])));
  const downScaled=obs.self.personality==='EXPAND'&&!crowded&&nearestHead<2*(length+width)*.65;
  if(downScaled){length=Math.max(2,length-1);width=Math.max(1,width-1);}
  const trace=decisionTraces.get(memory);if(trace)(trace.expansionCandidates??=[]).push(shape);
  const sides=expansionSides(shape,d,length,width,bevel);
  for(const [direction,length]of sides){if(!valid||closed)break;for(let step=0;step<length;step++){
   const next=obs.map.cells[current].neighbors[direction];if(next<0||forbidden.has(next)){valid=false;break;}
   path.push(next);current=next;
   if(obs.owners[next]!==owner)leftHome=true;else if(leftHome){closed=true;break;}
  }
  }
  if(valid&&['NATURAL','HOOK','ASYMMETRIC'].includes(shape)&&leftHome&&!closed){
   const used=new Set(path),back=shortestPath(obs.map,current,id=>obs.owners[id]===owner,id=>!used.has(id)&&!forbidden.has(id),24-path.length);
   if(back){path.push(...back);current=back.at(-1)??current;}else valid=false;
  }
  if(!valid||path.length>24)continue;
  if(!leftHome||obs.owners[current]!==owner)continue;
  const gain=plannedCapture(obs,path),stolen=gain.filter(id=>obs.owners[id]!==0).length;
  if(!gain.length)continue;
  const external=path.filter(id=>obs.owners[id]!==owner),risk=external.reduce((sum,id)=>sum+obs.others.reduce((danger,p)=>danger+Math.max(0,4-hexDistance(obs.map.cells[id],obs.map.cells[p.cellId])),0),0);
  if(external.length>settings.trailLimit||(crowded&&external.length>6))continue;
  if(obs.others.some(enemy=>external.some(id=>hexDistance(obs.map.cells[id],obs.map.cells[enemy.cellId])<=2)))continue;
  const first=obs.map.cells[path[0]??anchor.id].center,heading=normalizeDirection(first.x-obs.self.position.x,first.y-obs.self.position.y);
  const turn=heading?1-(heading.x*obs.self.direction.x+heading.y*obs.self.direction.y):0;
  const threatDistance=Math.min(...obs.others.flatMap(enemy=>external.map(id=>hexDistance(obs.map.cells[id],obs.map.cells[enemy.cellId]))));
  const excursionRisk=obs.self.personality==='EXPAND'?Math.max(0,(external.length-threatDistance)/obs.config.moveCellsPerSecond)*settings.risk*2:0;
  const repeatPenalty=obs.self.personality!=='DEFEND'&&memory.lastExpansionShape===shape?1.5:0;
  if(trace)(trace.expansionAccepted??=[]).push(shape);
  candidates.push({path,score:gain.length*(obs.self.personality==='EXPAND'?1.25:1)+stolen*settings.steal-path.length*0.35-risk*settings.risk-turn*2-excursionRisk-repeatPenalty+memory.random()*0.5,goal:stolen>gain.length/2?'STEAL':'EXPAND',expansion:{shape,pathLength:path.length,externalLength:external.length,captureSize:gain.length,stolenCells:stolen,earlyClosed:false,downScaled,threatDistance}});
 }
 candidates.sort((a,b)=>b.score-a.score);
 const selected=candidates[0];memory.goal=selected?.goal??'RETURN';memory.attackTarget=selected?.target??null;memory.attackSlot=selected?.slot??null;
 const trace=decisionTraces.get(memory);if(trace){trace.expansionPlan=selected?.expansion;if(selected?.expansion)trace.expansionPath=[...selected.path];}
 memory.expansion=selected?.expansion;if(selected?.expansion)memory.lastExpansionShape=selected.expansion.shape;
 return selected?.path??returnPath(obs)??[];
}
export function botLookAhead(obs:BotObservation,goal:BotGoal):number {
 if(goal==='ATTACK')return 3;
 if((goal==='EXPAND'&&obs.self.personality==='DEFEND')||hexDistance(obs.map.cells[obs.self.cellId],{q:0,r:0})>=obs.map.radius-2)return 1;
 // Preserve precise local steering around observed heads and trails.
 if(obs.others.some(p=>hexDistance(obs.map.cells[p.cellId],obs.map.cells[obs.self.cellId])<=3)||obs.trails.some(t=>hexDistance(obs.map.cells[t.cellId],obs.map.cells[obs.self.cellId])<=2))return 1;
 return 2;
}
export function getBotInput(obs:BotObservation,memory:BotMemory,returnOnly=false):DirectionInput|null {
 if(obs.self.lifeState!=='ALIVE')return null;
 let finishTrace:(()=>void)|undefined,perimeterReturn=false;
 const lifeChanged=memory.plannedLifeId!==obs.self.lifeId,fromGoal=memory.goal;
 const decisionReason:BotTickMetric['reason']=lifeChanged?'LIFE':memory.nextDecisionTick<=obs.tick-1?'URGENT':'REGULAR';
 if(memory.plannedLifeId!==obs.self.lifeId){memory.path=[];memory.seq=0;memory.nextDecisionTick=0;memory.plannedLifeId=obs.self.lifeId;memory.lastCell=-1;memory.attackTarget=null;memory.attackSlot=null;memory.goal='EXPAND';memory.knownHome.clear();memory.grievances.clear();memory.expansion=undefined;memory.lastExpansionShape=undefined;}
 if(memory.lastCell!==obs.self.cellId){memory.lastCell=obs.self.cellId;memory.lastProgressTick=obs.tick;}
 const due=obs.tick>=memory.nextDecisionTick;
 if(due){
  const observer=botObservers.get(memory),trace:BotDecisionTrace|undefined=observer?{tick:obs.tick,from:memory.goal,to:memory.goal,ownTrail:obs.ownTrail.length,attackTarget:null,attacks:[]}:undefined;
  if(trace)decisionTraces.set(memory,trace);
  if(trace){trace.shadow=evaluateShadowOpportunities(obs,{path:shortestPath,seconds:shadowTravelSeconds});trace.shadow.goalBefore=memory.goal;}
  const interval=Math.max(1,Math.round(obs.config.botDecisionMs*obs.config.simulationHz/1000));
  // First life plan and perimeter recovery stay immediate. Normal decisions
  // align to slot phases without consuming AI/cosmetic RNG. Regular cadence
  // remains interval ticks; the first alignment can shorten one interval.
  const phased=botOptions(memoryVariants.get(memory)??'combined').phase&&obs.self.kind==='BOT',offset=obs.self.slot%interval;
  memory.nextDecisionTick=obs.tick+(phased?((offset-obs.tick%interval+interval)%interval||interval):interval);
  rememberIncursions(obs,memory);
  const settings=settingsFor(obs,memory),home=returnPath(obs),atHome=obs.owners[obs.self.cellId]===obs.self.slot+1;
  const danger=obs.ownTrail.length&&(obs.ownTrail.length>=settings.trailLimit||obs.others.some(p=>obs.ownTrail.some(id=>hexDistance(obs.map.cells[id],obs.map.cells[p.cellId])<=Math.max(2,Math.min(5,(home?.length??4)*settings.risk)))));
  const stuck=obs.tick-memory.lastProgressTick>=2*obs.config.simulationHz;
  const attacking=memory.goal==='ATTACK';
  const targetPresent=obs.trails.some(t=>t.cellId===memory.attackTarget&&t.slot===memory.attackSlot);
  // Preserve a viable cut instead of switching to each new urgent candidate.
  // A vanished cell may retarget only the same still-observed victim.
  const homeLost=memory.path.length>0&&obs.owners[memory.path.at(-1)!]!==obs.self.slot+1;
  const attack=!returnOnly&&!stuck&&!homeLost&&memory.goal!=='ESCAPE'?planAttack(obs,memory,true,attacking):null;
  const attackFinished=attacking&&!targetPresent&&!attack;
  const counterStrike=!!attack&&attack.seconds<=1.25&&obs.ownTrail.length<settings.trailLimit;
  const pressuredExpansion=(memory.goal==='EXPAND'||memory.goal==='STEAL')&&obs.others.some(p=>hexDistance(obs.map.cells[p.cellId],obs.map.cells[obs.self.cellId])<=6)&&obs.ownTrail.length+memory.path.filter(id=>obs.owners[id]!==obs.self.slot+1).length>6;
  const expanding=memory.goal==='EXPAND'||memory.goal==='STEAL';
  const lineDistance=Math.min(...obs.others.flatMap(p=>obs.ownTrail.map(id=>hexDistance(obs.map.cells[id],obs.map.cells[p.cellId]))));
  const riskGrew=memory.expansion&&!memory.expansion.earlyClosed&&lineDistance<=5&&lineDistance+2<(memory.expansion.threatDistance??Infinity);
  const nearingBudget=obs.ownTrail.length>=settings.trailLimit-4;
  const early=obs.self.personality==='EXPAND'&&expanding&&!returnOnly&&!danger&&!counterStrike&&!stuck&&!homeLost&&(riskGrew||nearingBudget||pressuredExpansion)?earlyClosurePath(obs,memory.path,settings.trailLimit):null;
  if(early){memory.path=early;memory.goal='RETURN';memory.attackTarget=null;memory.attackSlot=null;if(memory.expansion)memory.expansion.earlyClosed=true;if(trace)trace.earlyClosure=true;}
  if((memory.goal==='ESCAPE'||memory.goal==='RETURN')&&atHome&&!obs.ownTrail.length){memory.path=[];memory.goal='EXPAND';}
  // Escape is committed until home. Other opportunities cannot replace it.
  if(returnOnly||(danger&&!counterStrike)||(pressuredExpansion&&!counterStrike&&!early)||stuck||attackFinished||homeLost||(!atHome&&!memory.path.length)){
   if(memory.goal!=='ESCAPE'||!memory.path.length||homeLost||stuck)memory.path=home??[];
   if(trace&&attacking)trace.exitReason=returnOnly?'RETURN_ONLY':stuck?'STUCK':homeLost?'HOME_ROUTE_LOST':danger&&!counterStrike?'DANGER':!targetPresent?'TARGET_GONE':trace.attacks.find(a=>a.target===memory.attackTarget)?.reason??'NO_PLAN';
   memory.goal=danger||memory.goal==='ESCAPE'?'ESCAPE':'RETURN';memory.attackTarget=null;memory.attackSlot=null;
   if(stuck)memory.lastProgressTick=obs.tick;
  }
  const shortDetour=attack&&attack.seconds<=1.25&&home&&attack.totalSeconds<=travelSeconds(obs,obs.self,home)+.85;
  if(attack&&!early&&(!danger||counterStrike)&&(memory.goal==='EXPAND'||memory.goal==='STEAL'||memory.goal==='SEEK_POINT'||(memory.goal==='RETURN'&&shortDetour)||(memory.goal==='ATTACK'&&!targetPresent))){
   memory.path=attack.path;memory.goal='ATTACK';memory.attackTarget=attack.target;memory.attackSlot=attack.slot;
  }
  if(!memory.path.length&&returnOnly){const safe=obs.map.cells[obs.self.cellId].neighbors.filter(id=>obs.owners[id]===obs.self.slot+1);if(safe.length)memory.path=[safe[Math.floor(memory.random()*safe.length)]];}
  if(!memory.path.length&&!returnOnly&&atHome)memory.path=planExpansion(obs,memory);
  // No useful expansion: patrol an owned cell in front, never aim at (0,0).
  if(!memory.path.length){
   const safe=obs.map.cells[obs.self.cellId].neighbors.filter(id=>id>=0&&obs.owners[id]===obs.self.slot+1);
   safe.sort((a,b)=>{const score=(id:number)=>{const c=obs.map.cells[id].center,d=normalizeDirection(c.x-obs.self.position.x,c.y-obs.self.position.y)!;return d.x*obs.self.direction.x+d.y*obs.self.direction.y;};return score(b)-score(a);});
   if(safe.length)memory.path=[safe[0]];
  }
  if(trace&&observer){decisionTraces.delete(memory);finishTrace=()=>{trace.to=memory.goal;trace.attackTarget=memory.attackTarget;trace.attackSlot=memory.attackSlot;trace.personality=obs.self.personality;trace.pathLength=memory.path.length;trace.traits=memory.traits;trace.lookAheadUsed=perimeterReturn||!target?1:Math.max(1,memory.path.findIndex(id=>obs.map.cells[id].center===target)+1);
   const shadow=trace.shadow!,clear=shadow.candidates.filter(c=>c.reason==='CLEAR_KILL_OPPORTUNITY');shadow.selectedGoal=memory.goal;shadow.selectedTarget=memory.attackTarget;
   shadow.missed=clear.length>0&&!(memory.goal==='ATTACK'&&clear.some(c=>c.target===memory.attackTarget&&c.slot===memory.attackSlot));
   if(shadow.missed)shadow.event='MISSED_KILL_OPPORTUNITY';
   shadow.missedReason=!shadow.missed?null:perimeterReturn?'PERIMETER_GUARD':returnOnly?'RETURN_ONLY_BLOCK':trace.from==='ESCAPE'&&memory.goal==='ESCAPE'?'GOAL_ESCAPE_BLOCK':stuck?'STUCK_RECOVERY':homeLost?'HOME_ROUTE_LOST':memory.goal==='ATTACK'?'GOAL_ATTACK_TARGET_LOCK':danger?'DANGER_POLICY_BLOCK':trace.from==='RETURN'?'GOAL_RETURN_DETOUR_LIMIT':trace.attacks.find(a=>clear.some(c=>c.target===a.target&&c.slot===a.slot))?.reason??'CANDIDATE_OR_PRIORITY_BLOCK';
   observer(trace);};
  }
 }
 // Begin the next leg within a turn radius, before overshooting a waypoint.
 // A point-seeking bot otherwise orbits centers it cannot reach while turning.
 const reach=Math.max(Math.sqrt(3)*obs.map.side*0.18,moveSpeed(obs.config)/obs.config.turnRadiansPerSecond+moveSpeed(obs.config)/obs.config.simulationHz);
 while(memory.path.length&&obs.self.cellId===memory.path[0]&&Math.hypot(obs.map.cells[memory.path[0]].center.x-obs.self.position.x,obs.map.cells[memory.path[0]].center.y-obs.self.position.y)<reach)memory.path.shift();
 const lookAhead=botLookAhead(obs,memory.goal);
 const target=botSteeringTarget(obs.map,obs.self,memory.path,obs.config,lookAhead);
 let direction=target?normalizeDirection(target.x-obs.self.position.x,target.y-obs.self.position.y)??obs.self.direction:obs.self.direction;
 // Predict bot steering near the perimeter. Shared movement and player input
 // stay unchanged; bots start turning while there is still room to survive.
 if(hexDistance(obs.map.cells[obs.self.cellId],{q:0,r:0})>=obs.map.radius-2){
  const safe=(intent:typeof direction)=>{let position=obs.self.position,cellId=obs.self.cellId,heading=obs.self.direction;
   for(let step=0;step<Math.ceil(obs.config.simulationHz*0.65);step++){const next=stepSteering(obs.map,position,cellId,heading,intent,obs.config);if(next.blocked)return false;position=next.position;cellId=next.cellId;heading=next.direction;}return true;};
  if(!safe(direction)){
   const alternatives=obs.map.cells[obs.self.cellId].neighbors.filter(id=>id>=0).map(id=>{const c=obs.map.cells[id].center;return normalizeDirection(c.x-obs.self.position.x,c.y-obs.self.position.y)!;});
   alternatives.sort((a,b)=>(b.x*direction.x+b.y*direction.y)-(a.x*direction.x+a.y*direction.y));
   const escape=alternatives.find(safe);if(escape){direction=escape;memory.path=[];memory.goal='RETURN';memory.nextDecisionTick=obs.tick;perimeterReturn=true;}
  }
 }
 if(perimeterReturn){memory.attackTarget=null;memory.attackSlot=null;}
 finishTrace?.();
 if(due)tickObservers.get(memory)?.({tick:obs.tick,slot:obs.self.slot,lifeId:obs.self.lifeId,goal:memory.goal,from:fromGoal,reason:decisionReason,nextDecisionTick:memory.nextDecisionTick,attackTarget:memory.attackTarget,attackSlot:memory.attackSlot});
 if(!direction)return null;
 return {matchId:obs.matchId,lifeId:obs.self.lifeId,seq:++memory.seq,dx:direction.x,dy:direction.y};
}
export function botSpecs(count:number,startSlot=0,prefix='bot'){
 const personalities:Personality[]=['EXPAND','ATTACK','DEFEND','SEEK_POINT'];
 return Array.from({length:count},(_,i)=>({participantId:prefix+'-'+i,slot:startSlot+i,nickname:['영역탐험가','선사냥꾼','안전지킴이','영역도둑'][i%4],kind:'BOT' as const,personality:personalities[i%4]}));
}


