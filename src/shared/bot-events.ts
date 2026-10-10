import type {MatchState,Participant,GameEvent} from './model.js';
import {hexDistance} from './hex.js';
// AI-only public ownership facts. Never include hidden heads, trails or intent.
export type BotCaptureLoss={cellIds:number[];observedCells:number};
export type BotEvent = {id:number;tick:number;type:'DEATH';victimId:string;lifeId:number;killerId?:string}
 | {id:number;tick:number;type:'LOSS';victimId:string;attackerId:string;cells:number;cellIds:readonly number[];observedCells:number};
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
export function recordBotCapture(match:MatchState,attacker:Participant,transfers:ReadonlyMap<Participant,BotCaptureLoss>){
 append(match,[...transfers].map(([victim,loss])=>({id:match.eventCounter,tick:match.tick,type:'LOSS' as const,victimId:victim.participantId,attackerId:attacker.participantId,cells:loss.cellIds.length,cellIds:loss.cellIds,observedCells:loss.observedCells})));
}
export function botEvents(match:MatchState,selfId:string):readonly BotEvent[]{
 return (journals.get(match)??[]).filter(e=>e.type==='DEATH'||e.victimId===selfId);
}
// Capture the actual attacker and prior owner BEFORE simultaneous transfers.
// Remote public losses remain facts; only the local count feeds pressure.
export function captureLosses(match:MatchState,winners:ReadonlyMap<number,Participant>):Map<Participant,Map<Participant,BotCaptureLoss>>{
 const losses=new Map<Participant,Map<Participant,BotCaptureLoss>>(),byOwner=new Map(match.participants.map(p=>[p.slot+1,p]));
 for(const [cellId,attacker] of winners){
  const victim=byOwner.get(match.owners[cellId]);
  if(!victim||victim===attacker||victim.lifeState!=='ALIVE')continue;
  const byVictim=losses.get(attacker)??new Map<Participant,BotCaptureLoss>(),loss=byVictim.get(victim)??{cellIds:[],observedCells:0};
  loss.cellIds.push(cellId);
  if(match.map.cells[victim.cellId]&&hexDistance(match.map.cells[victim.cellId],match.map.cells[cellId])<=match.config.botObservationRange)loss.observedCells++;
  byVictim.set(victim,loss);losses.set(attacker,byVictim);
 }
 return losses;
}
