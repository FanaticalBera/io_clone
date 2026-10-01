import type {MatchState,Participant,GameEvent,ResultRow} from './model.js';
import {clearTrail,neutralizeTerritory} from './territory.js';
export function emitEvent(match:MatchState,event:Omit<GameEvent,'eventId'|'tick'>):void {
 match.events.push({...event,eventId:match.matchId+':'+(++match.eventCounter),tick:match.tick});
 match.events=match.events.filter(e=>e.tick>=match.tick-match.config.simulationHz).slice(-64);
}
export function markDead(match:MatchState,p:Participant,reason:string,killer?:Participant):boolean {
 if(p.lifeState!=='ALIVE'||match.phase!=='RUNNING')return false;
 clearTrail(match,p);neutralizeTerritory(match,p);p.lifeState='DEAD_WAIT';p.deaths++;
 match.modeState.holds=match.modeState.holds.filter(h=>h.participantId!==p.participantId);
 p.deathReason=reason;p.protectedUntilTick=0;p.lastAppliedInputSeq=0;p.targetDirection=null;
 p.respawnAtTick=match.tick+Math.ceil(match.config.respawnSeconds*match.config.simulationHz);
 if(killer&&killer.participantId!==p.participantId)killer.kills++;
 emitEvent(match,{type:'DEATH',participantId:p.participantId,reason,lifeId:p.lifeId,position:{...p.position},...(killer&&killer.participantId!==p.participantId?{killerId:killer.participantId}:{})});return true;
}
export function leaveParticipant(match:MatchState,p:Participant):void {
 if(match.departed.some(row=>row.participantId===p.participantId))return;
 clearTrail(match,p);neutralizeTerritory(match,p);p.lifeState='FINISHED';p.protectedUntilTick=0;
 match.modeState.holds=match.modeState.holds.filter(h=>h.participantId!==p.participantId);
 const row:ResultRow={participantId:p.participantId,nickname:p.nickname,kind:p.kind,score:p.controlScore,territory:0,
 controlScore:p.controlScore,kills:p.kills,deaths:p.deaths,rank:null,status:'LEFT'};
 match.departed.push(row);
}
