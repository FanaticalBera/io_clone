import type {MatchState,Participant,GameEvent} from './model.js';
import {hexDistance} from './hex.js';
// AI-only facts. No positions, trails, or capture cells cross this boundary.
export type BotEvent = {id:number;tick:number;type:'DEATH';victimId:string;lifeId:number;killerId?:string}
 | {id:number;tick:number;type:'LOSS';victimId:string;attackerId:string;cells:number};
const journals=new WeakMap<MatchState,BotEvent[]>();
function append(match:MatchState,events:BotEvent[]){
 const journal=journals.get(match)??[];journal.push(...events);
 // Runtime directors consume every tick, including while a bot is dead.
 while(journal.length&&journal[0].tick<match.tick-match.config.simulationHz)journal.shift();
 journals.set(match,journal);
}
export function recordBotDeath(match:MatchState,event:GameEvent){
 if(event.type==='DEATH')append(match,[{id:match.eventCounter,tick:event.tick,type:'DEATH',victimId:event.participantId,lifeId:event.lifeId??0,killerId:event.killerId}]);
}
export function recordBotCapture(match:MatchState,attacker:Participant,transfers:ReadonlyMap<Participant,number>){
 append(match,[...transfers].map(([victim,cells])=>({id:match.eventCounter,tick:match.tick,type:'LOSS' as const,victimId:victim.participantId,attackerId:attacker.participantId,cells})));
}
export function botEvents(match:MatchState,selfId:string):readonly BotEvent[]{
 return (journals.get(match)??[]).filter(e=>e.type==='DEATH'||e.victimId===selfId);
}
export function observedCaptureLosses(match:MatchState,winners:ReadonlyMap<number,Participant>):Map<Participant,Map<Participant,number>>{
 const losses=new Map<Participant,Map<Participant,number>>();
 for(const [cellId,attacker] of winners){
  const victim=match.participants.find(p=>p.slot+1===match.owners[cellId]);
  if(!victim||victim===attacker||victim.lifeState!=='ALIVE'||!match.map.cells[victim.cellId]||hexDistance(match.map.cells[victim.cellId],match.map.cells[cellId])>match.config.botObservationRange)continue;
  const byVictim=losses.get(attacker)??new Map<Participant,number>();byVictim.set(victim,(byVictim.get(victim)??0)+1);losses.set(attacker,byVictim);
 }
 return losses;
}
