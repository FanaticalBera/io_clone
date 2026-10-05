import {slotBit} from './slots.js';
import type {MatchState,Participant,GameEvent,ResultRow,DeathContext,Vec} from './model.js';
import {clearTrail,neutralizeTerritory} from './territory.js';
export function emitEvent(match:MatchState,event:Omit<GameEvent,'eventId'|'tick'>):void {
 match.events.push({...event,eventId:match.matchId+':'+(++match.eventCounter),tick:match.tick});
 match.events=match.events.filter(e=>e.tick>=match.tick-match.config.simulationHz).slice(-64);
}
export interface ResolutionDeathDiagnostic {eventTick:number;iteration:number;ownersBefore:number[];trailMasksBefore:number[];pendingTrails:{participantId:string;cellId:number}[];victimTrailBefore:number[];existingTrailContact:boolean;pendingTrailContact:boolean;captureOverlapCells:number[];wallIntersection:boolean}
export interface DeathTrace {tick:number;victimId:string;victimKind:Participant['kind'];lifeId:number;reason:string;context?:DeathContext;killerId?:string;killerCell?:number;victimCell:number;position:Vec;trailCells:number[];territoryCount:number;ownerCells:number;trailMaskCells:number[];rootHomeNeighbors:number[];pendingContact:boolean;originCellId:number|null;originOwner:number|null;diagnostic?:ResolutionDeathDiagnostic}
const deathObservers=new WeakMap<MatchState,(trace:DeathTrace)=>void>();
export function watchDeaths(match:MatchState,observer:(trace:DeathTrace)=>void):()=>void {
 deathObservers.set(match,observer);return()=>deathObservers.delete(match);
}
export function hasDeathObserver(match:MatchState):boolean{return deathObservers.has(match);}
export function markDead(match:MatchState,p:Participant,reason:string,killer?:Participant,context?:DeathContext,diagnostic?:ResolutionDeathDiagnostic):boolean {
 if(p.lifeState!=='ALIVE'||match.phase!=='RUNNING')return false;
 const observer=deathObservers.get(match);
 if(observer){const first=p.trailCells.values().next().value;observer({tick:match.tick,victimId:p.participantId,victimKind:p.kind,lifeId:p.lifeId,reason,context,killerId:killer?.participantId,killerCell:killer?.cellId,victimCell:p.cellId,position:{...p.position},trailCells:[...p.trailCells],territoryCount:p.territoryCount,
  ownerCells:match.owners.reduce((sum,owner)=>sum+Number(owner===p.slot+1),0),trailMaskCells:match.map.cells.filter(c=>(match.trailMasks[c.id]&(slotBit(p.slot)))!==0).map(c=>c.id),
  rootHomeNeighbors:first===undefined?[]:match.map.cells[first].neighbors.filter(id=>id>=0&&match.owners[id]===p.slot+1),pendingContact:diagnostic?.pendingTrailContact??(context?.cause==='PENDING_TRAIL_CONTACT'),originCellId:p.trailOriginCellId,originOwner:p.trailOriginCellId===null?null:match.owners[p.trailOriginCellId],diagnostic});}
 clearTrail(match,p);neutralizeTerritory(match,p);p.lifeState='DEAD_WAIT';p.deaths++;
 match.modeState.holds=match.modeState.holds.filter(h=>h.participantId!==p.participantId);
 p.deathReason=reason;p.deathContext=context?{...context}:undefined;p.protectedUntilTick=0;p.lastAppliedInputSeq=0;p.targetDirection=null;
 p.respawnAtTick=match.tick+Math.ceil(match.config.respawnSeconds*match.config.simulationHz);
 if(killer&&killer.participantId!==p.participantId)killer.kills++;
 emitEvent(match,{type:'DEATH',participantId:p.participantId,reason,lifeId:p.lifeId,position:{...p.position},...(context?{deathContext:{...context}}:{}),...(killer&&killer.participantId!==p.participantId?{killerId:killer.participantId}:{})});return true;
}
export function leaveParticipant(match:MatchState,p:Participant):void {
 if(match.departed.some(row=>row.participantId===p.participantId))return;
 clearTrail(match,p);neutralizeTerritory(match,p);p.lifeState='FINISHED';p.protectedUntilTick=0;
 match.modeState.holds=match.modeState.holds.filter(h=>h.participantId!==p.participantId);
 const row:ResultRow={participantId:p.participantId,nickname:p.nickname,kind:p.kind,score:p.controlScore,territory:0,
 controlScore:p.controlScore,kills:p.kills,deaths:p.deaths,rank:null,status:'LEFT'};
 match.departed.push(row);
}
