import {beginRunResolution,endRunResolution,recordBestTerritories} from './run.js';
import {slotBit} from './slots.js';
import {moveSpeed} from './config.js';
import {wallDeathTime,clearWallGraceLife} from './wall-grace.js';
import {tryRespawns} from './spawn.js';
import {finishMatch} from './scoring.js';
import {evaluateMode,roundDeadlineTicks} from './modes.js';
import type {MatchState,Participant,DirectionInput,Vec,DeathContext} from './model.js';
import {stepSteering,quantizedEventTime,normalizeDirection,type Movement} from './movement.js';
import {addTrail,clearTrail,setOwner,participantForOwner,pruneDisconnectedTerritory} from './territory.js';
import {captureCandidates} from './capture.js';
import {markDead,emitEvent,hasDeathObserver,type ResolutionDeathDiagnostic} from './life.js';
export type TickInputs = ReadonlyMap<string,DirectionInput>;
interface Motion { start:Vec; delta:Vec; movement:Movement; lifeId:number; stopT:number }
interface Entry {participantId:string;lifeId:number;cellId:number;t:number;time:number}
export interface CaptureParticipantTrace {
 participantId:string;trailCells:number[];territoryBefore:number;connectedBefore:boolean;candidate:boolean;lostTerritory:boolean;
 touchesHomeBefore:boolean;touchesHomeAfter:boolean;anyTrailTouchesHomeAfter:boolean;territoryAfterTransfer:number;ownerCellsAfterTransfer:number;
 claimedTrailCells:number[];cut:boolean;markDeadCalled:boolean;markedDead:boolean;lifeStateAfter:Participant['lifeState'];ownerCellsAfter:number;trailMaskCellsAfter:number;
 originCellId:number|null;originOwnerBefore:number|null;originOwnerAfterTransfer:number|null;firstHomeNeighborsAfterTransfer:number[];
 headCellId:number;headOwnerBefore:number;headOwnerAfterTransfer:number;headHomeNeighborsAfterTransfer:number[];strandedHomeHead:boolean;
 originOwnerBeforePrune:number|null;headOwnerBeforePrune:number;homeAnchorBeforePrune:number|null;
}
export interface CaptureResolutionTrace {tick:number;participants:CaptureParticipantTrace[]}
const captureObservers=new WeakMap<MatchState,(trace:CaptureResolutionTrace)=>void>();
// Opt-in diagnostics for real movement/server regression tests. No snapshots or
// logging work is done in ordinary games.
export function watchCaptureResolution(match:MatchState,observer:(trace:CaptureResolutionTrace)=>void):()=>void {
 captureObservers.set(match,observer);return()=>captureObservers.delete(match);
}
export function isProtected(match:MatchState,p:Participant,eventTick=match.tick):boolean {
 return p.lifeState==='ALIVE'&&eventTick<p.protectedUntilTick&&p.spawnCells.has(p.cellId)&&match.owners[p.cellId]===p.slot+1;
}
function trailTouchesHome(match:MatchState,p:Participant):boolean{
 if(p.trailOriginCellId!==null)return match.owners[p.trailOriginCellId]===p.slot+1;
 // A trail created under a stationary head by territory transfer has no
 // movement departure. Preserve its existing attachment behavior, also used
 // by direct addTrail fixtures; never infer a different origin mid-excursion.
 const first=p.trailCells.values().next().value;
 return first!==undefined&&match.map.cells[first].neighbors.some(id=>id>=0&&match.owners[id]===p.slot+1);
}
export function applySimultaneousCaptures(match:MatchState,returners:Participant[],eventTick=match.tick,iteration=0):void {
 beginRunResolution(match);try{
 const ordered=[...returners].sort((a,b)=>match.priority.indexOf(a.slot)-match.priority.indexOf(b.slot));
 const candidates=new Map<Participant,Set<number>>();
 for(const p of ordered)if(p.lifeState==='ALIVE'&&p.trailCells.size&&match.owners[p.cellId]===p.slot+1)candidates.set(p,captureCandidates(match,p));
 if(!candidates.size)return;
 const audit=hasDeathObserver(match),ownersBefore=audit?[...match.owners]:[],trailMasksBefore=audit?[...match.trailMasks]:[],trailsBefore=audit?new Map(match.participants.map(p=>[p,[...p.trailCells]])):null;
 const connectedBefore=new Set(match.participants.filter(p=>p.lifeState==='ALIVE'&&!candidates.has(p)&&p.trailCells.size&&trailTouchesHome(match,p)));
 // A closed excursion has no trail yet. Losing the home under its head to
 // capture or pruning must not create an already disconnected trail afterward.
 const homeHeadsBefore=new Set(match.participants.filter(p=>p.lifeState==='ALIVE'&&!candidates.has(p)&&!p.trailCells.size&&match.owners[p.cellId]===p.slot+1));
 const strandedHomeHeads=new Set<Participant>();
 const observer=captureObservers.get(match);const trace:CaptureParticipantTrace[]|null=observer?match.participants.map(p=>({
  participantId:p.participantId,trailCells:[...p.trailCells],territoryBefore:p.territoryCount,connectedBefore:connectedBefore.has(p),candidate:candidates.has(p),
  touchesHomeBefore:trailTouchesHome(match,p),lostTerritory:false,touchesHomeAfter:false,anyTrailTouchesHomeAfter:false,territoryAfterTransfer:0,ownerCellsAfterTransfer:0,
  claimedTrailCells:[],cut:false,markDeadCalled:false,markedDead:false,lifeStateAfter:p.lifeState,ownerCellsAfter:0,trailMaskCellsAfter:0,
  originCellId:p.trailOriginCellId,originOwnerBefore:p.trailOriginCellId===null?null:match.owners[p.trailOriginCellId],originOwnerAfterTransfer:null,firstHomeNeighborsAfterTransfer:[],
  headCellId:p.cellId,headOwnerBefore:match.owners[p.cellId],headOwnerAfterTransfer:match.owners[p.cellId],headHomeNeighborsAfterTransfer:[],strandedHomeHead:false,
  originOwnerBeforePrune:null,headOwnerBeforePrune:match.owners[p.cellId],homeAnchorBeforePrune:null
 })):null;
 const winners=new Map<number,Participant>(),gained=new Map<Participant,number>();
 for(const [p,cells]of candidates)for(const id of cells)if(!winners.has(id))winners.set(id,p);
 // Freeze capture contacts before transferring ownership or closing anyone's trail.
 // The winning captured cell cuts exposed enemy trails just like direct head contact.
 const cuts=new Map<Participant,Set<Participant>>();
 const cutContexts=new Map<Participant,Map<Participant,DeathContext>>();
 for(const [id,attacker]of winners)for(const victim of match.participants){
  if(victim!==attacker&&victim.lifeState==='ALIVE'&&(match.trailMasks[id]&(slotBit(victim.slot)))){
   const attackers=cuts.get(victim)??new Set<Participant>();attackers.add(attacker);cuts.set(victim,attackers);
   const contexts=cutContexts.get(victim)??new Map<Participant,DeathContext>();if(!contexts.has(attacker))contexts.set(attacker,{cause:'TRAIL_CAPTURE',cellId:id,eventTick});cutContexts.set(victim,contexts);
  }
 }
 const lostTerritory=new Set<Participant>(),territoryAttackers=new Map<Participant,Set<Participant>>();
 for(const [id,p]of winners){if(match.owners[id]!==p.slot+1){
  gained.set(p,(gained.get(p)??0)+1);const previous=participantForOwner(match,match.owners[id]);if(previous){lostTerritory.add(previous);const attackers=territoryAttackers.get(previous)??new Set<Participant>();attackers.add(p);territoryAttackers.set(previous,attackers);}
 }setOwner(match,id,p.slot+1);}
 // Prune only after all simultaneous winners have been applied. A surviving
 // excursion origin (or a head still at home) is the actual home component;
 // choosing a larger distant component must not manufacture a home cut.
 for(const p of lostTerritory){
  const owner=p.slot+1,first=p.trailCells.values().next().value;
  const home=p.trailCells.size&&!candidates.has(p)
   ?p.trailOriginCellId??(first===undefined?null:match.map.cells[first].neighbors.find(id=>id>=0&&match.owners[id]===owner)??null)
   :match.owners[p.cellId]===owner?p.cellId:match.map.cells[p.cellId]?.neighbors.find(id=>id>=0&&match.owners[id]===owner)??null;
  const anchor=home!==null&&match.owners[home]===owner?home:null;
  const record=trace?.find(r=>r.participantId===p.participantId);if(record){record.originOwnerBeforePrune=p.trailOriginCellId===null?null:match.owners[p.trailOriginCellId];record.headOwnerBeforePrune=match.owners[p.cellId];record.homeAnchorBeforePrune=anchor;}
  pruneDisconnectedTerritory(match,p,anchor??undefined);
 }
 // Capturing the actual home attachment cuts an excursion even without
 // painting its trail. An intact attachment was preserved during pruning above.
 for(const victim of lostTerritory){
  // A captured head may start a trail only while still attached to its home.
  // Zero-territory deaths continue through their existing resolution path.
  const stranded=homeHeadsBefore.has(victim)&&victim.territoryCount>0&&match.owners[victim.cellId]!==victim.slot+1&&
   !match.map.cells[victim.cellId].neighbors.some(id=>id>=0&&match.owners[id]===victim.slot+1);
  if(stranded)strandedHomeHeads.add(victim);
  if(!stranded&&!(connectedBefore.has(victim)&&!trailTouchesHome(match,victim)))continue;
  const attackers=cuts.get(victim)??new Set<Participant>();for(const attacker of territoryAttackers.get(victim)!)attackers.add(attacker);cuts.set(victim,attackers);
  const contexts=cutContexts.get(victim)??new Map<Participant,DeathContext>();for(const attacker of territoryAttackers.get(victim)!)if(!contexts.has(attacker))contexts.set(attacker,{cause:'HOME_CAPTURE',cellId:victim.trailOriginCellId??victim.trailCells.values().next().value??victim.cellId,eventTick});cutContexts.set(victim,contexts);
 }
 if(trace)for(const record of trace){const p=match.participants.find(p=>p.participantId===record.participantId)!;
  record.lostTerritory=lostTerritory.has(p);record.touchesHomeAfter=trailTouchesHome(match,p);record.anyTrailTouchesHomeAfter=[...p.trailCells].some(id=>match.map.cells[id].neighbors.some(n=>n>=0&&match.owners[n]===p.slot+1));
  record.territoryAfterTransfer=p.territoryCount;record.ownerCellsAfterTransfer=match.owners.reduce((sum,owner)=>sum+Number(owner===p.slot+1),0);record.cut=cuts.has(p);
  record.claimedTrailCells=record.trailCells.filter(id=>winners.has(id)&&winners.get(id)!==p);
  record.originOwnerAfterTransfer=record.originCellId===null?null:match.owners[record.originCellId];record.firstHomeNeighborsAfterTransfer=record.trailCells.length?match.map.cells[record.trailCells[0]].neighbors.filter(id=>id>=0&&match.owners[id]===p.slot+1):[];
  record.headOwnerAfterTransfer=match.owners[p.cellId];record.headHomeNeighborsAfterTransfer=match.map.cells[p.cellId].neighbors.filter(id=>id>=0&&match.owners[id]===p.slot+1);record.strandedHomeHead=strandedHomeHeads.has(p);
 }
 for(const p of candidates.keys()){clearTrail(match,p);emitEvent(match,{type:'CAPTURE',participantId:p.participantId,amount:gained.get(p)??0});}
 recordBestTerritories(match);
 // All simultaneous claims remain resolved against the same base state. One death
 // and one credited killer per victim, including attackers killed in this batch.
 for(const victim of [...cuts.keys()].sort((a,b)=>match.priority.indexOf(a.slot)-match.priority.indexOf(b.slot))){
  const killer=[...cuts.get(victim)!].sort((a,b)=>match.priority.indexOf(a.slot)-match.priority.indexOf(b.slot))[0];
  const record=trace?.find(p=>p.participantId===victim.participantId);if(record)record.markDeadCalled=true;
  const diagnostic:ResolutionDeathDiagnostic|undefined=audit?{eventTick,iteration,ownersBefore,trailMasksBefore,pendingTrails:[],victimTrailBefore:trailsBefore!.get(victim)!,existingTrailContact:false,pendingTrailContact:false,captureOverlapCells:trailsBefore!.get(victim)!.filter(id=>winners.has(id)&&winners.get(id)!==victim),wallIntersection:false}:undefined;
  const marked=markDead(match,victim,'TRAIL_CUT',killer,cutContexts.get(victim)?.get(killer),diagnostic);if(record)record.markedDead=marked;
 }
 if(trace&&observer){for(const record of trace){const p=match.participants.find(p=>p.participantId===record.participantId)!;record.lifeStateAfter=p.lifeState;
  record.ownerCellsAfter=match.owners.reduce((sum,owner)=>sum+Number(owner===p.slot+1),0);record.trailMaskCellsAfter=match.trailMasks.reduce((sum,mask)=>sum+Number((mask&(slotBit(p.slot)))!==0),0);
 }observer({tick:match.tick,participants:trace});}
 }finally{endRunResolution(match);}
}
export function resolveAtTime(match:MatchState,eventTick=match.tick,wallVictims:ReadonlySet<string>=new Set()):void {
 beginRunResolution(match);try{
 for(let iteration=0;iteration<32;iteration++){
  const ordered=[...match.participants].sort((a,b)=>match.priority.indexOf(a.slot)-match.priority.indexOf(b.slot));
  const alive=ordered.filter(p=>p.lifeState==='ALIVE');
  const existingMasks=match.trailMasks.slice(),masks=existingMasks.slice(),pending=new Map<Participant,number>();
  for(const p of alive){
   if(!isProtected(match,p,eventTick))p.protectedUntilTick=0;
   if(match.owners[p.cellId]!==p.slot+1){
    p.protectedUntilTick=0;
    if(!p.trailCells.has(p.cellId))pending.set(p,p.cellId);
    masks[p.cellId]|=slotBit(p.slot);
   }
  }
  const deaths=new Map<Participant,Participant[]>();
  for(const attacker of alive){
   if(isProtected(match,attacker,eventTick))continue;
   for(const victim of alive)if(victim!==attacker&&(masks[attacker.cellId]&(slotBit(victim.slot)))){
    const attackers=deaths.get(victim)??[];attackers.push(attacker);deaths.set(victim,attackers);
   }
  }
  const audit=hasDeathObserver(match)&&(deaths.size>0||wallVictims.size>0||alive.some(p=>p.territoryCount===0||(p.trailCells.size&&match.owners[p.cellId]===p.slot+1)));
  const ownersBefore=audit?[...match.owners]:[],trailMasksBefore=audit?[...existingMasks]:[],pendingTrails=audit?[...pending].map(([p,cellId])=>({participantId:p.participantId,cellId})):[];
  const diagnostics=audit?new Map<Participant,ResolutionDeathDiagnostic>(alive.map(p=>[p,{eventTick,iteration,ownersBefore,trailMasksBefore,pendingTrails,victimTrailBefore:[...p.trailCells],existingTrailContact:false,pendingTrailContact:false,captureOverlapCells:[],wallIntersection:wallVictims.has(p.participantId)}])):null;
  for(const [victim,attackers]of deaths){
   attackers.sort((a,b)=>match.priority.indexOf(a.slot)-match.priority.indexOf(b.slot));
   const attacker=attackers[0],existing=(existingMasks[attacker.cellId]&(slotBit(victim.slot)))!==0,provisional=pending.get(victim)===attacker.cellId;
   const diagnostic=diagnostics?.get(victim);if(diagnostic){diagnostic.existingTrailContact=existing;diagnostic.pendingTrailContact=provisional;}
   markDead(match,victim,'TRAIL_CUT',attacker,{cause:existing?'EXISTING_TRAIL_CONTACT':'PENDING_TRAIL_CONTACT',cellId:attacker.cellId,eventTick},diagnostic);
  }
  let wallDeaths=0;
  for(const p of alive)if(wallVictims.has(p.participantId)&&markDead(match,p,'WALL_HIT',undefined,{cause:'WALL_HIT',cellId:p.cellId,eventTick},diagnostics?.get(p)))wallDeaths++;
  for(const [p,id]of pending)if(p.lifeState==='ALIVE')addTrail(match,p,id);
  const returners=ordered.filter(p=>p.lifeState==='ALIVE'&&p.trailCells.size&&match.owners[p.cellId]===p.slot+1);
  applySimultaneousCaptures(match,returners,eventTick,iteration);
  let territoryDeaths=0;
  for(const p of ordered)if(p.lifeState==='ALIVE'&&p.territoryCount===0){markDead(match,p,'TERRITORY_LOST',undefined,{cause:'TERRITORY_LOST',cellId:p.cellId,eventTick},diagnostics?.get(p));territoryDeaths++;}
  if(!deaths.size&&!pending.size&&!returners.length&&!territoryDeaths&&!wallDeaths){const outcome=evaluateMode(match,eventTick);if(outcome)finishMatch(match,outcome);return;}
 }
 throw new Error('Derived event limit');
 }finally{endRunResolution(match);}
}
export function advanceMovement(match:MatchState,inputs:TickInputs=new Map()):void {
 if(match.phase!=='RUNNING')return;
 const motions=new Map<string,Motion>(),entries:Entry[]=[],wallEntries:Entry[]=[];
 const distance=moveSpeed(match.config)/match.config.simulationHz;
 for(const p of match.participants){
  if(p.lifeState!=='ALIVE'){clearWallGraceLife(match,p);continue;}
  const input=inputs.get(p.participantId);
  if(input&&input.matchId===match.matchId&&input.lifeId===p.lifeId&&Number.isSafeInteger(input.seq)&&input.seq>p.lastAppliedInputSeq){
   const direction=normalizeDirection(input.dx,input.dy);if(direction)p.targetDirection=direction;
   if(Number.isFinite(input.dx)&&Number.isFinite(input.dy))p.lastAppliedInputSeq=input.seq;
  }
  const start={...p.position},movement=stepSteering(match.map,start,p.cellId,p.direction,p.targetDirection,match.config);
  p.direction=movement.direction;
  const delta={x:p.direction.x*distance,y:p.direction.y*distance};
  const stopT=movement.blocked?Math.min(1,Math.hypot(movement.position.x-start.x,movement.position.y-start.y)/distance):1;
  motions.set(p.participantId,{start,delta,movement,lifeId:p.lifeId,stopT});
  for(const e of movement.entries)entries.push({participantId:p.participantId,lifeId:p.lifeId,cellId:e.cellId,t:e.t,time:quantizedEventTime(e.t,match.config.simulationHz)});
  const deathT=wallDeathTime(match,p,start,movement);
  if(deathT!==null)wallEntries.push({participantId:p.participantId,lifeId:p.lifeId,cellId:movement.cellId,t:deathT,time:quantizedEventTime(deathT,match.config.simulationHz)});
 }
 entries.sort((a,b)=>a.time-b.time);
 const groups=new Map<number,Entry[]>([[0,[]]]);
 for(const e of entries){const group=groups.get(e.time)??[];group.push(e);groups.set(e.time,group);}
 for(const e of wallEntries)if(!groups.has(e.time))groups.set(e.time,[]);
 const deadline=roundDeadlineTicks(match),finalTick=deadline!==null&&match.tick+1>=deadline;
 for(const [time,group] of [...groups].sort((a,b)=>a[0]-b[0])){
  if(match.phase!=='RUNNING')break;
  if(finalTick&&time>=quantizedEventTime(1,match.config.simulationHz))continue;
  const fraction=Math.min(1,time*match.config.simulationHz/1e6);
  for(const p of match.participants){const motion=motions.get(p.participantId);
   if(motion&&p.lifeState==='ALIVE'&&p.lifeId===motion.lifeId){const t=Math.min(fraction,motion.stopT);p.position={x:motion.start.x+motion.delta.x*t,y:motion.start.y+motion.delta.y*t};}
  }
  for(const e of group){const p=match.participants.find(p=>p.participantId===e.participantId);
   if(p&&p.lifeState==='ALIVE'&&p.lifeId===e.lifeId){
    if(!p.trailCells.size&&p.trailOriginCellId===null&&match.owners[p.cellId]===p.slot+1&&match.owners[e.cellId]!==p.slot+1)p.trailOriginCellId=p.cellId;
    p.cellId=e.cellId;
   }
  }
  const walls=new Set(wallEntries.filter(e=>e.time===time&&match.participants.some(p=>p.participantId===e.participantId&&p.lifeId===e.lifeId&&p.lifeState==='ALIVE')).map(e=>e.participantId));
  // The time key is quantized; preserve the exact inside-boundary impact position.
  for(const p of match.participants)if(walls.has(p.participantId))p.position={...motions.get(p.participantId)!.movement.position};
  resolveAtTime(match,match.tick+fraction,walls);
 }
 if(match.phase==='RUNNING')for(const p of match.participants){const motion=motions.get(p.participantId);if(motion&&p.lifeState==='ALIVE'&&p.lifeId===motion.lifeId)p.position={...motion.movement.position};}
}
export function stepMatch(match:MatchState,inputs:TickInputs=new Map()):void {
 if(match.phase!=='RUNNING')return;
 tryRespawns(match);advanceMovement(match,inputs);match.tick++;
 const outcome=evaluateMode(match);if(outcome)finishMatch(match,outcome);
}





